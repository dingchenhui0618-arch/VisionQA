import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { newDb } from "pg-mem";
import { createPostgresDispatchClaimStore } from "../lib/agent/dispatch-claim-store.ts";

test("agent runtime migration applies after the customer beta schema", async () => {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool();
  for (const file of [
    "0000_visionqa_baseline.sql",
    "0001_normalize_storage_provider.sql",
    "0002_customer_beta.sql",
    "0003_agent_runtime.sql",
    "0004_repair_transactions.sql",
    "0005_project_conversation_origin.sql",
    "0006_screening_asset_links.sql",
    "0007_asset_deletion_outbox.sql",
  ]) {
    await pool.query(readFileSync(new URL(`../drizzle-pg/${file}`, import.meta.url), "utf8"));
  }
  for (const table of ["product_conversation_contexts", "image_versions", "model_call_ledger"]) {
    const result = await pool.query(`SELECT 1 FROM ${table} LIMIT 0`);
    assert.equal(result.rowCount, 0);
  }
  await pool.query("INSERT INTO users (id, display_name) VALUES ('u1','User')");
  await pool.query("INSERT INTO tenants (id, name) VALUES ('t1','One'),('t2','Two')");
  await pool.query("INSERT INTO projects (id, tenant_id, name, status) VALUES ('p1','t1','One','DRAFT'),('p2','t2','Two','DRAFT')");
  await pool.query("INSERT INTO batches (id, tenant_id, scenario, status, created_by) VALUES ('b1','t1','test','DRAFT','u1'),('b2','t2','test','DRAFT','u1')");
  await pool.query("INSERT INTO assets (id, batch_id, tenant_id, source_url, product_label, mime_type, byte_size, object_key, retention_until) VALUES ('a1','b1','t1','local:a','sku1','image/png',1,'a',CURRENT_TIMESTAMP),('a2','b2','t2','local:b','sku2','image/png',1,'b',CURRENT_TIMESTAMP)");
  await pool.query("INSERT INTO image_versions (id, tenant_id, project_id, conversation_id, product_id, asset_id, version_kind, instruction) VALUES ('v1','t1','p1','c1','sku1','a1','original','source')");
  await assert.rejects(
    pool.query("INSERT INTO image_versions (id, tenant_id, project_id, conversation_id, product_id, asset_id, parent_version_id, version_kind, instruction) VALUES ('v2','t2','p2','c2','sku2','a2','v1','repair','cross tenant')"),
  );
  const claims = createPostgresDispatchClaimStore(pool);
  const firstClaim = await claims.claim({ tenantId: "t1", idempotencyKey: "dispatch-1", requestId: "repair:v3", fingerprint: "fp3", operation: "IMAGE", providerId: "mock", modelSnapshot: "v1" });
  assert.equal(firstClaim.acquired, true);
  await claims.complete("t1", "dispatch-1", { status: "SUCCEEDED", cost: 0.5, inputImageCount: 2, outputImageCount: 1, latencyMs: 12 });
  const completed = await pool.query<{ status: string; cost_amount: number; input_image_count: number }>("SELECT status, cost_amount, input_image_count FROM model_call_ledger WHERE tenant_id='t1' AND idempotency_key='dispatch-1'");
  assert.deepEqual(completed.rows[0], { status: "SUCCEEDED", cost_amount: 0.5, input_image_count: 2 });
  await pool.query("INSERT INTO model_call_ledger (id, tenant_id, request_id, request_fingerprint, operation, provider_id, model_snapshot, status, idempotency_key) VALUES ('m1','t1','repair:v1','fp','IMAGE','mock','v1','DISPATCHED','same')");
  await assert.rejects(
    pool.query("INSERT INTO model_call_ledger (id, tenant_id, request_id, request_fingerprint, operation, provider_id, model_snapshot, status, idempotency_key) VALUES ('m2','t1','repair:v2','fp2','IMAGE','mock','v1','DISPATCHED','same')"),
  );
  await pool.end();
});
