import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newDb } from "pg-mem";
import type { BetaSessionView } from "../lib/beta/contracts.ts";
import { createProjectPg, getProjectPg, listProjectsPg } from "../lib/beta/postgres-project-repository.ts";

const session = (suffix = "1"): BetaSessionView => ({ userId: `u${suffix}`, tenantId: `t${suffix}`, membershipId: `m${suffix}`,
  role: "customer", displayName: "客户", expiresAt: "2099-01-01" });
async function fixture() {
  const pool = new (newDb().adapters.createPg().Pool)();
  for (const file of ["0000_visionqa_baseline.sql", "0001_normalize_storage_provider.sql", "0002_customer_beta.sql", "0003_agent_runtime.sql", "0004_repair_transactions.sql", "0005_project_conversation_origin.sql", "0006_screening_asset_links.sql"]) {
    await pool.query(readFileSync(new URL(`../drizzle-pg/${file}`, import.meta.url), "utf8"));
  }
  for (const n of ["1", "2"]) {
    await pool.query("INSERT INTO users(id,display_name) VALUES($1,'User')", [`u${n}`]);
    await pool.query("INSERT INTO tenants(id,name) VALUES($1,'Tenant')", [`t${n}`]);
    await pool.query("INSERT INTO memberships(id,user_id,tenant_id,role) VALUES($1,$2,$3,'customer')", [`m${n}`, `u${n}`, `t${n}`]);
  }
  return pool;
}

test("conversation origin replays one project and preserves its original name", async () => {
  const pool = await fixture();
  const first = await createProjectPg(pool, session(), "灰色上衣", { conversationId: "chat-1" });
  const second = await createProjectPg(pool, session(), "不同名称", { conversationId: "chat-1" });
  assert.equal(first.id, second.id);
  assert.equal(second.name, "灰色上衣");
  assert.equal((await listProjectsPg(pool, session())).length, 1);
  assert.equal(first.candidateCount, 0);
  assert.equal(first.repairedCount, 0);
  await pool.end();
});

test("origins are tenant and user scoped; invalid memberships cannot read projects", async () => {
  const pool = await fixture();
  const one = await createProjectPg(pool, session(), "SKU", { conversationId: "same" });
  const two = await createProjectPg(pool, session("2"), "SKU", { conversationId: "same" });
  assert.notEqual(one.id, two.id);
  await assert.rejects(getProjectPg(pool, session("2"), one.id), /NOT_FOUND/);
  await assert.rejects(listProjectsPg(pool, { ...session(), tenantId: "t2" }), /FORBIDDEN/);
  await pool.query("INSERT INTO memberships(id,user_id,tenant_id,role) VALUES('m3','u2','t1','customer')");
  const three = await createProjectPg(pool, { ...session(), userId: "u2", membershipId: "m3" }, "SKU", { conversationId: "same" });
  assert.notEqual(three.id, one.id);
  await pool.end();
});

test("deleted origin stays reserved and cannot resurrect on replay", async () => {
  const pool = await fixture();
  const created = await createProjectPg(pool, session(), "SKU", { conversationId: "chat" });
  await pool.query("UPDATE projects SET deleted_at=CURRENT_TIMESTAMP WHERE id=$1", [created.id]);
  await assert.rejects(createProjectPg(pool, session(), "SKU", { conversationId: "chat" }), /NOT_FOUND/);
  await assert.rejects(getProjectPg(pool, session(), created.id), /NOT_FOUND/);
  assert.equal((await listProjectsPg(pool, session())).length, 0);
  assert.equal((await pool.query("SELECT * FROM projects")).rows.length, 1);
  await pool.end();
});

test("ordinary projects remain independent and invalid origins create nothing", async () => {
  const pool = await fixture();
  const a = await createProjectPg(pool, session(), "SKU");
  const b = await createProjectPg(pool, session(), "SKU");
  assert.notEqual(a.id, b.id);
  await assert.rejects(createProjectPg(pool, session(), "SKU", { conversationId: " " }), /INVALID_INPUT/);
  assert.equal((await listProjectsPg(pool, session())).length, 2);
  await pool.end();
});

test("project counts derive from latest screening and captured repairs, not historical findings", async () => {
  const pool = await fixture();
  const project = await createProjectPg(pool, session(), "SKU");
  await pool.query(`INSERT INTO assets(id,batch_id,tenant_id,project_id,asset_role,source_url,product_label,upload_status)
    VALUES('candidate','legacy','t1',$1,'CANDIDATE','private:c','sku','READY'),
    ('pending','legacy','t1',$1,'CANDIDATE','private:p','sku','PENDING'),
    ('output','legacy','t1',$1,'REPAIR_OUTPUT','private:o','sku','READY')`, [project.id]);
  assert.equal((await getProjectPg(pool, session(), project.id)).candidateCount, 1);
  await pool.query(`INSERT INTO screening_batches(id,tenant_id,project_id,sku_name,status,created_at)
    VALUES('old','t1',$1,'SKU','COMPLETED','2026-01-01'),('new','t1',$1,'SKU','COMPLETED','2026-01-02')`, [project.id]);
  await pool.query(`INSERT INTO screening_items(id,tenant_id,batch_id,asset_id,decision,visible_evidence)
    VALUES('old-item','t1','old','candidate','NEEDS_ATTENTION','old'),('new-item','t1','new','candidate','NO_OBVIOUS_ISSUE','new')`);
  await pool.query(`INSERT INTO repair_attempts(id,tenant_id,project_id,screening_item_id,source_asset_id,output_asset_id,
    issue,issue_region_json,locked_regions_json,status,gate_version,gate_result,idempotency_key,request_fingerprint)
    VALUES('accepted','t1',$1,'old-item','candidate','output','issue','{}','[]','CAPTURED','v1','PASSED','k1','f1'),
    ('failed','t1',$1,'old-item','candidate',NULL,'issue','{}','[]','RELEASED','v1','BLOCKED','k2','f2')`, [project.id]);
  const view = await getProjectPg(pool, session(), project.id);
  assert.equal(view.candidateCount, 1);
  assert.equal(view.attentionCount, 0);
  assert.equal(view.repairedCount, 1);
  await pool.query("INSERT INTO screening_batches(id,tenant_id,project_id,sku_name,status,created_at,idempotency_key) VALUES('running','t1',$1,'SKU','RUNNING','2026-01-03','running-key')", [project.id]);
  await pool.query("INSERT INTO screening_batch_assets(id,tenant_id,batch_id,asset_id,role,position) VALUES('link','t1','running','candidate','CANDIDATE',0)");
  await pool.query("UPDATE assets SET upload_status='READY' WHERE id='pending'");
  assert.equal((await getProjectPg(pool, session(), project.id)).candidateCount, 1);
  await pool.query("UPDATE screening_batches SET status='FAILED' WHERE id='running'");
  assert.equal((await getProjectPg(pool, session(), project.id)).candidateCount, 1);
  await pool.end();
});
