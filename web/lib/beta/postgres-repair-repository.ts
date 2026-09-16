import type { PgClientLike, PgPoolLike, PgQueryable } from "../../db/pg/index.ts";
import type { CreditBalance, RepairAttempt } from "./contracts.ts";

type Region = RepairAttempt["issueRegion"];

export type BeginRepairPgInput = {
  id: string;
  holdId: string;
  tenantId: string;
  projectId: string;
  screeningItemId: string;
  sourceAssetId: string;
  issue: string;
  issueRegion: Region;
  lockedRegions: Region[];
  idempotencyKey: string;
  requestFingerprint: string;
  gateVersion: string;
};

export class RepairTransactionError extends Error {
  readonly code: "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INSUFFICIENT_CREDITS" | "INVALID_STATE";
  constructor(code: RepairTransactionError["code"], message: string) {
    super(message);
    this.name = "RepairTransactionError";
    this.code = code;
  }
}

type AttemptRow = {
  id: string; tenant_id: string; project_id: string; screening_item_id: string;
  source_asset_id: string; output_asset_id: string | null; issue: string;
  issue_region_json: Region | string; locked_regions_json: Region[] | string;
  status: RepairAttempt["status"]; gate_version: string; gate_result: RepairAttempt["gateResult"];
  idempotency_key: string; request_fingerprint: string; failure_reason: string | null;
  execution_owner: string | null;
  created_at: Date | string; updated_at: Date | string; hold_id: string;
};

const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const json = <T>(value: T | string): T => typeof value === "string" ? JSON.parse(value) as T : value;

function attempt(row: AttemptRow): RepairAttempt {
  return {
    id: row.id, tenantId: row.tenant_id, projectId: row.project_id,
    screeningItemId: row.screening_item_id, sourceAssetId: row.source_asset_id,
    outputAssetId: row.output_asset_id, issue: row.issue,
    issueRegion: json(row.issue_region_json), lockedRegions: json(row.locked_regions_json),
    status: row.status, holdId: row.hold_id, gateVersion: row.gate_version,
    gateResult: row.gate_result, idempotencyKey: row.idempotency_key,
    failureReason: row.failure_reason, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
}

async function tx<T>(pool: PgPoolLike, run: (client: PgClientLike) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await run(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
    throw error;
  } finally { client.release(); }
}

async function findAttempt(db: PgQueryable, tenantId: string, attemptId: string, lock = false): Promise<AttemptRow | null> {
  const result = await db.query<AttemptRow>(
    `SELECT a.*, h.id AS hold_id FROM repair_attempts a
     JOIN credit_holds h ON h.repair_attempt_id = a.id
     WHERE a.tenant_id=$1 AND a.id=$2${lock ? " FOR UPDATE" : ""}`,
    [tenantId, attemptId],
  );
  return result.rows[0] ?? null;
}

async function wallet(db: PgQueryable, tenantId: string): Promise<CreditBalance> {
  const result = await db.query<{ available: number; held: number; captured: number }>(
    "SELECT available,held,captured FROM credit_wallets WHERE tenant_id=$1", [tenantId],
  );
  const value = result.rows[0];
  if (!value) throw new RepairTransactionError("NOT_FOUND", "credit wallet was not found");
  return { ...value, label: "内测额度" };
}

export async function beginRepairPg(pool: PgPoolLike, input: BeginRepairPgInput): Promise<{ attempt: RepairAttempt; credits: CreditBalance; created: boolean }> {
  const write = () => tx(pool, async client => {
    const replay = await client.query<AttemptRow & { hold_id: string }>(
      `SELECT a.*, h.id AS hold_id FROM repair_attempts a
       JOIN credit_holds h ON h.repair_attempt_id=a.id
       WHERE a.tenant_id=$1 AND a.idempotency_key=$2 FOR UPDATE`,
      [input.tenantId, input.idempotencyKey],
    );
    if (replay.rows[0]) {
      if (replay.rows[0].request_fingerprint !== input.requestFingerprint) throw new RepairTransactionError("CONFLICT", "idempotency key was used for a different repair request");
      return { attempt: attempt(replay.rows[0]), credits: await wallet(client, input.tenantId), created: false };
    }
    const project = await client.query<{ id: string }>("SELECT id FROM projects WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE", [input.tenantId, input.projectId]);
    if (!project.rows[0]) throw new RepairTransactionError("NOT_FOUND", "project was not found for tenant");
    const item = await client.query<{ id: string; asset_id: string }>(
      `SELECT i.id,i.asset_id FROM screening_items i JOIN screening_batches b ON b.id=i.batch_id
       WHERE i.tenant_id=$1 AND i.id=$2 AND b.project_id=$3 FOR SHARE`,
      [input.tenantId, input.screeningItemId, input.projectId],
    );
    if (!item.rows[0]) throw new RepairTransactionError("FORBIDDEN", "screening item does not belong to this project");
    const asset = await client.query<{ id: string }>("SELECT id FROM assets WHERE tenant_id=$1 AND id=$2 AND project_id=$3 AND deleted_at IS NULL FOR SHARE", [input.tenantId, input.sourceAssetId, input.projectId]);
    if (!asset.rows[0]) throw new RepairTransactionError("FORBIDDEN", "source asset does not belong to this project");
    if (input.sourceAssetId !== item.rows[0].asset_id) {
      const prior = await client.query<{ id: string }>(
        `SELECT id FROM repair_attempts WHERE tenant_id=$1 AND project_id=$2 AND screening_item_id=$3
         AND output_asset_id=$4 AND status='CAPTURED' FOR SHARE`,
        [input.tenantId,input.projectId,input.screeningItemId,input.sourceAssetId],
      );
      if (!prior.rows[0]) throw new RepairTransactionError("FORBIDDEN", "source asset is not an accepted version of this screening item");
    }
    const debited = await client.query<{ available: number; held: number; captured: number }>(
      `UPDATE credit_wallets SET available = available - 1, held = held + 1, updated_at=CURRENT_TIMESTAMP
       WHERE tenant_id=$1 AND available>=1 RETURNING available,held,captured`, [input.tenantId],
    );
    if (!debited.rows[0]) throw new RepairTransactionError("INSUFFICIENT_CREDITS", "no available repair credits");
    const inserted = await client.query<AttemptRow>(
      `INSERT INTO repair_attempts
       (id,tenant_id,project_id,screening_item_id,source_asset_id,issue,issue_region_json,
        locked_regions_json,status,gate_version,gate_result,idempotency_key,request_fingerprint)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'HELD',$9,'PENDING',$10,$11) RETURNING *`,
      [input.id,input.tenantId,input.projectId,input.screeningItemId,input.sourceAssetId,input.issue,
        JSON.stringify(input.issueRegion),JSON.stringify(input.lockedRegions),input.gateVersion,input.idempotencyKey,input.requestFingerprint],
    );
    await client.query("INSERT INTO credit_holds (id,tenant_id,repair_attempt_id,status) VALUES ($1,$2,$3,'HELD')", [input.holdId,input.tenantId,input.id]);
    await client.query("INSERT INTO credit_ledger_entries (id,tenant_id,entry_type,amount,reference_id,reason) VALUES ($1,$2,'HOLD',-1,$3,$4)", [`led_${crypto.randomUUID()}`,input.tenantId,input.id,"修图任务冻结 1 次额度"]);
    await client.query("UPDATE projects SET status='REPAIRING',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2", [input.tenantId,input.projectId]);
    await client.query("INSERT INTO audit_events (request_id,tenant_id,entity_type,entity_id,action,actor_id,payload_json) VALUES ($1,$2,'repair_attempt',$3,'HELD','system:repair-transaction',$4)", [input.idempotencyKey,input.tenantId,input.id,JSON.stringify({ project_id: input.projectId, screening_item_id: input.screeningItemId })]);
    return { attempt: attempt({ ...inserted.rows[0], hold_id: input.holdId }), credits: { ...debited.rows[0], label: "内测额度" }, created: true };
  });
  try {
    return await write();
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
    if (code !== "23505") throw error;
    const replay = await pool.query<AttemptRow & { hold_id: string }>(
      `SELECT a.*,h.id AS hold_id FROM repair_attempts a JOIN credit_holds h ON h.repair_attempt_id=a.id
       WHERE a.tenant_id=$1 AND a.idempotency_key=$2`, [input.tenantId,input.idempotencyKey],
    );
    if (replay.rows[0]?.request_fingerprint === input.requestFingerprint) return { attempt: attempt(replay.rows[0]), credits: await wallet(pool,input.tenantId), created: false };
    throw new RepairTransactionError("CONFLICT", "another active repair or conflicting idempotency key already exists");
  }
}

export async function claimRepairExecutionPg(pool: PgPoolLike, tenantId: string, attemptId: string, owner: string): Promise<{ attempt: RepairAttempt; acquired: boolean }> {
  if (!owner.trim()) throw new RepairTransactionError("INVALID_STATE", "execution owner is required");
  const updated = await pool.query<{ id: string }>(
    `UPDATE repair_attempts SET status='RUNNING',execution_owner=$3,execution_started_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
     WHERE tenant_id=$1 AND id=$2 AND status='HELD' RETURNING id`, [tenantId,attemptId,owner],
  );
  const current = await findAttempt(pool, tenantId, attemptId);
  if (!current) throw new RepairTransactionError("NOT_FOUND", "repair attempt was not found");
  if (updated.rows[0] && current.status !== "RUNNING") throw new RepairTransactionError("INVALID_STATE", "repair claim was not persisted");
  return { attempt: attempt(current), acquired: updated.rows.length === 1 };
}

export async function captureRepairPg(pool: PgPoolLike, tenantId: string, attemptId: string, outputAssetId: string, owner: string): Promise<{ attempt: RepairAttempt; credits: CreditBalance }> {
  if (!owner.trim()) throw new RepairTransactionError("INVALID_STATE", "execution owner is required");
  return settle(pool, tenantId, attemptId, { kind: "capture", outputAssetId, owner });
}

export async function releaseRepairPg(pool: PgPoolLike, tenantId: string, attemptId: string, reason: string, gateBlocked = false): Promise<{ attempt: RepairAttempt; credits: CreditBalance }> {
  return settle(pool, tenantId, attemptId, { kind: "release", reason, gateBlocked });
}

async function settle(pool: PgPoolLike, tenantId: string, attemptId: string, result: { kind: "capture"; outputAssetId: string; owner: string } | { kind: "release"; reason: string; gateBlocked: boolean }): Promise<{ attempt: RepairAttempt; credits: CreditBalance }> {
  return tx(pool, async client => {
    const row = await findAttempt(client, tenantId, attemptId, true);
    if (!row) throw new RepairTransactionError("NOT_FOUND", "repair attempt was not found");
    if (row.status === "CAPTURED" || row.status === "RELEASED") return { attempt: attempt(row), credits: await wallet(client, tenantId) };
    if (result.kind === "capture") {
      if (row.status !== "RUNNING" || row.execution_owner !== result.owner) throw new RepairTransactionError("INVALID_STATE", "only the current execution owner can capture this repair");
      const output = await client.query<{ id: string }>("SELECT id FROM assets WHERE tenant_id=$1 AND id=$2 AND project_id=$3 AND repair_attempt_id=$4 AND asset_role='REPAIR_OUTPUT' AND upload_status='READY' FOR SHARE", [tenantId,result.outputAssetId,row.project_id,attemptId]);
      if (!output.rows[0]) throw new RepairTransactionError("FORBIDDEN", "repair output is not ready for this project");
      const walletChange = await client.query("UPDATE credit_wallets SET held = held - 1,captured = captured + 1,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND held>=1 RETURNING tenant_id", [tenantId]);
      const holdChange = await client.query("UPDATE credit_holds SET status='CAPTURED',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND repair_attempt_id=$2 AND status='HELD' RETURNING id", [tenantId,attemptId]);
      if (walletChange.rows.length !== 1 || holdChange.rows.length !== 1) throw new RepairTransactionError("INVALID_STATE", "credit hold could not be captured atomically");
      const attemptChange = await client.query("UPDATE repair_attempts SET output_asset_id=$3,status='CAPTURED',gate_result='PASSED',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2 AND status='RUNNING' AND execution_owner=$4 RETURNING id", [tenantId,attemptId,result.outputAssetId,result.owner]);
      if (attemptChange.rows.length !== 1) throw new RepairTransactionError("INVALID_STATE", "repair attempt could not be captured atomically");
      await client.query("INSERT INTO credit_ledger_entries (id,tenant_id,entry_type,amount,reference_id,reason) VALUES ($1,$2,'CAPTURE',0,$3,$4)", [`led_${crypto.randomUUID()}`,tenantId,attemptId,"修正版通过基础检查，正式扣除 1 次额度"]);
      await client.query("UPDATE projects SET status='COMPLETED',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2", [tenantId,row.project_id]);
      await client.query("INSERT INTO audit_events (tenant_id,entity_type,entity_id,action,actor_id,payload_json) VALUES ($1,'repair_attempt',$2,'CAPTURED','system:repair-transaction',$3)", [tenantId,attemptId,JSON.stringify({ output_asset_id: result.outputAssetId })]);
    } else {
      const walletChange = await client.query("UPDATE credit_wallets SET held = held - 1,available = available + 1,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND held>=1 RETURNING tenant_id", [tenantId]);
      const holdChange = await client.query("UPDATE credit_holds SET status='RELEASED',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND repair_attempt_id=$2 AND status='HELD' RETURNING id", [tenantId,attemptId]);
      if (walletChange.rows.length !== 1 || holdChange.rows.length !== 1) throw new RepairTransactionError("INVALID_STATE", "credit hold could not be released atomically");
      const attemptChange = await client.query("UPDATE repair_attempts SET status='RELEASED',gate_result=$3,failure_reason=$4,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2 AND status IN ('HELD','RUNNING') RETURNING id", [tenantId,attemptId,result.gateBlocked ? "BLOCKED" : "PENDING",result.reason]);
      if (attemptChange.rows.length !== 1) throw new RepairTransactionError("INVALID_STATE", "repair attempt could not be released atomically");
      await client.query("INSERT INTO credit_ledger_entries (id,tenant_id,entry_type,amount,reference_id,reason) VALUES ($1,$2,'RELEASE',1,$3,$4)", [`led_${crypto.randomUUID()}`,tenantId,attemptId,result.reason]);
      await client.query("INSERT INTO audit_events (tenant_id,entity_type,entity_id,action,actor_id,payload_json) VALUES ($1,'repair_attempt',$2,'RELEASED','system:repair-transaction',$3)", [tenantId,attemptId,JSON.stringify({ reason: result.reason, gate_blocked: result.gateBlocked })]);
    }
    const current = await findAttempt(client, tenantId, attemptId);
    return { attempt: attempt(current!), credits: await wallet(client, tenantId) };
  });
}

export async function recoverInterruptedRepairsPg(pool: PgPoolLike, reason = "服务中断，未交付结果，额度已自动退回。"):
Promise<number> {
  const rows = await pool.query<{ tenant_id: string; id: string }>("SELECT tenant_id,id FROM repair_attempts WHERE status IN ('HELD','RUNNING') ORDER BY created_at ASC");
  let released = 0;
  for (const row of rows.rows) {
    const result = await releaseRepairPg(pool, row.tenant_id, row.id, reason);
    if (result.attempt.status === "RELEASED") released += 1;
  }
  return released;
}
