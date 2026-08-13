import type { PgClientLike, PgPoolLike, PgQueryable } from "../../db/pg";
import { sha256Hex, type PersistedEvaluationResult } from "./contracts.ts";
import {
  PlatformConflictError,
  type CreateBatchInput,
  type PersistEvaluationInput,
  type PersistOverrideInput,
} from "./repository.ts";

type EvaluationRow = {
  id: string;
  result_json: string | null;
  result_sha256: string | null;
  result_version: number;
  decision: string;
};

type OverrideRow = {
  id: string;
  asset_evaluation_id: string;
  original_decision: string;
  human_decision: string;
  reason_code: string;
  evidence_note: string;
  reviewer_id: string;
  request_id: string | null;
  idempotency_key: string | null;
  base_evaluation_version: number | null;
  resulting_evaluation_version: number | null;
  created_at: string;
};

type BatchRow = { id: string; request_sha256: string | null };

export const JOB_STATUSES = [
  "RUNNING",
  "SUCCEEDED",
  "RETRY_PENDING",
  "FAILED",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export type RecordJobStateInput = {
  jobId: string;
  status: JobStatus;
  attempt: number;
  requestId: string;
  evaluationId?: string;
  errorCode?: string;
};

type JobRow = {
  id: string;
  status: JobStatus;
  attempt_count: number;
  request_id: string | null;
  evaluation_id: string | null;
  error_code: string | null;
  state_version: number;
  last_state_key: string;
};

export class PostgresJobStateError extends Error {
  readonly code: "JOB_STATE_CONFLICT" | "JOB_NOT_FOUND";

  constructor(
    message: string,
    code: "JOB_STATE_CONFLICT" | "JOB_NOT_FOUND",
  ) {
    super(message);
    this.code = code;
  }
}

function batchRequestFingerprintSource(input: CreateBatchInput): string {
  return JSON.stringify({
    scenario: input.scenario,
    commercialTemplateId: input.commercialTemplateId ?? null,
    commercialTemplateVersion: input.commercialTemplateVersion ?? null,
    lockedAttributes: [...input.lockedAttributes].sort(),
    assets: input.assets
      .map((asset) => ({
        id: asset.id,
        role: asset.role,
        position: asset.position,
        sha256: asset.sha256.toLowerCase(),
        sourceUrl: asset.sourceUrl,
        productLabel: asset.productLabel,
        mimeType: asset.mimeType ?? null,
        byteSize: asset.byteSize ?? null,
        objectKey: asset.r2Key ?? null,
      }))
      .sort(
        (left, right) =>
          left.role.localeCompare(right.role) ||
          left.position - right.position ||
          left.id.localeCompare(right.id),
      ),
  });
}

function isSameOverride(row: OverrideRow, input: PersistOverrideInput): boolean {
  return (
    row.asset_evaluation_id === input.evaluationId &&
    row.original_decision === input.originalDecision &&
    row.human_decision === input.humanDecision &&
    row.reason_code === input.reasonCode &&
    row.evidence_note === input.evidenceNote &&
    row.reviewer_id === input.actorId &&
    row.base_evaluation_version === input.baseEvaluationVersion
  );
}

async function first<T>(
  db: PgQueryable,
  sql: string,
  values: readonly unknown[],
): Promise<T | null> {
  return (await db.query<T>(sql, values)).rows[0] ?? null;
}

async function inTransaction<T>(
  pool: PgPoolLike,
  operation: (client: PgClientLike) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the business/database error that caused rollback.
    }
    throw error;
  } finally {
    client.release();
  }
}

function pgCode(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}

function jobStateKey(input: RecordJobStateInput): string {
  return JSON.stringify({
    jobId: input.jobId,
    status: input.status,
    attempt: input.attempt,
    requestId: input.requestId,
    evaluationId: input.evaluationId ?? null,
    errorCode: input.errorCode ?? null,
  });
}

function isAllowedJobTransition(
  current: JobRow,
  next: RecordJobStateInput,
): boolean {
  if (current.status === "RUNNING") {
    return (
      next.attempt === current.attempt_count &&
      ["SUCCEEDED", "RETRY_PENDING", "FAILED"].includes(next.status)
    );
  }
  if (current.status === "RETRY_PENDING") {
    return (
      next.status === "RUNNING" &&
      next.attempt === current.attempt_count + 1
    );
  }
  return false;
}

export async function recordJobStatePg(
  pool: PgPoolLike,
  input: RecordJobStateInput,
): Promise<{
  id: string;
  created: boolean;
  stateVersion: number;
  status: JobStatus;
}> {
  if (
    !input.jobId ||
    !input.requestId ||
    !Number.isInteger(input.attempt) ||
    input.attempt < 1 ||
    !JOB_STATUSES.includes(input.status)
  ) {
    throw new PostgresJobStateError(
      "任务状态输入无效",
      "JOB_STATE_CONFLICT",
    );
  }
  if (input.status === "SUCCEEDED" && !input.evaluationId) {
    throw new PostgresJobStateError(
      "成功状态必须关联 evaluationId",
      "JOB_STATE_CONFLICT",
    );
  }
  if (
    ["FAILED", "RETRY_PENDING"].includes(input.status) &&
    !input.errorCode
  ) {
    throw new PostgresJobStateError(
      "失败或重试状态必须包含 errorCode",
      "JOB_STATE_CONFLICT",
    );
  }

  return inTransaction(pool, async (client) => {
    const stateKey = jobStateKey(input);
    const current = await first<JobRow>(
      client,
      `SELECT id,status,attempt_count,request_id,evaluation_id,error_code,
              state_version,last_state_key
       FROM evaluation_jobs WHERE id=$1 FOR UPDATE`,
      [input.jobId],
    );

    if (current?.last_state_key === stateKey) {
      return {
        id: current.id,
        created: false,
        stateVersion: current.state_version,
        status: current.status,
      };
    }

    if (!current && input.status !== "RUNNING") {
      throw new PostgresJobStateError(
        "任务必须从 RUNNING 开始记录",
        "JOB_NOT_FOUND",
      );
    }
    if (current && !isAllowedJobTransition(current, input)) {
      throw new PostgresJobStateError(
        `不允许从 ${current.status}#${current.attempt_count} 转移到 ${input.status}#${input.attempt}`,
        "JOB_STATE_CONFLICT",
      );
    }

    const nextVersion = current ? current.state_version + 1 : 1;
    if (!current) {
      await client.query(
        `INSERT INTO evaluation_jobs
         (id,tenant_id,run_id,asset_id,status,attempt_count,next_retry_at,
          error_code,request_id,evaluation_id,state_version,last_state_key,
          idempotency_key)
         VALUES ($1,NULL,NULL,NULL,$2,$3,NULL,$4,$5,$6,1,$7,$1)`,
        [
          input.jobId,
          input.status,
          input.attempt,
          input.errorCode ?? null,
          input.requestId,
          input.evaluationId ?? null,
          stateKey,
        ],
      );
    } else {
      const updated = await client.query<{ state_version: number }>(
        `UPDATE evaluation_jobs
         SET status=$1,attempt_count=$2,error_code=$3,request_id=$4,
             evaluation_id=$5,state_version=state_version+1,
             last_state_key=$6,updated_at=CURRENT_TIMESTAMP
         WHERE id=$7 AND state_version=$8
         RETURNING state_version`,
        [
          input.status,
          input.attempt,
          input.errorCode ?? null,
          input.requestId,
          input.evaluationId ?? null,
          stateKey,
          input.jobId,
          current.state_version,
        ],
      );
      if (
        updated.rowCount !== 1 ||
        updated.rows[0]?.state_version !== nextVersion
      ) {
        throw new PostgresJobStateError(
          "任务状态版本发生变化",
          "JOB_STATE_CONFLICT",
        );
      }
    }

    await client.query(
      `INSERT INTO audit_events
       (request_id,tenant_id,entity_type,entity_id,action,actor_id,payload_json)
       VALUES ($1,NULL,'evaluation_job',$2,'STATE_RECORDED',
               'aliyun-fc-task',$3)`,
      [
        input.requestId,
        input.jobId,
        JSON.stringify({
          status: input.status,
          attempt: input.attempt,
          evaluation_id: input.evaluationId ?? null,
          error_code: input.errorCode ?? null,
          state_version: nextVersion,
        }),
      ],
    );
    return {
      id: input.jobId,
      created: true,
      stateVersion: nextVersion,
      status: input.status,
    };
  });
}

export async function createBatchPg(
  pool: PgPoolLike,
  input: CreateBatchInput,
): Promise<{ id: string; created: boolean }> {
  const requestSha256 = await sha256Hex(batchRequestFingerprintSource(input));
  const write = async () =>
    inTransaction(pool, async (client) => {
      const existing = await first<BatchRow>(
        client,
        `SELECT id, request_sha256 FROM batches
         WHERE tenant_id = $1 AND idempotency_key = $2`,
        [input.tenantId, input.idempotencyKey],
      );
      if (existing) {
        if (existing.request_sha256 !== requestSha256) {
          throw new PlatformConflictError(
            "同一 Idempotency-Key 已用于不同批次请求",
            "IDEMPOTENCY_KEY_REUSED",
          );
        }
        return { id: existing.id, created: false };
      }

      for (const asset of input.assets) {
        const registered = await first<{
          tenant_id: string | null;
          sha256: string | null;
        }>(
          client,
          "SELECT tenant_id, sha256 FROM assets WHERE id = $1 FOR SHARE",
          [asset.id],
        );
        if (
          registered &&
          (registered.tenant_id !== input.tenantId ||
            registered.sha256?.toLowerCase() !== asset.sha256.toLowerCase())
        ) {
          throw new PlatformConflictError(
            `素材 ${asset.id} 已属于其他租户或内容哈希不一致`,
            "ASSET_OWNERSHIP_CONFLICT",
          );
        }
      }

      const batchId = `batch_${crypto.randomUUID()}`;
      await client.query(
        `INSERT INTO batches
         (id, tenant_id, scenario, commercial_template_id,
          commercial_template_version, status, created_by, idempotency_key,
          request_sha256, locked_attributes_json)
         VALUES ($1,$2,$3,$4,$5,'READY',$6,$7,$8,$9)`,
        [
          batchId,
          input.tenantId,
          input.scenario,
          input.commercialTemplateId ?? null,
          input.commercialTemplateVersion ?? null,
          input.actorId,
          input.idempotencyKey,
          requestSha256,
          JSON.stringify(input.lockedAttributes),
        ],
      );

      for (const asset of input.assets) {
        await client.query(
          `INSERT INTO assets
           (id,batch_id,tenant_id,source_url,product_label,sha256,mime_type,
            byte_size,storage_provider,object_key,storage_region)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'aliyun_oss',$9,'cn-beijing')
           ON CONFLICT (id) DO NOTHING`,
          [
            asset.id,
            batchId,
            input.tenantId,
            asset.sourceUrl,
            asset.productLabel,
            asset.sha256.toLowerCase(),
            asset.mimeType ?? null,
            asset.byteSize ?? null,
            asset.r2Key ?? null,
          ],
        );
        await client.query(
          `INSERT INTO batch_assets (id,batch_id,asset_id,role,position)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            `batch_asset_${crypto.randomUUID()}`,
            batchId,
            asset.id,
            asset.role,
            asset.position,
          ],
        );
      }
      await client.query(
        `INSERT INTO audit_events
         (request_id,tenant_id,entity_type,entity_id,action,actor_id,payload_json)
         VALUES ($1,$2,'batch',$3,'CREATED',$4,$5)`,
        [
          input.requestId,
          input.tenantId,
          batchId,
          input.actorId,
          JSON.stringify({
            scenario: input.scenario,
            asset_count: input.assets.length,
            idempotency_key: input.idempotencyKey,
          }),
        ],
      );
      return { id: batchId, created: true };
    });

  try {
    return await write();
  } catch (error) {
    if (pgCode(error) !== "23505") throw error;
    const raced = await first<BatchRow>(
      pool,
      `SELECT id, request_sha256 FROM batches
       WHERE tenant_id = $1 AND idempotency_key = $2`,
      [input.tenantId, input.idempotencyKey],
    );
    if (raced?.request_sha256 === requestSha256) {
      return { id: raced.id, created: false };
    }
    throw new PlatformConflictError(
      "同一 Idempotency-Key 已并发用于不同批次请求",
      "IDEMPOTENCY_KEY_REUSED",
    );
  }
}

function evaluationParts(input: PersistEvaluationInput) {
  const result = input.result;
  if (result.schema_version === "0.2.0") {
    return {
      run: result.run,
      resultInput: result.input,
      scoreEvaluation: result.score_evaluation,
      gateEvaluation: result.gate_evaluation,
      performance: result.performance,
    };
  }
  return {
    run: {
      run_id: input.execution.run_id,
      created_at: input.execution.created_at,
      model_snapshot: input.execution.model_snapshot,
      prompt_version: input.execution.prompt_version,
      taxonomy_version: input.execution.taxonomy_version,
      score_policy_version: input.execution.score_policy_version,
      threshold_policy_version: input.execution.threshold_policy_version,
      gate_policy_version: input.execution.gate_policy_version,
      provider_adapter_version: input.execution.provider_adapter_version,
    },
    resultInput: {
      asset_id: input.execution.asset_id,
      asset_sha256: input.execution.asset_sha256,
      locked_attributes: input.execution.locked_attributes,
    },
    scoreEvaluation: result.score_evaluation,
    gateEvaluation: result.gate_evaluation,
    performance: {
      latency_ms: input.execution.latency_ms,
      cost_amount: input.execution.cost_amount,
      cost_currency: input.execution.cost_currency,
    },
  };
}

export async function persistEvaluationPg(
  pool: PgPoolLike,
  input: PersistEvaluationInput,
): Promise<{ id: string; created: boolean; resultVersion: number }> {
  const resultJson = JSON.stringify(input.result);
  const resultSha256 = await sha256Hex(resultJson);
  const write = async () =>
    inTransaction(pool, async (client) => {
      const existing = await first<EvaluationRow>(
        client,
        `SELECT id,result_json,result_sha256,result_version,decision
         FROM asset_evaluations
         WHERE tenant_id=$1 AND idempotency_key=$2`,
        [input.tenantId, input.idempotencyKey],
      );
      if (existing) {
        if (existing.result_sha256 !== resultSha256) {
          throw new PlatformConflictError(
            "同一 Idempotency-Key 已用于不同评估结果",
            "IDEMPOTENCY_KEY_REUSED",
          );
        }
        return {
          id: existing.id,
          created: false,
          resultVersion: existing.result_version,
        };
      }

      const parts = evaluationParts(input);
      const evaluationId = `eval_${crypto.randomUUID()}`;
      const decision = parts.gateEvaluation.decision ?? "REVIEW";
      const existingAsset = await first<{
        tenant_id: string | null;
        sha256: string | null;
      }>(
        client,
        "SELECT tenant_id,sha256 FROM assets WHERE id=$1 FOR SHARE",
        [parts.resultInput.asset_id],
      );
      if (
        existingAsset &&
        (existingAsset.tenant_id !== input.tenantId ||
          existingAsset.sha256?.toLowerCase() !==
            parts.resultInput.asset_sha256.toLowerCase())
      ) {
        throw new PlatformConflictError(
          "素材已属于其他租户或内容哈希不一致",
          "ASSET_OWNERSHIP_CONFLICT",
        );
      }
      const insertedAsset = await client.query<{ id: string }>(
        `INSERT INTO assets
         (id,batch_id,tenant_id,source_url,product_label,sha256)
         VALUES ($1,'unassigned',$2,'private://registered-asset',$1,$3)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [
          parts.resultInput.asset_id,
          input.tenantId,
          parts.resultInput.asset_sha256.toLowerCase(),
        ],
      );
      if (!existingAsset && insertedAsset.rowCount === 0) {
        const racedAsset = await first<{
          tenant_id: string | null;
          sha256: string | null;
        }>(
          client,
          "SELECT tenant_id,sha256 FROM assets WHERE id=$1 FOR SHARE",
          [parts.resultInput.asset_id],
        );
        if (
          !racedAsset ||
          racedAsset.tenant_id !== input.tenantId ||
          racedAsset.sha256?.toLowerCase() !==
            parts.resultInput.asset_sha256.toLowerCase()
        ) {
          throw new PlatformConflictError(
            "素材 ID 被其他租户并发注册",
            "ASSET_OWNERSHIP_CONFLICT",
          );
        }
      }

      const existingRun = await first<{ tenant_id: string | null }>(
        client,
        "SELECT tenant_id FROM evaluation_runs WHERE id=$1 FOR SHARE",
        [parts.run.run_id],
      );
      if (existingRun && existingRun.tenant_id !== input.tenantId) {
        throw new PlatformConflictError(
          "评估运行已属于其他租户",
          "RUN_OWNERSHIP_CONFLICT",
        );
      }
      const insertedRun = await client.query<{ id: string }>(
        `INSERT INTO evaluation_runs
         (id,tenant_id,model_snapshot,prompt_version,taxonomy_version,
          score_policy_version,threshold_policy_version,gate_policy_version,
          calibration_status,provider_id,adapter_version,status,request_id,
          idempotency_key,started_at,completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'provider',$10,'COMPLETED',
                 $11,$12,$13,CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [
          parts.run.run_id,
          input.tenantId,
          parts.run.model_snapshot,
          parts.run.prompt_version,
          parts.run.taxonomy_version,
          parts.run.score_policy_version,
          parts.run.threshold_policy_version,
          parts.run.gate_policy_version,
          parts.scoreEvaluation.calibration_status,
          parts.run.provider_adapter_version ?? "unknown",
          input.requestId,
          input.idempotencyKey,
          parts.run.created_at,
        ],
      );
      if (!existingRun && insertedRun.rowCount === 0) {
        const racedRun = await first<{ tenant_id: string | null }>(
          client,
          "SELECT tenant_id FROM evaluation_runs WHERE id=$1 FOR SHARE",
          [parts.run.run_id],
        );
        if (!racedRun || racedRun.tenant_id !== input.tenantId) {
          throw new PlatformConflictError(
            "评估运行 ID 被其他租户并发注册",
            "RUN_OWNERSHIP_CONFLICT",
          );
        }
      }
      await client.query(
        `INSERT INTO asset_evaluations
         (id,tenant_id,asset_id,run_id,decision,overall_score,
          skill_scores_json,issues_json,commercial_assessment,repair_prompt,
          locked_attributes_json,result_json,result_sha256,schema_version,
          result_version,idempotency_key,commercial_template_id,
          commercial_template_version,model_status,gate_status,latency_ms,
          cost_amount,cost_currency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,1,
                 $15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          evaluationId,
          input.tenantId,
          parts.resultInput.asset_id,
          parts.run.run_id,
          decision,
          parts.scoreEvaluation.overall_score,
          JSON.stringify(parts.scoreEvaluation.skill_scores),
          JSON.stringify(input.result.model_evaluation.observations),
          JSON.stringify(parts.scoreEvaluation.commercial_assessment),
          JSON.stringify(input.result.action_plan.repair_prompt),
          JSON.stringify(parts.resultInput.locked_attributes),
          resultJson,
          resultSha256,
          input.result.schema_version,
          input.idempotencyKey,
          input.commercialTemplateId ?? null,
          input.commercialTemplateVersion ?? null,
          input.result.model_evaluation.status,
          "status" in parts.gateEvaluation
            ? parts.gateEvaluation.status
            : "SUCCEEDED",
          parts.performance.latency_ms,
          parts.performance.cost_amount ?? null,
          parts.performance.cost_currency ?? null,
        ],
      );
      await client.query(
        `INSERT INTO audit_events
         (request_id,tenant_id,entity_type,entity_id,action,actor_id,payload_json)
         VALUES ($1,$2,'asset_evaluation',$3,'CREATED',$4,$5)`,
        [
          input.requestId,
          input.tenantId,
          evaluationId,
          input.actorId,
          JSON.stringify({
            schema_version: input.result.schema_version,
            run_id: parts.run.run_id,
            asset_id: parts.resultInput.asset_id,
            result_sha256: resultSha256,
            idempotency_key: input.idempotencyKey,
          }),
        ],
      );
      return { id: evaluationId, created: true, resultVersion: 1 };
    });

  try {
    return await write();
  } catch (error) {
    if (pgCode(error) !== "23505") throw error;
    const raced = await first<EvaluationRow>(
      pool,
      `SELECT id,result_json,result_sha256,result_version,decision
       FROM asset_evaluations
       WHERE tenant_id=$1 AND idempotency_key=$2`,
      [input.tenantId, input.idempotencyKey],
    );
    if (raced?.result_sha256 === resultSha256) {
      return {
        id: raced.id,
        created: false,
        resultVersion: raced.result_version,
      };
    }
    throw new PlatformConflictError(
      "同一 Idempotency-Key 已并发用于不同评估结果",
      "IDEMPOTENCY_KEY_REUSED",
    );
  }
}

export async function getEvaluationPg(
  pool: PgQueryable,
  tenantId: string,
  evaluationId: string,
): Promise<{
  id: string;
  result: PersistedEvaluationResult;
  resultVersion: number;
  overrides: OverrideRow[];
} | null> {
  const row = await first<{
    id: string;
    result_json: string | null;
    result_version: number;
  }>(
    pool,
    `SELECT id,result_json,result_version FROM asset_evaluations
     WHERE tenant_id=$1 AND id=$2`,
    [tenantId, evaluationId],
  );
  if (!row?.result_json) return null;
  const overrides = await pool.query<OverrideRow>(
    `SELECT id,asset_evaluation_id,original_decision,human_decision,
            reason_code,evidence_note,reviewer_id,request_id,idempotency_key,
            base_evaluation_version,resulting_evaluation_version,created_at
     FROM human_overrides
     WHERE tenant_id=$1 AND asset_evaluation_id=$2
     ORDER BY created_at ASC,id ASC`,
    [tenantId, evaluationId],
  );
  return {
    id: row.id,
    result: JSON.parse(row.result_json) as PersistedEvaluationResult,
    resultVersion: row.result_version,
    overrides: overrides.rows,
  };
}

export async function persistOverridePg(
  pool: PgPoolLike,
  input: PersistOverrideInput,
): Promise<{
  id: string;
  created: boolean;
  resultVersion: number;
}> {
  return inTransaction(pool, async (client) => {
    const existing = await first<OverrideRow>(
      client,
      `SELECT id,asset_evaluation_id,original_decision,human_decision,
              reason_code,evidence_note,reviewer_id,request_id,idempotency_key,
              base_evaluation_version,resulting_evaluation_version,created_at
       FROM human_overrides
       WHERE tenant_id=$1 AND idempotency_key=$2`,
      [input.tenantId, input.idempotencyKey],
    );
    if (existing) {
      if (!isSameOverride(existing, input)) {
        throw new PlatformConflictError(
          "同一 Idempotency-Key 已用于不同人工改判",
          "IDEMPOTENCY_KEY_REUSED",
        );
      }
      return {
        id: existing.id,
        created: false,
        resultVersion:
          existing.resulting_evaluation_version ??
          input.baseEvaluationVersion + 1,
      };
    }

    const evaluation = await first<EvaluationRow>(
      client,
      `SELECT id,result_json,result_sha256,result_version,decision
       FROM asset_evaluations
       WHERE tenant_id=$1 AND id=$2
       FOR UPDATE`,
      [input.tenantId, input.evaluationId],
    );
    if (!evaluation) {
      throw new PlatformConflictError(
        "评估结果不存在",
        "EVALUATION_NOT_FOUND",
      );
    }
    if (
      evaluation.result_version !== input.baseEvaluationVersion ||
      evaluation.decision !== input.originalDecision
    ) {
      throw new PlatformConflictError(
        "评估版本或原始结论已变化，请刷新后重试",
        "EVALUATION_VERSION_CONFLICT",
      );
    }

    const overrideId = `override_${crypto.randomUUID()}`;
    const recalibrationId = `recal_${crypto.randomUUID()}`;
    const templateId = input.commercialTemplateId ?? "platform-promo";
    const templateVersion = input.commercialTemplateVersion ?? "0.1";
    const templateKey = `${templateId}@${templateVersion}`;
    const nextVersion = input.baseEvaluationVersion + 1;

    await client.query(
      `INSERT INTO commercial_templates
       (id,template_id,version,name,status,config_json)
       VALUES ($1,$2,$3,$2,'VALIDATING','{}')
       ON CONFLICT (id) DO NOTHING`,
      [templateKey, templateId, templateVersion],
    );
    await client.query(
      `INSERT INTO human_overrides
       (id,tenant_id,asset_evaluation_id,original_decision,human_decision,
        reason_code,evidence_note,reviewer_id,request_id,idempotency_key,
        base_evaluation_version,resulting_evaluation_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        overrideId,
        input.tenantId,
        input.evaluationId,
        input.originalDecision,
        input.humanDecision,
        input.reasonCode,
        input.evidenceNote,
        input.actorId,
        input.requestId,
        input.idempotencyKey,
        input.baseEvaluationVersion,
        nextVersion,
      ],
    );
    await client.query(
      `INSERT INTO commercial_recalibration_logs
       (id,client_id,commercial_template_id,commercial_profile_id,
        asset_evaluation_id,system_fit_score,human_fit_score,
        original_decision,human_decision,reason_code,evidence_note,status,actor_id)
       VALUES ($1,$2,$3,NULL,$4,$5,NULL,$6,$7,$8,$9,'CAPTURED',$10)`,
      [
        recalibrationId,
        input.tenantId,
        templateKey,
        input.evaluationId,
        input.systemFitScore ?? null,
        input.originalDecision,
        input.humanDecision,
        input.reasonCode,
        input.evidenceNote,
        input.actorId,
      ],
    );
    const advanced = await client.query<{ result_version: number }>(
      `UPDATE asset_evaluations
       SET decision=$1,result_version=result_version+1
       WHERE tenant_id=$2 AND id=$3 AND result_version=$4 AND decision=$5
       RETURNING result_version`,
      [
        input.humanDecision,
        input.tenantId,
        input.evaluationId,
        input.baseEvaluationVersion,
        input.originalDecision,
      ],
    );
    if (advanced.rowCount !== 1 || advanced.rows[0]?.result_version !== nextVersion) {
      throw new PlatformConflictError(
        "评估版本在改判期间发生变化",
        "EVALUATION_VERSION_CONFLICT",
      );
    }
    await client.query(
      `INSERT INTO audit_events
       (request_id,tenant_id,entity_type,entity_id,action,actor_id,payload_json)
       VALUES ($1,$2,'human_override',$3,'CREATED',$4,$5)`,
      [
        input.requestId,
        input.tenantId,
        overrideId,
        input.actorId,
        JSON.stringify({
          evaluation_id: input.evaluationId,
          original_decision: input.originalDecision,
          human_decision: input.humanDecision,
          reason_code: input.reasonCode,
          evidence_note: input.evidenceNote,
          base_evaluation_version: input.baseEvaluationVersion,
          resulting_evaluation_version: nextVersion,
          idempotency_key: input.idempotencyKey,
        }),
      ],
    );
    return { id: overrideId, created: true, resultVersion: nextVersion };
  });
}
