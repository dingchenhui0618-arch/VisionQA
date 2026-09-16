import { randomUUID } from "node:crypto";
import type { PgPoolLike, PgQueryable } from "../../db/pg/index.ts";
import type { BetaSessionView } from "./contracts.ts";
import { assertScopedObjectKey, type ObjectStorage } from "../storage/object-storage.ts";

/** Hide database assets atomically, then delete objects via a retryable outbox.
 * Caller must map errors to customer-safe messages. This is not yet a live route.
 */
export async function deleteProjectPg(pool: PgPoolLike, session: BetaSessionView, projectId: string): Promise<void> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const member = await db.query("SELECT id FROM memberships WHERE id=$1 AND user_id=$2 AND tenant_id=$3", [session.membershipId, session.userId, session.tenantId]);
    if (!member.rows.length) throw new Error("PROJECT_FORBIDDEN");
    const project = await db.query<{ deleted_at: Date | null }>("SELECT deleted_at FROM projects WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [projectId, session.tenantId]);
    if (!project.rows.length) throw new Error("PROJECT_NOT_FOUND");
    if (project.rows[0].deleted_at) { await db.query("COMMIT"); return; }
    // Do not race provider output publication or a held credit settlement.
    const active = await db.query("SELECT id FROM repair_attempts WHERE project_id=$1 AND tenant_id=$2 AND status IN ('HELD','RUNNING')", [projectId, session.tenantId]);
    const screening = await db.query("SELECT id FROM screening_batches WHERE project_id=$1 AND tenant_id=$2 AND status='RUNNING'", [projectId, session.tenantId]);
    if (active.rows.length || screening.rows.length) throw new Error("PROJECT_BUSY");
    const assets = await db.query<{ id: string; object_key: string | null }>("SELECT id,object_key FROM assets WHERE project_id=$1 AND tenant_id=$2 FOR UPDATE", [projectId, session.tenantId]);
    for (const asset of assets.rows) {
      if (!asset.object_key) continue;
      // Do not issue cloud deletion for legacy or foreign namespace keys.
      assertScopedObjectKey(session.tenantId, asset.object_key);
      await db.query(`INSERT INTO asset_deletion_jobs(id,tenant_id,project_id,asset_id,object_key)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT (tenant_id,asset_id) DO NOTHING`,
        [`del_${randomUUID()}`, session.tenantId, projectId, asset.id, asset.object_key]);
    }
    await db.query("UPDATE assets SET upload_status='DELETED',deleted_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND project_id=$2", [session.tenantId, projectId]);
    await db.query("UPDATE projects SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2", [session.tenantId, projectId]);
    await db.query("COMMIT");
  } catch (error) {
    try { await db.query("ROLLBACK"); } catch { /* preserve original failure */ }
    throw error;
  } finally { db.release(); }
}

/** Trusted server worker, bounded per invocation. Delete is idempotent: a crash
 * after OSS success but before acknowledgement can safely repeat deletion.
 */
export async function drainAssetDeletionJobsPg(db: PgQueryable, storage: ObjectStorage, limit = 20) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("INVALID_DELETE_LIMIT");
  const jobs = await db.query<{ id: string; tenant_id: string; object_key: string }>(
    "SELECT id,tenant_id,object_key FROM asset_deletion_jobs WHERE status='PENDING' ORDER BY created_at,id LIMIT $1", [limit]);
  let completed = 0, failed = 0;
  for (const job of jobs.rows) {
    try {
      assertScopedObjectKey(job.tenant_id, job.object_key);
      await db.query("UPDATE asset_deletion_jobs SET attempts=attempts+1 WHERE id=$1 AND status='PENDING'", [job.id]);
      await storage.delete({ tenantId: job.tenant_id, objectKey: job.object_key });
      await db.query("UPDATE asset_deletion_jobs SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='PENDING'", [job.id]);
      completed++;
    } catch { failed++; } // Keep pending; no raw provider errors or asset URLs in logs.
  }
  return { completed, failed };
}
