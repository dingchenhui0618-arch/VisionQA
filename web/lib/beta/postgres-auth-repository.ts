import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PgPoolLike, PgQueryable } from "../../db/pg/index.ts";
import type { BetaSessionView } from "./contracts.ts";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export class InviteTransactionError extends Error {
  readonly code: "UNAVAILABLE";
  constructor(code: "UNAVAILABLE", message = "邀请无效、已使用或已过期。") { super(message); this.code = code; }
}

/** Uses the existing beta schema. Raw invite/session tokens never enter the database. */
export async function consumeInvitePg(pool: PgPoolLike, token: string): Promise<{ session: BetaSessionView; sessionToken: string }> {
  if (!token.trim() || token.length > 512) throw new InviteTransactionError("UNAVAILABLE");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Conditional UPDATE serializes competing consumers; a SELECT-only check is insufficient.
    const claimed = await client.query<{ id: string; label: string; role: BetaSessionView["role"]; initial_credits: number }>(
      `UPDATE invites SET consumed_at=CURRENT_TIMESTAMP
       WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>CAST(CURRENT_TIMESTAMP AS timestamptz)
       RETURNING id,label,role,initial_credits`, [hash(token.trim())]);
    const invite = claimed.rows[0];
    if (!invite) throw new InviteTransactionError("UNAVAILABLE");
    const userId = `usr_${randomUUID()}`, tenantId = `ten_${randomUUID()}`, membershipId = `mem_${randomUUID()}`;
    const sessionToken = randomBytes(32).toString("base64url");
    await client.query("INSERT INTO users(id,display_name) VALUES($1,$2)", [userId, invite.label]);
    await client.query("INSERT INTO tenants(id,name) VALUES($1,$2)", [tenantId, `${invite.label}的工作区`]);
    await client.query("INSERT INTO memberships(id,user_id,tenant_id,role) VALUES($1,$2,$3,$4)", [membershipId, userId, tenantId, invite.role]);
    const saved = await client.query<{ expires_at: Date | string }>(
      `INSERT INTO sessions(id,token_hash,user_id,tenant_id,membership_id,expires_at)
       VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP + INTERVAL '30 days') RETURNING expires_at`,
      [`ses_${randomUUID()}`, hash(sessionToken), userId, tenantId, membershipId]);
    await client.query("INSERT INTO credit_wallets(tenant_id,available,held,captured) VALUES($1,$2,0,0)", [tenantId, invite.initial_credits]);
    await client.query(`INSERT INTO credit_ledger_entries(id,tenant_id,entry_type,amount,reference_id,reason)
      VALUES($1,$2,'GRANT',$3,$4,$5)`, [`led_${randomUUID()}`, tenantId, invite.initial_credits, invite.id, "受邀内测初始额度"]);
    await client.query("UPDATE invites SET consumed_by_user_id=$1 WHERE id=$2", [userId, invite.id]);
    const session: BetaSessionView = { userId, tenantId, membershipId, role: invite.role, displayName: invite.label,
      expiresAt: new Date(saved.rows[0].expires_at).toISOString() };
    await client.query("COMMIT");
    return { session, sessionToken };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function resolveSessionPg(db: PgQueryable, token: string | null | undefined): Promise<BetaSessionView | null> {
  if (!token || token.length > 512) return null;
  const result = await db.query<{ user_id: string; tenant_id: string; membership_id: string; role: BetaSessionView["role"]; display_name: string; expires_at: Date | string }>(
    `SELECT s.user_id,s.tenant_id,s.membership_id,m.role,u.display_name,s.expires_at
     FROM sessions s JOIN memberships m ON m.id=s.membership_id AND m.user_id=s.user_id AND m.tenant_id=s.tenant_id
     JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>CAST(CURRENT_TIMESTAMP AS timestamptz)`, [hash(token)]);
  const row = result.rows[0];
  return row ? { userId: row.user_id, tenantId: row.tenant_id, membershipId: row.membership_id,
    role: row.role, displayName: row.display_name, expiresAt: new Date(row.expires_at).toISOString() } : null;
}
