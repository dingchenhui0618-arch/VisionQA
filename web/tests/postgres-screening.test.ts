import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { newDb } from "pg-mem";
import { createScreeningBatchPg, ScreeningRepositoryError } from "../lib/beta/postgres-screening-repository.ts";

async function fixture() {
  const memory = newDb({ autoCreateForeignKeyIndices: true }); const adapter = memory.adapters.createPg(); const pool = new adapter.Pool();
  for (const file of ["0000_visionqa_baseline.sql", "0001_normalize_storage_provider.sql", "0002_customer_beta.sql", "0006_screening_asset_links.sql"]) await pool.query(readFileSync(new URL(`../drizzle-pg/${file}`, import.meta.url), "utf8"));
  await pool.query("INSERT INTO users(id,display_name) VALUES ('u1','User')"); await pool.query("INSERT INTO tenants(id,name) VALUES ('t1','One'),('t2','Two')");
  await pool.query("INSERT INTO memberships(id,user_id,tenant_id,role) VALUES ('m1','u1','t1','customer')");
  await pool.query("INSERT INTO projects(id,tenant_id,name,status) VALUES ('p1','t1','SKU','DRAFT'),('p2','t2','Other','DRAFT')");
  await pool.query("INSERT INTO assets(id,batch_id,tenant_id,project_id,asset_role,source_url,product_label,mime_type,byte_size,object_key,upload_status,retention_until) VALUES ('t','legacy','t1','p1','TRUTH','local:t','sku','image/png',1,'t','READY',CURRENT_TIMESTAMP+INTERVAL '1 day'),('c1','legacy','t1','p1','CANDIDATE','local:c1','sku','image/png',1,'c1','READY',CURRENT_TIMESTAMP+INTERVAL '1 day'),('c2','legacy','t1','p1','CANDIDATE','local:c2','sku','image/png',1,'c2','READY',CURRENT_TIMESTAMP+INTERVAL '1 day'),('foreign','legacy','t2','p2','CANDIDATE','local:f','sku','image/png',1,'f','READY',CURRENT_TIMESTAMP+INTERVAL '1 day'),('pending','legacy','t1','p1','CANDIDATE','local:p','sku','image/png',1,'p','PENDING',CURRENT_TIMESTAMP+INTERVAL '1 day')");
  return pool;
}
const session = { userId: "u1", tenantId: "t1", membershipId: "m1", role: "customer", displayName: "User", expiresAt: "2999-01-01T00:00:00.000Z" } as const;

test("screening enforces 10/11 boundary, immutable request identity and deleted project replay", async () => {
  const pool = await fixture();
  for (let i = 3; i <= 11; i++) await pool.query(`INSERT INTO assets(id,batch_id,tenant_id,project_id,asset_role,source_url,product_label,upload_status,retention_until)
    VALUES($1,'legacy','t1','p1','CANDIDATE','private:test','sku','READY','2099-01-01')`, [`c${i}`]);
  const base = { projectId: "p1", skuName: "SKU", truthAssetIds: ["t"], candidateAssetIds: Array.from({ length: 10 }, (_, i) => `c${i + 1}`), idempotencyKey: "boundary" };
  await assert.rejects(createScreeningBatchPg(pool, session, { ...base, candidateAssetIds: [...base.candidateAssetIds, "c11"] }), /1-10/);
  const first = await createScreeningBatchPg(pool, session, base);
  assert.equal(first.batch.candidateAssetIds.length, 10);
  await assert.rejects(createScreeningBatchPg(pool, session, { ...base, candidateAssetIds: ["c1"] }), /different screening/);
  await pool.query("UPDATE screening_batches SET status='COMPLETED' WHERE id=$1", [first.batch.id]);
  await pool.query("INSERT INTO screening_items(id,tenant_id,batch_id,asset_id,decision,visible_evidence) VALUES('item','t1',$1,'c1','NEEDS_ATTENTION','visible')", [first.batch.id]);
  assert.equal((await createScreeningBatchPg(pool, session, base)).batch.items.length, 1);
  await pool.query("UPDATE projects SET deleted_at=CURRENT_TIMESTAMP WHERE id='p1'");
  await assert.rejects(createScreeningBatchPg(pool, session, base), /not found/);
  await pool.end();
});

test("foreign, expired and retention-unknown assets cannot enter a screening batch", async () => {
  const pool = await fixture();
  const base = { projectId: "p1", skuName: "SKU", truthAssetIds: ["t"], candidateAssetIds: ["foreign"], idempotencyKey: "invalid" };
  await assert.rejects(createScreeningBatchPg(pool, session, base), /ready/);
  await pool.query("UPDATE assets SET retention_until=NULL WHERE id='c1'");
  await assert.rejects(createScreeningBatchPg(pool, session, { ...base, candidateAssetIds: ["c1"] }), /ready/);
  await pool.query("UPDATE assets SET retention_until='2000-01-01' WHERE id='c1'");
  await assert.rejects(createScreeningBatchPg(pool, session, { ...base, candidateAssetIds: ["c1"] }), /ready/);
  assert.equal((await pool.query("SELECT * FROM screening_batches")).rows.length, 0);
  await pool.end();
});

test("screening batch persists ordered truth/candidate links and idempotent replay", async () => { const pool = await fixture(); const input = { projectId: "p1", skuName: "SKU 1", truthAssetIds: ["t"], candidateAssetIds: ["c2", "c1"], idempotencyKey: "k1", requestFingerprint: "fp1" }; const first = await createScreeningBatchPg(pool, session, input); const replay = await createScreeningBatchPg(pool, { ...session }, { ...input, id: "different" }); assert.equal(first.created, true); assert.equal(replay.created, false); assert.equal(replay.batch.id, first.batch.id); assert.deepEqual(replay.batch.candidateAssetIds, ["c2", "c1"]); assert.equal((await pool.query("SELECT COUNT(*) AS count FROM screening_batch_assets")).rows[0].count, 3); await pool.end(); });
test("screening validates tenant/project, ready state, duplicates, and running conflict", async () => { const pool = await fixture(); const base = { projectId: "p1", skuName: "SKU", truthAssetIds: ["t"], candidateAssetIds: ["c1"], idempotencyKey: "k" }; await assert.rejects(createScreeningBatchPg(pool, session, { ...base, candidateAssetIds: ["t"] }), (e: unknown) => e instanceof ScreeningRepositoryError && e.code === "INVALID_INPUT"); await assert.rejects(createScreeningBatchPg(pool, session, { ...base, candidateAssetIds: ["pending"] }), (e: unknown) => e instanceof ScreeningRepositoryError && e.code === "FORBIDDEN"); await createScreeningBatchPg(pool, session, base); await assert.rejects(createScreeningBatchPg(pool, session, { ...base, idempotencyKey: "k2" }), (e: unknown) => e instanceof ScreeningRepositoryError && e.code === "CONFLICT"); await pool.end(); });
