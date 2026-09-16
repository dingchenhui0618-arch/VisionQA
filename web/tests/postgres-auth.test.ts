import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { newDb } from "pg-mem";
import { consumeInvitePg, resolveSessionPg } from "../lib/beta/postgres-auth-repository.ts";
import type { PgPoolLike } from "../db/pg/index.ts";

async function fixture() {
  const memory = newDb();
  const pool = new (memory.adapters.createPg().Pool)();
  for (const file of ["0000_visionqa_baseline.sql", "0001_normalize_storage_provider.sql", "0002_customer_beta.sql"]) {
    await pool.query(readFileSync(new URL(`../drizzle-pg/${file}`, import.meta.url), "utf8"));
  }
  await pool.query(`INSERT INTO invites(id,token_hash,label,role,initial_credits,expires_at)
    VALUES('invite',$1,'客户','customer',5,'2099-01-01')`, [createHash("sha256").update("test-invite").digest("hex")]);
  return { pool, memory };
}

test("invite creates one identity, wallet and hashed session; replay cannot grant credits again", async () => {
  const { pool } = await fixture();
  const created = await consumeInvitePg(pool, "test-invite");
  assert.deepEqual(await resolveSessionPg(pool, created.sessionToken), created.session);
  const sessionRows = await pool.query("SELECT token_hash FROM sessions");
  assert.notEqual(sessionRows.rows[0].token_hash, created.sessionToken);
  assert.equal(sessionRows.rows[0].token_hash.length, 64);
  await assert.rejects(consumeInvitePg(pool, "test-invite"), /邀请/);
  assert.equal((await pool.query("SELECT * FROM users")).rows.length, 1);
  assert.equal((await pool.query("SELECT * FROM credit_ledger_entries")).rows.length, 1);
  assert.equal((await pool.query("SELECT available FROM credit_wallets")).rows[0].available, 5);
  await pool.end();
});

test("expired, unknown invites and expired/revoked sessions fail closed", async () => {
  const { pool } = await fixture();
  await assert.rejects(consumeInvitePg(pool, "unknown"));
  await pool.query("UPDATE invites SET expires_at='2000-01-01'");
  await assert.rejects(consumeInvitePg(pool, "test-invite"));
  assert.equal((await pool.query("SELECT * FROM users")).rows.length, 0);
  await pool.query("UPDATE invites SET expires_at='2099-01-01'");
  const created = await consumeInvitePg(pool, "test-invite");
  assert.equal(await resolveSessionPg(pool, "unknown"), null);
  await pool.query("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP");
  assert.equal(await resolveSessionPg(pool, created.sessionToken), null);
  await pool.query("UPDATE sessions SET revoked_at=NULL,expires_at='2000-01-01'");
  assert.equal(await resolveSessionPg(pool, created.sessionToken), null);
  await pool.end();
});

test("session cannot borrow a membership from another tenant", async () => {
  const { pool } = await fixture();
  const created = await consumeInvitePg(pool, "test-invite");
  await pool.query("INSERT INTO tenants(id,name) VALUES('foreign','Other')");
  await pool.query("UPDATE sessions SET tenant_id='foreign'");
  assert.equal(await resolveSessionPg(pool, created.sessionToken), null);
  await pool.end();
});

test("mid-transaction write failure requests rollback and always releases the client", async () => {
  const statements: string[] = [];
  let released = false;
  const client = {
    async query(sql: string) {
      statements.push(sql);
      if (sql.startsWith("UPDATE invites SET consumed_at")) return { rows: [{ id: "i", label: "客户", role: "customer", initial_credits: 5 }], rowCount: 1 };
      if (sql.startsWith("INSERT INTO tenants")) throw new Error("injected database failure");
      return { rows: [], rowCount: 0 };
    },
    release() { released = true; },
  };
  // Protocol test only: pg-mem does not emulate PostgreSQL transaction rollback.
  const pool = { connect: async () => client } as unknown as PgPoolLike;
  await assert.rejects(consumeInvitePg(pool, "token"), /injected database failure/);
  assert.equal(statements[0], "BEGIN");
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.equal(statements.includes("COMMIT"), false);
  assert.equal(released, true);
});
