import type { PgQueryable } from "../../db/pg/index.ts";

export type DispatchClaimInput = {
  tenantId: string;
  idempotencyKey: string;
  requestId: string;
  fingerprint: string;
  projectId?: string | null;
  conversationId?: string | null;
  operation: string;
  providerId: string;
  modelSnapshot: string;
};

export type DispatchClaim = {
  acquired: boolean;
  status: "DISPATCHED" | "SUCCEEDED" | "FAILED" | "BLOCKED";
};

export interface DispatchClaimStore {
  claim(input: DispatchClaimInput): Promise<DispatchClaim>;
  complete(tenantId: string, idempotencyKey: string, outcome: {
    status: "SUCCEEDED" | "FAILED";
    errorCode?: string;
    cost?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    inputImageCount?: number | null;
    outputImageCount?: number | null;
    latencyMs?: number | null;
  }): Promise<void>;
}

const claimKey = (tenantId: string, idempotencyKey: string) => `${tenantId}\u0000${idempotencyKey}`;

export function createMemoryDispatchClaimStore(): DispatchClaimStore {
  const claims = new Map<string, { fingerprint: string; status: DispatchClaim["status"] }>();
  return {
    async claim(input) {
      const key = claimKey(input.tenantId, input.idempotencyKey);
      const prior = claims.get(key);
      if (prior) {
        if (prior.fingerprint !== input.fingerprint) throw new Error("dispatch idempotency conflict");
        return { acquired: false, status: prior.status };
      }
      claims.set(key, { fingerprint: input.fingerprint, status: "DISPATCHED" });
      return { acquired: true, status: "DISPATCHED" };
    },
    async complete(tenantId, idempotencyKey, outcome) {
      const key = claimKey(tenantId, idempotencyKey);
      const prior = claims.get(key);
      if (!prior) throw new Error("dispatch claim does not exist");
      claims.set(key, { ...prior, status: outcome.status });
    },
  };
}

export function createPostgresDispatchClaimStore(db: PgQueryable): DispatchClaimStore {
  return {
    async claim(input) {
      const id = `mcl_${crypto.randomUUID()}`;
      const inserted = await db.query<{ status: DispatchClaim["status"] }>(
        `INSERT INTO model_call_ledger
          (id, tenant_id, project_id, conversation_id, request_id, request_fingerprint,
           operation, provider_id, model_snapshot, status, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DISPATCHED',$10)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
         RETURNING status`,
        [id, input.tenantId, input.projectId ?? null, input.conversationId ?? null,
          input.requestId, input.fingerprint, input.operation, input.providerId,
          input.modelSnapshot, input.idempotencyKey],
      );
      if (inserted.rows.length === 1) return { acquired: true, status: "DISPATCHED" };
      const existing = await db.query<{ status: DispatchClaim["status"]; request_fingerprint: string }>(
        `SELECT status, request_fingerprint FROM model_call_ledger
         WHERE tenant_id = $1 AND idempotency_key = $2`,
        [input.tenantId, input.idempotencyKey],
      );
      const prior = existing.rows[0];
      if (!prior) throw new Error("dispatch claim disappeared after conflict");
      if (prior.request_fingerprint !== input.fingerprint) throw new Error("dispatch idempotency conflict");
      return { acquired: false, status: prior.status };
    },
    async complete(tenantId, idempotencyKey, outcome) {
      const result = await db.query(
        `UPDATE model_call_ledger
         SET status = $3, error_code = $4, cost_amount = $5,
             input_tokens = $6, output_tokens = $7,
             input_image_count = $8, output_image_count = $9,
             latency_ms = $10, completed_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND idempotency_key = $2 AND status = 'DISPATCHED'`,
        [tenantId, idempotencyKey, outcome.status, outcome.errorCode ?? null,
          outcome.cost ?? null, outcome.inputTokens ?? null, outcome.outputTokens ?? null,
          outcome.inputImageCount ?? null, outcome.outputImageCount ?? null,
          outcome.latencyMs ?? null],
      );
      if (result.rowCount !== 1) throw new Error("dispatch claim could not be completed");
    },
  };
}
