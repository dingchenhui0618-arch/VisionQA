import type { PgPoolLike } from "../../db/pg";
import type {
  EvaluationExecutionMetadata,
  PersistedEvaluationResult,
} from "./contracts.ts";
import {
  persistEvaluationPg,
  recordJobStatePg,
  type RecordJobStateInput,
} from "./postgres-repository.ts";

export const ALIYUN_POSTGRES_PROVIDER = "aliyun_postgresql" as const;
export const ALIYUN_OSS_PROVIDER = "aliyun_oss" as const;

export function normalizeStorageProvider(
  value: string | null | undefined,
): string | null {
  if (value === "aliyun-oss" || value === ALIYUN_OSS_PROVIDER) {
    return ALIYUN_OSS_PROVIDER;
  }
  return value ?? null;
}

export type FcPersistEvaluationInput = {
  tenantId: string;
  assetId: string;
  requestId: string;
  idempotencyKey: string;
  result: PersistedEvaluationResult;
  provider: {
    providerId: string;
    adapterVersion: string;
    modelSnapshot: string;
    latencyMs: number;
    providerRequestId?: string | null;
  };
};

export type PostgresPersistencePortOptions = {
  actorId?: string;
  promptVersion: string;
  taxonomyVersion: string;
  scorePolicyVersion: string;
  thresholdPolicyVersion: string;
  gatePolicyVersion: string;
};

export interface AliyunPostgresPersistencePort {
  readonly provider: typeof ALIYUN_POSTGRES_PROVIDER;
  persistEvaluation(input: FcPersistEvaluationInput): Promise<{
    id: string;
    created: boolean;
    resultVersion: number;
  }>;
  recordJobState(input: RecordJobStateInput): Promise<{
    id: string;
    created: boolean;
    stateVersion: number;
    status: RecordJobStateInput["status"];
  }>;
}

function nonEmpty(value: string, name: string): string {
  if (!value.trim()) throw new Error(`${name} must be non-empty`);
  return value;
}

function optionalRecordString(
  value: unknown,
  key: string,
): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    key in value &&
    typeof (value as Record<string, unknown>)[key] === "string"
  ) {
    return (value as Record<string, string>)[key];
  }
  return null;
}

export function createAliyunPostgresPersistencePort(
  pool: PgPoolLike,
  options: PostgresPersistencePortOptions,
): AliyunPostgresPersistencePort {
  for (const [name, value] of Object.entries(options)) {
    if (name !== "actorId" && typeof value === "string") {
      nonEmpty(value, name);
    }
  }

  return Object.freeze({
    provider: ALIYUN_POSTGRES_PROVIDER,
    async persistEvaluation(input: FcPersistEvaluationInput) {
      const asset = await pool.query<{
        sha256: string | null;
        locked_attributes_json: string | null;
      }>(
        `SELECT a.sha256,b.locked_attributes_json
         FROM assets a
         LEFT JOIN batches b ON b.id=a.batch_id AND b.tenant_id=a.tenant_id
         WHERE a.tenant_id=$1 AND a.id=$2 AND a.deleted_at IS NULL`,
        [input.tenantId, input.assetId],
      );
      const row = asset.rows[0];
      if (!row?.sha256 || !/^[a-f0-9]{64}$/i.test(row.sha256)) {
        throw new Error("Registered asset SHA-256 is unavailable");
      }
      let lockedAttributes: string[] = [];
      if (row.locked_attributes_json) {
        const parsed: unknown = JSON.parse(row.locked_attributes_json);
        if (Array.isArray(parsed)) {
          lockedAttributes = parsed.filter(
            (item): item is string =>
              typeof item === "string" && Boolean(item.trim()),
          );
        }
      }
      const commercial =
        input.result.score_evaluation.commercial_assessment;
      const execution: EvaluationExecutionMetadata = {
        run_id: `run_${input.requestId}`,
        created_at: new Date().toISOString(),
        model_snapshot: nonEmpty(
          input.provider.modelSnapshot,
          "provider.modelSnapshot",
        ),
        prompt_version: options.promptVersion,
        taxonomy_version: options.taxonomyVersion,
        score_policy_version: options.scorePolicyVersion,
        threshold_policy_version: options.thresholdPolicyVersion,
        gate_policy_version: options.gatePolicyVersion,
        provider_adapter_version: nonEmpty(
          input.provider.adapterVersion,
          "provider.adapterVersion",
        ),
        asset_id: input.assetId,
        asset_sha256: row.sha256.toLowerCase(),
        locked_attributes: lockedAttributes,
        latency_ms: input.provider.latencyMs,
        cost_amount: null,
        cost_currency: null,
      };
      return persistEvaluationPg(pool, {
        tenantId: input.tenantId,
        requestId: input.requestId,
        idempotencyKey: input.idempotencyKey,
        actorId: options.actorId ?? "aliyun-fc-task",
        result: input.result,
        execution,
        commercialTemplateId: optionalRecordString(
          commercial,
          "template_id",
        ),
        commercialTemplateVersion: optionalRecordString(
          commercial,
          "template_version",
        ),
      });
    },
    recordJobState(input: RecordJobStateInput) {
      return recordJobStatePg(pool, input);
    },
  });
}
