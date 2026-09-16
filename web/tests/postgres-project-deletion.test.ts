import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newDb } from "pg-mem";
import { deleteProjectPg, drainAssetDeletionJobsPg } from "../lib/beta/postgres-project-deletion.ts";
import type { ObjectStorage } from "../lib/storage/object-storage.ts";
const session = { userId: "u", tenantId: "t", membershipId: "m", role: "customer" as const, displayName: "User", expiresAt: "2099-01-01" };
async function fixture() {
  const pool = new (newDb().adapters.createPg().Pool)();
  for (const file of ["0000_visionqa_baseline.sql", "0001_normalize_storage_provider.sql", "0002_customer_beta.sql", "0007_asset_deletion_outbox.sql"]) {
    await pool.query(readFileSync(new URL(`../drizzle-pg/${file}`, import.meta.url), "utf8"));
  }
  await pool.query("INSERT INTO users(id,display_name) VALUES('u','User'); INSERT INTO tenants(id,name) VALUES('t','Tenant'); INSERT INTO memberships(id,user_id,tenant_id,role) VALUES('m','u','t','customer'); INSERT INTO projects(id,tenant_id,name,status) VALUES('p','t','SKU','DRAFT')");
  await pool.query("INSERT INTO assets(id,batch_id,tenant_id,project_id,source_url,product_label,object_key,upload_status) VALUES('a','legacy','t','p','private:a','SKU','staging/visionqa/t/a','READY')");
  return pool;
}
test("project deletion hides assets and retains a retryable object deletion job", async () => {
  const db = await fixture();
  await deleteProjectPg(db, session, "p");
  await deleteProjectPg(db, session, "p");
  assert.equal((await db.query("SELECT * FROM asset_deletion_jobs")).rows.length, 1);
  assert.equal((await db.query("SELECT upload_status FROM assets")).rows[0].upload_status, "DELETED");
  let calls = 0;
  const storage = { delete: async () => { if (++calls === 1) throw new Error("cloud unavailable"); return { deleted: true }; } } as unknown as ObjectStorage;
  assert.deepEqual(await drainAssetDeletionJobsPg(db, storage), { completed: 0, failed: 1 });
  assert.deepEqual(await drainAssetDeletionJobsPg(db, storage), { completed: 1, failed: 0 });
  assert.deepEqual(await drainAssetDeletionJobsPg(db, storage), { completed: 0, failed: 0 });
  assert.equal(calls, 2);
  await db.end();
});
test("foreign caller and active screening cannot delete a project", async () => {
  const db = await fixture();
  await assert.rejects(deleteProjectPg(db, { ...session, tenantId: "other" }, "p"), /FORBIDDEN/);
  await db.query("INSERT INTO screening_batches(id,tenant_id,project_id,sku_name,status) VALUES('b','t','p','SKU','RUNNING')");
  await assert.rejects(deleteProjectPg(db, session, "p"), /BUSY/);
  assert.equal((await db.query("SELECT deleted_at FROM projects")).rows[0].deleted_at, null);
  assert.equal((await db.query("SELECT * FROM asset_deletion_jobs")).rows.length, 0);
  await db.end();
});
