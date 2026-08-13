import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
} from "../../db";
import {
  sha256Hex,
  type EvaluationExecutionMetadata,
  type PersistedEvaluationResult,
} from "./contracts.ts";

export class PlatformConflictError extends Error {
  readonly code:
    | "IDEMPOTENCY_KEY_REUSED"
    | "EVALUATION_VERSION_CONFLICT"
    | "EVALUATION_NOT_FOUND"
    | "ASSET_OWNERSHIP_CONFLICT"
    | "RUN_OWNERSHIP_CONFLICT";

  constructor(
    message: string,
    code:
      | "IDEMPOTENCY_KEY_REUSED"
      | "EVALUATION_VERSION_CONFLICT"
      | "EVALUATION_NOT_FOUND"
      | "ASSET_OWNERSHIP_CONFLICT"
      | "RUN_OWNERSHIP_CONFLICT",
  ) {
    super(message);
    this.code = code;
  }
}

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
  created_at: string;
};

export type PersistEvaluationInput = {
  tenantId: string;
  requestId: string;
  idempotencyKey: string;
  actorId: string;
  result: PersistedEvaluationResult;
  execution: EvaluationExecutionMetadata;
  commercialTemplateId?: string | null;
  commercialTemplateVersion?: string | null;
};

export type PersistOverrideInput = {
  tenantId: string;
  requestId: string;
  idempotencyKey: string;
  actorId: string;
  evaluationId: string;
  baseEvaluationVersion: number;
  originalDecision: string;
  humanDecision: string;
  reasonCode: string;
  evidenceNote: string;
  commercialTemplateId?: string | null;
  commercialTemplateVersion?: string | null;
  systemFitScore?: number | null;
};

export type CreateBatchInput = {
  tenantId: string;
  requestId: string;
  idempotencyKey: string;
  actorId: string;
  scenario: string;
  commercialTemplateId?: string | null;
  commercialTemplateVersion?: string | null;
  lockedAttributes: string[];
  assets: Array<{
    id: string;
    role: "CANDIDATE" | "REFERENCE";
    position: number;
    sha256: string;
    sourceUrl: string;
    productLabel: string;
    mimeType?: string | null;
    byteSize?: number | null;
    r2Key?: string | null;
  }>;
};

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
        r2Key: asset.r2Key ?? null,
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

function statement(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[],
): D1PreparedStatementLike {
  return db.prepare(sql).bind(...values);
}

export async function createBatch(
  db: D1DatabaseLike,
  input: CreateBatchInput,
): Promise<{ id: string; created: boolean }> {
  const requestSha256 = await sha256Hex(batchRequestFingerprintSource(input));
  const existing = await db
    .prepare(
      `SELECT id, request_sha256 FROM batches
       WHERE tenant_id = ? AND idempotency_key = ?`,
    )
    .bind(input.tenantId, input.idempotencyKey)
    .first<{ id: string; request_sha256: string | null }>();
  if (existing) {
    if (existing.request_sha256 !== requestSha256) {
      throw new PlatformConflictError(
        "同一 Idempotency-Key 已用于不同批次请求",
        "IDEMPOTENCY_KEY_REUSED",
      );
    }
    return { id: existing.id, created: false };
  }

  const batchId = `batch_${crypto.randomUUID()}`;
  for (const asset of input.assets) {
    const registered = await db
      .prepare(`SELECT tenant_id, sha256 FROM assets WHERE id = ?`)
      .bind(asset.id)
      .first<{ tenant_id: string | null; sha256: string | null }>();
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

  const writes: D1PreparedStatementLike[] = [
    statement(
      db,
      `INSERT INTO batches
       (id, tenant_id, scenario, commercial_template_id,
        commercial_template_version, status, created_by, idempotency_key,
        request_sha256, locked_attributes_json)
       VALUES (?, ?, ?, ?, ?, 'READY', ?, ?, ?, ?)`,
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
    ),
  ];

  for (const asset of input.assets) {
    writes.push(
      statement(
        db,
        `INSERT INTO assets
         (id, batch_id, tenant_id, source_url, product_label, sha256,
          mime_type, byte_size, r2_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
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
      ),
    );
    writes.push(
      statement(
        db,
        `INSERT INTO batch_assets
         (id, batch_id, asset_id, role, position)
         VALUES (?, ?, ?, ?, ?)`,
        [
          `batch_asset_${crypto.randomUUID()}`,
          batchId,
          asset.id,
          asset.role,
          asset.position,
        ],
      ),
    );
  }
  writes.push(
    statement(
      db,
      `INSERT INTO audit_events
       (request_id, tenant_id, entity_type, entity_id, action, actor_id, payload_json)
       VALUES (?, ?, 'batch', ?, 'CREATED', ?, ?)`,
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
    ),
  );

  try {
    await db.batch(writes);
  } catch (error) {
    const raced = await db
      .prepare(
        `SELECT id, request_sha256 FROM batches
         WHERE tenant_id = ? AND idempotency_key = ?`,
      )
      .bind(input.tenantId, input.idempotencyKey)
      .first<{ id: string; request_sha256: string | null }>();
    if (raced) {
      if (raced.request_sha256 !== requestSha256) {
        throw new PlatformConflictError(
          "同一 Idempotency-Key 已并发用于不同批次请求",
          "IDEMPOTENCY_KEY_REUSED",
        );
      }
      return { id: raced.id, created: false };
    }
    throw error;
  }
  return { id: batchId, created: true };
}

export async function persistEvaluation(
  db: D1DatabaseLike,
  input: PersistEvaluationInput,
): Promise<{ id: string; created: boolean; resultVersion: number }> {
  const resultJson = JSON.stringify(input.result);
  const resultSha256 = await sha256Hex(resultJson);
  const existing = await db
    .prepare(
      `SELECT id, result_json, result_sha256, result_version, decision
       FROM asset_evaluations
       WHERE tenant_id = ? AND idempotency_key = ?`,
    )
    .bind(input.tenantId, input.idempotencyKey)
    .first<EvaluationRow>();

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

  const { run, input: resultInput, score_evaluation, gate_evaluation } =
    input.result.schema_version === "0.2.0"
      ? input.result
      : {
          run: {
            run_id: input.execution.run_id,
            created_at: input.execution.created_at,
            model_snapshot: input.execution.model_snapshot,
            prompt_version: input.execution.prompt_version,
            taxonomy_version: input.execution.taxonomy_version,
            score_policy_version: input.execution.score_policy_version,
            threshold_policy_version:
              input.execution.threshold_policy_version,
            gate_policy_version: input.execution.gate_policy_version,
            provider_adapter_version:
              input.execution.provider_adapter_version,
          },
          input: {
            asset_id: input.execution.asset_id,
            asset_sha256: input.execution.asset_sha256,
            locked_attributes: input.execution.locked_attributes,
          },
          score_evaluation: input.result.score_evaluation,
          gate_evaluation: input.result.gate_evaluation,
        };
  const evaluationId = `eval_${crypto.randomUUID()}`;
  const decision = gate_evaluation.decision ?? "REVIEW";
  const score = score_evaluation.overall_score;
  const commercialAssessment = score_evaluation.commercial_assessment;
  const repairPrompt = input.result.action_plan.repair_prompt;
  const observations = input.result.model_evaluation.observations;
  const performance =
    input.result.schema_version === "0.2.0"
      ? input.result.performance
      : {
          latency_ms: input.execution.latency_ms,
          cost_amount: input.execution.cost_amount,
          cost_currency: input.execution.cost_currency,
        };

  const writes = [
    statement(
      db,
      `INSERT INTO assets
       (id, batch_id, tenant_id, source_url, product_label, sha256)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        resultInput.asset_id,
        "unassigned",
        input.tenantId,
        "private://registered-asset",
        resultInput.asset_id,
        resultInput.asset_sha256.toLowerCase(),
      ],
    ),
    statement(
      db,
      `INSERT INTO evaluation_runs
       (id, tenant_id, model_snapshot, prompt_version, taxonomy_version,
        score_policy_version, threshold_policy_version, gate_policy_version,
        calibration_status, provider_id, adapter_version, status, request_id,
        idempotency_key, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      [
        run.run_id,
        input.tenantId,
        run.model_snapshot,
        run.prompt_version,
        run.taxonomy_version,
        run.score_policy_version,
        run.threshold_policy_version,
        run.gate_policy_version,
        score_evaluation.calibration_status,
        "provider",
        run.provider_adapter_version ?? "unknown",
        input.requestId,
        input.idempotencyKey,
        run.created_at,
        new Date().toISOString(),
      ],
    ),
    statement(
      db,
      `INSERT INTO asset_evaluations
       (id, tenant_id, asset_id, run_id, decision, overall_score,
        skill_scores_json, issues_json, commercial_assessment, repair_prompt,
        locked_attributes_json, result_json, result_sha256, schema_version,
        result_version, idempotency_key, commercial_template_id,
        commercial_template_version, model_status, gate_status, latency_ms,
        cost_amount, cost_currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        evaluationId,
        input.tenantId,
        resultInput.asset_id,
        run.run_id,
        decision,
        score,
        JSON.stringify(score_evaluation.skill_scores),
        JSON.stringify(observations),
        JSON.stringify(commercialAssessment),
        JSON.stringify(repairPrompt),
        JSON.stringify(resultInput.locked_attributes),
        resultJson,
        resultSha256,
        input.result.schema_version,
        input.idempotencyKey,
        input.commercialTemplateId ?? null,
        input.commercialTemplateVersion ?? null,
        input.result.model_evaluation.status,
        "status" in gate_evaluation
          ? gate_evaluation.status
          : "SUCCEEDED",
        performance.latency_ms,
        performance.cost_amount ?? null,
        performance.cost_currency ?? null,
      ],
    ),
    statement(
      db,
      `INSERT INTO audit_events
       (request_id, tenant_id, entity_type, entity_id, action, actor_id, payload_json)
       VALUES (?, ?, 'asset_evaluation', ?, 'CREATED', ?, ?)`,
      [
        input.requestId,
        input.tenantId,
        evaluationId,
        input.actorId,
        JSON.stringify({
          schema_version: input.result.schema_version,
          run_id: run.run_id,
          asset_id: resultInput.asset_id,
          result_sha256: resultSha256,
          idempotency_key: input.idempotencyKey,
        }),
      ],
    ),
  ];

  try {
    await db.batch(writes);
  } catch (error) {
    const raced = await db
      .prepare(
        `SELECT id, result_json, result_sha256, result_version, decision
         FROM asset_evaluations
         WHERE tenant_id = ? AND idempotency_key = ?`,
      )
      .bind(input.tenantId, input.idempotencyKey)
      .first<EvaluationRow>();
    if (raced?.result_sha256 === resultSha256) {
      return {
        id: raced.id,
        created: false,
        resultVersion: raced.result_version,
      };
    }
    throw error;
  }

  return { id: evaluationId, created: true, resultVersion: 1 };
}

export async function getEvaluation(
  db: D1DatabaseLike,
  tenantId: string,
  evaluationId: string,
): Promise<{
  id: string;
  result: PersistedEvaluationResult;
  resultVersion: number;
  overrides: OverrideRow[];
} | null> {
  const row = await db
    .prepare(
      `SELECT id, result_json, result_version
       FROM asset_evaluations
       WHERE tenant_id = ? AND id = ?`,
    )
    .bind(tenantId, evaluationId)
    .first<{ id: string; result_json: string; result_version: number }>();
  if (!row?.result_json) return null;

  const overrideResult = await db
    .prepare(
      `SELECT id, asset_evaluation_id, original_decision, human_decision,
              reason_code, evidence_note, reviewer_id, request_id,
              idempotency_key, base_evaluation_version, created_at
       FROM human_overrides
       WHERE tenant_id = ? AND asset_evaluation_id = ?
       ORDER BY created_at ASC, id ASC`,
    )
    .bind(tenantId, evaluationId)
    .all<OverrideRow>();

  return {
    id: row.id,
    result: JSON.parse(row.result_json) as PersistedEvaluationResult,
    resultVersion: row.result_version,
    overrides: overrideResult.results ?? [],
  };
}

export async function persistOverride(
  db: D1DatabaseLike,
  input: PersistOverrideInput,
): Promise<{ id: string; created: boolean }> {
  const existing = await db
    .prepare(
      `SELECT id, asset_evaluation_id, original_decision, human_decision,
              reason_code, evidence_note, reviewer_id, request_id,
              idempotency_key, base_evaluation_version, created_at
       FROM human_overrides
       WHERE tenant_id = ? AND idempotency_key = ?`,
    )
    .bind(input.tenantId, input.idempotencyKey)
    .first<OverrideRow>();
  if (existing) {
    if (!isSameOverride(existing, input)) {
      throw new PlatformConflictError(
        "同一 Idempotency-Key 已用于不同人工改判",
        "IDEMPOTENCY_KEY_REUSED",
      );
    }
    return { id: existing.id, created: false };
  }

  const evaluation = await db
    .prepare(
      `SELECT id, result_json, result_sha256, result_version, decision
       FROM asset_evaluations
       WHERE tenant_id = ? AND id = ?`,
    )
    .bind(input.tenantId, input.evaluationId)
    .first<EvaluationRow>();
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
  const payload = {
    evaluation_id: input.evaluationId,
    original_decision: input.originalDecision,
    human_decision: input.humanDecision,
    reason_code: input.reasonCode,
    evidence_note: input.evidenceNote,
    base_evaluation_version: input.baseEvaluationVersion,
    idempotency_key: input.idempotencyKey,
  };

  const writes = [
    statement(
      db,
      `INSERT INTO commercial_templates
       (id, template_id, version, name, status, config_json)
       VALUES (?, ?, ?, ?, 'VALIDATING', '{}')
       ON CONFLICT(id) DO NOTHING`,
      [templateKey, templateId, templateVersion, templateId],
    ),
    statement(
      db,
      `INSERT INTO human_overrides
       (id, tenant_id, asset_evaluation_id, original_decision, human_decision,
        reason_code, evidence_note, reviewer_id, request_id, idempotency_key,
        base_evaluation_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ],
    ),
    statement(
      db,
      `INSERT INTO commercial_recalibration_logs
       (id, client_id, commercial_template_id, commercial_profile_id,
        asset_evaluation_id, system_fit_score, human_fit_score,
        original_decision, human_decision, reason_code, evidence_note,
        status, actor_id)
       VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, 'CAPTURED', ?)`,
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
    ),
    statement(
      db,
      `INSERT INTO audit_events
       (request_id, tenant_id, entity_type, entity_id, action, actor_id, payload_json)
       VALUES (?, ?, 'human_override', ?, 'CREATED', ?, ?)`,
      [
        input.requestId,
        input.tenantId,
        overrideId,
        input.actorId,
        JSON.stringify(payload),
      ],
    ),
  ];

  try {
    await db.batch(writes);
  } catch (error) {
    const raced = await db
      .prepare(
        `SELECT id, asset_evaluation_id, original_decision, human_decision,
                reason_code, evidence_note, reviewer_id, request_id,
                idempotency_key, base_evaluation_version, created_at
         FROM human_overrides
         WHERE tenant_id = ? AND idempotency_key = ?`,
      )
      .bind(input.tenantId, input.idempotencyKey)
      .first<OverrideRow>();
    if (raced) {
      if (!isSameOverride(raced, input)) {
        throw new PlatformConflictError(
          "同一 Idempotency-Key 已并发用于不同人工改判",
          "IDEMPOTENCY_KEY_REUSED",
        );
      }
      return { id: raced.id, created: false };
    }
    throw error;
  }

  return { id: overrideId, created: true };
}
