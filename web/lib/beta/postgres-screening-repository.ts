import { createHash, randomUUID } from "node:crypto";
import type { PgClientLike, PgPoolLike, PgQueryable } from "../../db/pg/index.ts";
import { SCREENING_MAX_CANDIDATES, SCREENING_MAX_TRUTH_IMAGES, type BetaSessionView, type ScreeningBatch } from "./contracts.ts";

export type CreateScreeningBatchPgInput = {
  projectId: string;
  skuName: string;
  truthAssetIds: string[];
  candidateAssetIds: string[];
  idempotencyKey: string;
  requestFingerprint?: string;
  id?: string;
};

export class ScreeningRepositoryError extends Error {
  readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID_INPUT" | "CONFLICT" | "INVALID_STATE";
  constructor(code: ScreeningRepositoryError["code"], message: string) {
    super(message);
    this.name = "ScreeningRepositoryError";
    this.code = code;
  }
}

type BatchRow = { id: string; tenant_id: string; project_id: string; sku_name: string; status: ScreeningBatch["status"];
  created_at: Date | string; completed_at: Date | string | null; idempotency_key: string | null; request_fingerprint: string | null };
type LinkRow = { asset_id: string; role: "TRUTH" | "CANDIDATE"; position: number };
const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();

async function tx<T>(pool: PgPoolLike, run: (client: PgClientLike) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const result = await run(client); await client.query("COMMIT"); return result; }
  catch (error) { try { await client.query("ROLLBACK"); } catch { /* preserve original */ } throw error; }
  finally { client.release(); }
}

async function membership(db: PgQueryable, session: BetaSessionView): Promise<void> {
  const result = await db.query("SELECT id FROM memberships WHERE id=$1 AND user_id=$2 AND tenant_id=$3", [session.membershipId, session.userId, session.tenantId]);
  if (!result.rows.length) throw new ScreeningRepositoryError("FORBIDDEN", "membership is not valid for this tenant");
}

async function readBatch(db: PgQueryable, row: BatchRow): Promise<ScreeningBatch> {
  const links = await db.query<LinkRow>("SELECT asset_id,role,position FROM screening_batch_assets WHERE tenant_id=$1 AND batch_id=$2 ORDER BY role,position", [row.tenant_id, row.id]);
  const truthAssetIds = links.rows.filter(link => link.role === "TRUTH").sort((a, b) => a.position - b.position).map(link => link.asset_id);
  const candidateAssetIds = links.rows.filter(link => link.role === "CANDIDATE").sort((a, b) => a.position - b.position).map(link => link.asset_id);
  const items = await db.query<{ id: string; asset_id: string; decision: ScreeningBatch["items"][number]["decision"]; primary_issue: string | null; visible_evidence: string; repair_prompt: string | null; issue_region_json: unknown; customer_reviewed_at: Date | string | null }>("SELECT id,asset_id,decision,primary_issue,visible_evidence,repair_prompt,issue_region_json,customer_reviewed_at FROM screening_items WHERE tenant_id=$1 AND batch_id=$2 ORDER BY created_at,id", [row.tenant_id, row.id]);
  return { id: row.id, tenantId: row.tenant_id, projectId: row.project_id, skuName: row.sku_name,
    truthAssetIds, candidateAssetIds, status: row.status, createdAt: iso(row.created_at),
    completedAt: row.completed_at ? iso(row.completed_at) : null,
    items: items.rows.map(item => ({ id: item.id, tenantId: row.tenant_id, batchId: row.id, assetId: item.asset_id, decision: item.decision, primaryIssue: item.primary_issue, visibleEvidence: item.visible_evidence, repairPrompt: item.repair_prompt, issueRegion: typeof item.issue_region_json === "string" ? JSON.parse(item.issue_region_json) : item.issue_region_json as ScreeningBatch["items"][number]["issueRegion"], customerReviewedAt: item.customer_reviewed_at ? iso(item.customer_reviewed_at) : null })) };
}

export async function createScreeningBatchPg(pool: PgPoolLike, session: BetaSessionView, input: CreateScreeningBatchPgInput): Promise<{ batch: ScreeningBatch; created: boolean }> {
  await membership(pool, session);
  if (!input || typeof input.projectId !== "string" || typeof input.idempotencyKey !== "string" || !input.idempotencyKey.trim()) {
    throw new ScreeningRepositoryError("INVALID_INPUT", "projectId and idempotencyKey are required");
  }
  const truths = input.truthAssetIds;
  const candidates = input.candidateAssetIds;
  if (!Array.isArray(truths) || !Array.isArray(candidates) || truths.length < 1 || truths.length > SCREENING_MAX_TRUTH_IMAGES || candidates.length < 1 || candidates.length > SCREENING_MAX_CANDIDATES || [...truths, ...candidates].some(id => typeof id !== "string" || !id.trim())) {
    throw new ScreeningRepositoryError("INVALID_INPUT", `truth assets must be 1-${SCREENING_MAX_TRUTH_IMAGES} and candidates 1-${SCREENING_MAX_CANDIDATES}`);
  }
  if (new Set([...truths, ...candidates]).size !== truths.length + candidates.length) throw new ScreeningRepositoryError("INVALID_INPUT", "an asset cannot be repeated or used in both roles");
  const canonical = JSON.stringify({ projectId: input.projectId, skuName: String(input.skuName ?? "").trim().slice(0, 80) || "未命名 SKU", truthAssetIds: truths, candidateAssetIds: candidates });
  const fingerprint = createHash("sha256").update(canonical).digest("hex");
  return tx(pool, async client => {
    const project = await client.query<{ id: string }>("SELECT id FROM projects WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE", [session.tenantId, input.projectId]);
    if (!project.rows[0]) throw new ScreeningRepositoryError("NOT_FOUND", "project was not found for tenant");
    const replay = await client.query<BatchRow>("SELECT * FROM screening_batches WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE", [session.tenantId, input.idempotencyKey]);
    if (replay.rows[0]) {
      if (replay.rows[0].request_fingerprint !== fingerprint) throw new ScreeningRepositoryError("CONFLICT", "idempotency key was used for a different screening request");
      return { batch: await readBatch(client, replay.rows[0]), created: false };
    }
    const running = await client.query("SELECT id FROM screening_batches WHERE tenant_id=$1 AND project_id=$2 AND status='RUNNING' FOR UPDATE", [session.tenantId, input.projectId]);
    if (running.rows.length) throw new ScreeningRepositoryError("CONFLICT", "a screening batch is already running for this project");
    const all = [...truths, ...candidates];
    for (const [index, assetId] of all.entries()) {
      const role = index < truths.length ? "TRUTH" : "CANDIDATE";
      const asset = await client.query<{ id: string; retention_until: Date | string | null }>("SELECT id,retention_until FROM assets WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND asset_role=$4 AND upload_status='READY' AND deleted_at IS NULL FOR SHARE", [session.tenantId, input.projectId, assetId, role]);
      const retention = asset.rows[0]?.retention_until ? new Date(asset.rows[0].retention_until).getTime() : NaN;
      if (!asset.rows[0] || !Number.isFinite(retention) || retention <= Date.now()) throw new ScreeningRepositoryError("FORBIDDEN", `asset ${assetId} is not a ready ${role} asset for this project`);
    }
    const batchId = input.id ?? `scr_${randomUUID()}`;
    const inserted = await client.query<BatchRow>(`INSERT INTO screening_batches (id,tenant_id,project_id,sku_name,status,idempotency_key,request_fingerprint) VALUES ($1,$2,$3,$4,'RUNNING',$5,$6) RETURNING *`, [batchId, session.tenantId, input.projectId, String(input.skuName ?? "").trim().slice(0, 80) || "未命名 SKU", input.idempotencyKey, fingerprint]);
    for (const [position, assetId] of truths.entries()) await client.query("INSERT INTO screening_batch_assets (id,tenant_id,batch_id,asset_id,role,position) VALUES ($1,$2,$3,$4,'TRUTH',$5)", [`sba_${randomUUID()}`, session.tenantId, batchId, assetId, position]);
    for (const [position, assetId] of candidates.entries()) await client.query("INSERT INTO screening_batch_assets (id,tenant_id,batch_id,asset_id,role,position) VALUES ($1,$2,$3,$4,'CANDIDATE',$5)", [`sba_${randomUUID()}`, session.tenantId, batchId, assetId, position]);
    await client.query("UPDATE projects SET name=$3,status='SCREENING',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2", [session.tenantId, input.projectId, inserted.rows[0].sku_name]);
    return { batch: await readBatch(client, inserted.rows[0]), created: true };
  });
}
