import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { newDb } from "pg-mem";
import {
  RepairTransactionError,
  beginRepairPg,
  captureRepairPg,
  claimRepairExecutionPg,
  recoverInterruptedRepairsPg,
  releaseRepairPg,
} from "../lib/beta/postgres-repair-repository.ts";

async function fixture() {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool();
  for (const file of ["0000_visionqa_baseline.sql", "0001_normalize_storage_provider.sql", "0002_customer_beta.sql", "0003_agent_runtime.sql", "0004_repair_transactions.sql"]) {
    await pool.query(readFileSync(new URL(`../drizzle-pg/${file}`, import.meta.url), "utf8"));
  }
  await pool.query("INSERT INTO users (id,display_name) VALUES ('u1','User')");
  await pool.query("INSERT INTO tenants (id,name) VALUES ('t1','One'),('t2','Two')");
  await pool.query("INSERT INTO projects (id,tenant_id,name,status) VALUES ('p1','t1','SKU','DRAFT'),('p2','t2','Other','DRAFT')");
  await pool.query("INSERT INTO batches (id,tenant_id,scenario,status,created_by) VALUES ('legacy1','t1','test','DRAFT','u1'),('legacy2','t2','test','DRAFT','u1')");
  await pool.query("INSERT INTO assets (id,batch_id,tenant_id,project_id,asset_role,source_url,product_label,mime_type,byte_size,object_key,upload_status) VALUES ('src1','legacy1','t1','p1','CANDIDATE','local:src','sku','image/png',1,'src','READY'),('out1','legacy1','t1','p1','REPAIR_OUTPUT','local:out','sku','image/png',1,'out','READY'),('src2','legacy2','t2','p2','CANDIDATE','local:src2','sku2','image/png',1,'src2','READY')");
  await pool.query("INSERT INTO screening_batches (id,tenant_id,project_id,sku_name,status) VALUES ('sb1','t1','p1','SKU','COMPLETED'),('sb2','t2','p2','Other','COMPLETED')");
  await pool.query("INSERT INTO screening_items (id,tenant_id,batch_id,asset_id,decision,visible_evidence) VALUES ('si1','t1','sb1','src1','NEEDS_ATTENTION','issue'),('si2','t2','sb2','src2','NEEDS_ATTENTION','issue')");
  await pool.query("INSERT INTO credit_wallets (tenant_id,available,held,captured) VALUES ('t1',2,0,0),('t2',2,0,0)");
  return pool;
}

const input = (id = "rep1", key = "key1") => ({
  id, holdId: `hold-${id}`, tenantId: "t1", projectId: "p1", screeningItemId: "si1", sourceAssetId: "src1",
  issue: "修正袖口", issueRegion: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, lockedRegions: [{ x: 0.5, y: 0.5, width: 0.2, height: 0.2 }],
  idempotencyKey: key, requestFingerprint: `fingerprint-${key}`, gateVersion: "customer-basic-gate-v0.1",
});

test("begin repair atomically creates attempt, hold, ledger and debit; replay is free", async () => {
  const pool = await fixture();
  const first = await beginRepairPg(pool, input());
  const replay = await beginRepairPg(pool, input("another", "key1"));
  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  assert.equal(replay.attempt.id, "rep1");
  assert.deepEqual(replay.credits, { available: 1, held: 1, captured: 0, label: "内测额度" });
  const rows = await pool.query("SELECT entry_type FROM credit_ledger_entries WHERE tenant_id='t1'");
  assert.equal(rows.rows.length, 1);
  await assert.rejects(beginRepairPg(pool, { ...input("rep-x", "key1"), requestFingerprint: "different" }), (error: unknown) => error instanceof RepairTransactionError && error.code === "CONFLICT");
  await pool.end();
});

test("only one active repair per product project and tenant boundaries fail closed", async () => {
  const pool = await fixture();
  await beginRepairPg(pool, input());
  await assert.rejects(beginRepairPg(pool, input("rep2", "key2")));
  await assert.rejects(beginRepairPg(pool, { ...input("foreign", "foreign"), screeningItemId: "si2", sourceAssetId: "src2" }), (error: unknown) => error instanceof RepairTransactionError && error.code === "FORBIDDEN");
  await pool.end();
});

test("claim and capture settle once across repeated calls", async () => {
  const pool = await fixture();
  await beginRepairPg(pool, input());
  const claims = await Promise.all([
    claimRepairExecutionPg(pool, "t1", "rep1", "worker-a"),
    claimRepairExecutionPg(pool, "t1", "rep1", "worker-b"),
  ]);
  assert.equal(claims.filter(result => result.acquired).length, 1);
  const winner = claims[0].acquired ? "worker-a" : "worker-b";
  const loser = winner === "worker-a" ? "worker-b" : "worker-a";
  await assert.rejects(captureRepairPg(pool, "t1", "rep1", "out1", winner), (error: unknown) => error instanceof RepairTransactionError && error.code === "FORBIDDEN");
  await pool.query("UPDATE assets SET repair_attempt_id='rep1' WHERE id='out1'");
  await assert.rejects(captureRepairPg(pool, "t1", "rep1", "out1", loser), (error: unknown) => error instanceof RepairTransactionError && error.code === "INVALID_STATE");
  const first = await captureRepairPg(pool, "t1", "rep1", "out1", winner);
  const replay = await captureRepairPg(pool, "t1", "rep1", "out1", winner);
  assert.equal(first.attempt.status, "CAPTURED");
  assert.deepEqual(replay.credits, { available: 1, held: 0, captured: 1, label: "内测额度" });
  const ledger = await pool.query("SELECT entry_type FROM credit_ledger_entries WHERE reference_id='rep1' ORDER BY entry_type");
  assert.deepEqual(ledger.rows.map((row: Record<string, unknown>) => row.entry_type), ["CAPTURE", "HOLD"]);
  const nextRound = await beginRepairPg(pool, { ...input("rep2", "key2"), sourceAssetId: "out1", requestFingerprint: "fingerprint-key2" });
  assert.equal(nextRound.attempt.sourceAssetId, "out1");
  await pool.end();
});

test("failure and restart recovery release exactly once", async () => {
  const pool = await fixture();
  await beginRepairPg(pool, input());
  assert.equal((await claimRepairExecutionPg(pool, "t1", "rep1", "worker-a")).acquired, true);
  assert.equal(await recoverInterruptedRepairsPg(pool), 1);
  assert.equal(await recoverInterruptedRepairsPg(pool), 0);
  const replay = await releaseRepairPg(pool, "t1", "rep1", "again");
  assert.equal(replay.attempt.status, "RELEASED");
  assert.deepEqual(replay.credits, { available: 2, held: 0, captured: 0, label: "内测额度" });
  const ledger = await pool.query("SELECT entry_type FROM credit_ledger_entries WHERE reference_id='rep1' ORDER BY entry_type");
  assert.deepEqual(ledger.rows.map((row: Record<string, unknown>) => row.entry_type), ["HOLD", "RELEASE"]);
  await pool.end();
});

test("insufficient credits creates no partial attempt", async () => {
  const pool = await fixture();
  await pool.query("UPDATE credit_wallets SET available=0 WHERE tenant_id='t1'");
  await assert.rejects(beginRepairPg(pool, input()), (error: unknown) => error instanceof RepairTransactionError && error.code === "INSUFFICIENT_CREDITS");
  assert.equal((await pool.query("SELECT id FROM repair_attempts")).rows.length, 0);
  assert.equal((await pool.query("SELECT id FROM credit_holds")).rows.length, 0);
  await pool.end();
});
