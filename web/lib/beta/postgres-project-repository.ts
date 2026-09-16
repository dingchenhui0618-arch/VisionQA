import { randomUUID } from "node:crypto";
import type { PgQueryable } from "../../db/pg/index.ts";
import type { BetaProject, BetaSessionView } from "./contracts.ts";

type Row = { id: string; tenant_id: string; name: string; status: BetaProject["status"]; is_example: boolean;
  created_at: Date | string; updated_at: Date | string; deleted_at: Date | string | null };
export class ProjectRepositoryError extends Error {
  readonly code: "NOT_FOUND" | "INVALID_INPUT" | "FORBIDDEN";
  constructor(code: ProjectRepositoryError["code"]) { super(code); this.code = code; }
}

// Session identity must come from server authentication, never from request JSON.
async function requireMembership(db: PgQueryable, session: BetaSessionView) {
  const result = await db.query("SELECT id FROM memberships WHERE id=$1 AND user_id=$2 AND tenant_id=$3",
    [session.membershipId, session.userId, session.tenantId]);
  if (!result.rows.length) throw new ProjectRepositoryError("FORBIDDEN");
}

async function view(db: PgQueryable, row: Row): Promise<BetaProject> {
  // Counts derive from facts, not a second mutable counter. Screening counts use
  // the latest batch's items; completed repair rounds count only captured output.
  const batch = await db.query<{ id: string; idempotency_key: string | null }>(`SELECT id,idempotency_key FROM screening_batches WHERE tenant_id=$1 AND project_id=$2
    ORDER BY created_at DESC,id DESC LIMIT 1`, [row.tenant_id, row.id]);
  const items = batch.rows[0] ? await db.query<{ decision: string }>(
    "SELECT decision FROM screening_items WHERE tenant_id=$1 AND batch_id=$2", [row.tenant_id, batch.rows[0].id]) : { rows: [] };
  const links = batch.rows[0] ? await db.query<{ count: string | number }>(
    "SELECT COUNT(*) AS count FROM screening_batch_assets WHERE tenant_id=$1 AND batch_id=$2 AND role='CANDIDATE'", [row.tenant_id, batch.rows[0].id]) : null;
  const candidates = await db.query<{ count: string | number }>(`SELECT COUNT(*) AS count FROM assets
    WHERE tenant_id=$1 AND project_id=$2 AND asset_role='CANDIDATE' AND upload_status='READY' AND deleted_at IS NULL`, [row.tenant_id, row.id]);
  const repairs = await db.query<{ count: string | number }>(`SELECT COUNT(*) AS count FROM repair_attempts
    WHERE tenant_id=$1 AND project_id=$2 AND status='CAPTURED' AND output_asset_id IS NOT NULL`, [row.tenant_id, row.id]);
  return { id: row.id, tenantId: row.tenant_id, name: row.name, status: row.status, isExample: row.is_example,
    candidateCount: batch.rows[0]?.idempotency_key ? Number(links!.rows[0].count)
      : items.rows.length || Number(candidates.rows[0].count),
    attentionCount: items.rows.filter(item => item.decision === "NEEDS_ATTENTION").length,
    repairedCount: Number(repairs.rows[0].count), createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(), deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null };
}

export async function getProjectPg(db: PgQueryable, session: BetaSessionView, projectId: string): Promise<BetaProject> {
  await requireMembership(db, session);
  const found = await db.query<Row>("SELECT * FROM projects WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL", [session.tenantId, projectId]);
  if (!found.rows[0]) throw new ProjectRepositoryError("NOT_FOUND");
  return view(db, found.rows[0]);
}

export async function listProjectsPg(db: PgQueryable, session: BetaSessionView): Promise<BetaProject[]> {
  await requireMembership(db, session);
  const found = await db.query<Row>("SELECT * FROM projects WHERE tenant_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC,id DESC", [session.tenantId]);
  return Promise.all(found.rows.map(row => view(db, row)));
}

export async function createProjectPg(db: PgQueryable, session: BetaSessionView, name: string, options: { conversationId?: string; isExample?: boolean } = {}): Promise<BetaProject> {
  await requireMembership(db, session);
  if (typeof name !== "string" || name.includes("\u0000")) throw new ProjectRepositoryError("INVALID_INPUT");
  const conversation = options.conversationId;
  if (conversation !== undefined && (!conversation.trim() || conversation.length > 200 || conversation.includes("\u0000"))) throw new ProjectRepositoryError("INVALID_INPUT");
  const id = `prj_${randomUUID()}`;
  // One INSERT avoids orphan projects when two requests compete for an origin.
  const inserted = await db.query<Row>(`INSERT INTO projects(id,tenant_id,name,status,is_example,origin_user_id,origin_conversation_id)
    VALUES($1,$2,$3,'DRAFT',$4,$5,$6)
    ON CONFLICT (tenant_id,origin_user_id,origin_conversation_id) DO NOTHING RETURNING *`,
    [id, session.tenantId, name.trim().slice(0, 80) || "未命名 SKU", options.isExample ?? false, conversation === undefined ? null : session.userId, conversation ?? null]);
  if (inserted.rows[0]) {
    if (inserted.rows[0].deleted_at) throw new ProjectRepositoryError("NOT_FOUND");
    return view(db, inserted.rows[0]);
  }
  const previous = await db.query<Row>("SELECT * FROM projects WHERE tenant_id=$1 AND origin_user_id=$2 AND origin_conversation_id=$3",
    [session.tenantId, session.userId, conversation]);
  if (!previous.rows[0] || previous.rows[0].deleted_at) throw new ProjectRepositoryError("NOT_FOUND");
  return view(db, previous.rows[0]);
}
