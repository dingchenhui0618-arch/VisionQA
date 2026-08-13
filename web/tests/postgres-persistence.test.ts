import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { newDb } from "pg-mem";
import type { PgClientLike, PgPoolLike } from "../db/pg/index.ts";
import {
  getEvaluationPg,
  persistEvaluationPg,
  persistOverridePg,
  PostgresJobStateError,
  recordJobStatePg,
} from "../lib/platform/postgres-repository.ts";
import {
  ALIYUN_OSS_PROVIDER,
  ALIYUN_POSTGRES_PROVIDER,
  createAliyunPostgresPersistencePort,
  normalizeStorageProvider,
  type AliyunPostgresPersistencePort,
} from "../lib/platform/postgres-port-adapter.ts";
import {
  executionMetadataFromRequest,
  sha256Hex,
  type EvaluationResultV02,
} from "../lib/platform/contracts.ts";
import { PlatformConflictError } from "../lib/platform/repository.ts";

const baselineSql = readFileSync(
  new URL("../drizzle-pg/0000_visionqa_baseline.sql", import.meta.url),
  "utf8",
);

function example(): EvaluationResultV02 {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../contracts/evaluation-result-v0.2.example.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as EvaluationResultV02;
}

async function memoryPg() {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool();
  await pool.query(baselineSql);
  return pool as unknown as PgPoolLike & {
    end(): Promise<void>;
  };
}

function evaluationInput(result = example()) {
  const execution = executionMetadataFromRequest(result, null).metadata;
  assert.ok(execution);
  return {
    tenantId: "tenant-pg-test",
    requestId: "request-pg-evaluation",
    idempotencyKey: "evaluation-pg-key-1",
    actorId: "reviewer@example.com",
    result,
    execution,
    commercialTemplateId: "platform-promo",
    commercialTemplateVersion: "0.2",
  };
}

function overrideInput(
  evaluationId: string,
  idempotencyKey = "override-pg-key-1",
) {
  return {
    tenantId: "tenant-pg-test",
    requestId: `request-${idempotencyKey}`,
    idempotencyKey,
    actorId: "reviewer@example.com",
    evaluationId,
    baseEvaluationVersion: 1,
    originalDecision: "REVIEW",
    humanDecision: "REJECT",
    reasonCode: "PRODUCT_MISMATCH",
    evidenceNote: "袖口结构与参考图不一致",
    commercialTemplateId: "platform-promo",
    commercialTemplateVersion: "0.2",
    systemFitScore: 78,
  };
}

test("PostgreSQL baseline applies to an empty database and creates 11 tables", async () => {
  const pool = await memoryPg();
  const tables = [
    "assets",
    "batches",
    "batch_assets",
    "evaluation_runs",
    "evaluation_jobs",
    "asset_evaluations",
    "human_overrides",
    "commercial_templates",
    "commercial_profiles",
    "commercial_recalibration_logs",
    "audit_events",
  ];
  for (const table of tables) {
    await pool.query(`SELECT 1 FROM ${table} LIMIT 0`);
  }
  assert.match(baselineSql, /^BEGIN;/);
  assert.match(baselineSql, /COMMIT;\s*$/);
  await pool.end();
});

test("PostgreSQL evaluation persists losslessly with a SHA-256 and replays", async () => {
  const pool = await memoryPg();
  const input = evaluationInput();
  const created = await persistEvaluationPg(pool, input);
  assert.equal(created.created, true);
  assert.equal(created.resultVersion, 1);

  const row = await pool.query<{
    result_json: string;
    result_sha256: string;
  }>(
    "SELECT result_json,result_sha256 FROM asset_evaluations WHERE id=$1",
    [created.id],
  );
  assert.deepEqual(JSON.parse(row.rows[0].result_json), input.result);
  assert.equal(
    row.rows[0].result_sha256,
    await sha256Hex(JSON.stringify(input.result)),
  );

  const replay = await persistEvaluationPg(pool, input);
  assert.deepEqual(replay, {
    id: created.id,
    created: false,
    resultVersion: 1,
  });
  assert.equal(
    (
      await pool.query(
        "SELECT id FROM audit_events WHERE entity_type='asset_evaluation'",
      )
    ).rowCount,
    1,
  );
  await pool.end();
});

test("cross-tenant asset and run primary keys fail closed", async () => {
  const pool = await memoryPg();
  const original = evaluationInput();
  await persistEvaluationPg(pool, original);

  await assert.rejects(
    persistEvaluationPg(pool, {
      ...original,
      tenantId: "tenant-attacker",
      idempotencyKey: "attacker-asset-key",
    }),
    (error: unknown) =>
      error instanceof PlatformConflictError &&
      error.code === "ASSET_OWNERSHIP_CONFLICT",
  );

  const runAttackResult = structuredClone(original.result);
  runAttackResult.input.asset_id = "asset-other-tenant";
  runAttackResult.input.asset_sha256 = "b".repeat(64);
  await assert.rejects(
    persistEvaluationPg(pool, {
      ...evaluationInput(runAttackResult),
      tenantId: "tenant-attacker",
      idempotencyKey: "attacker-run-key",
    }),
    (error: unknown) =>
      error instanceof PlatformConflictError &&
      error.code === "RUN_OWNERSHIP_CONFLICT",
  );
  await pool.end();
});

test("storage provider is canonical and legacy hyphen values normalize", async () => {
  const pool = await memoryPg();
  const asset = example().input;
  await pool.query(
    `INSERT INTO assets
     (id,batch_id,tenant_id,source_url,product_label,sha256,storage_provider)
     VALUES ('legacy-storage','unassigned','tenant-pg-test','private://legacy',
             'legacy',$1,'aliyun-oss')`,
    [asset.asset_sha256],
  );
  const normalizeSql = readFileSync(
    new URL(
      "../drizzle-pg/0001_normalize_storage_provider.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await pool.query(normalizeSql);
  const normalized = await pool.query<{ storage_provider: string }>(
    "SELECT storage_provider FROM assets WHERE id='legacy-storage'",
  );
  assert.equal(normalized.rows[0].storage_provider, ALIYUN_OSS_PROVIDER);
  assert.equal(normalizeStorageProvider("aliyun-oss"), ALIYUN_OSS_PROVIDER);
  assert.equal(normalizeStorageProvider("aliyun_oss"), ALIYUN_OSS_PROVIDER);
  await pool.end();
});

test("provider-neutral adapter satisfies the FC repository port contract", async () => {
  const pool = await memoryPg();
  const source = example();
  await pool.query(
    `INSERT INTO assets
     (id,batch_id,tenant_id,source_url,product_label,sha256)
     VALUES ($1,'unassigned','tenant-pg-test','private://asset',$1,$2)`,
    [source.input.asset_id, source.input.asset_sha256],
  );
  const port: AliyunPostgresPersistencePort =
    createAliyunPostgresPersistencePort(pool, {
      promptVersion: source.run.prompt_version,
      taxonomyVersion: source.run.taxonomy_version,
      scorePolicyVersion: source.run.score_policy_version,
      thresholdPolicyVersion: source.run.threshold_policy_version,
      gatePolicyVersion: source.run.gate_policy_version,
    });
  assert.equal(port.provider, ALIYUN_POSTGRES_PROVIDER);
  assert.equal(typeof port.persistEvaluation, "function");
  assert.equal(typeof port.recordJobState, "function");
  const saved = await port.persistEvaluation({
    tenantId: "tenant-pg-test",
    assetId: source.input.asset_id,
    requestId: "fc-request-1",
    idempotencyKey: "fc-evaluation-key-1",
    result: source,
    provider: {
      providerId: "qwen-bailian",
      adapterVersion: "qwen-adapter-0.1",
      modelSnapshot: "qwen3-vl-plus-2025-12-19",
      latencyMs: 800,
    },
  });
  assert.equal(saved.created, true);
  await pool.end();
});

test("job states are idempotent and enforce bounded transitions", async () => {
  const pool = await memoryPg();
  const running = {
    jobId: "job-pg-1",
    status: "RUNNING" as const,
    attempt: 1,
    requestId: "request-job-1",
  };
  const first = await recordJobStatePg(pool, running);
  assert.deepEqual(first, {
    id: "job-pg-1",
    created: true,
    stateVersion: 1,
    status: "RUNNING",
  });
  const replay = await recordJobStatePg(pool, running);
  assert.equal(replay.created, false);
  assert.equal(replay.stateVersion, 1);
  const succeeded = await recordJobStatePg(pool, {
    ...running,
    status: "SUCCEEDED",
    evaluationId: "eval-pg-1",
  });
  assert.equal(succeeded.stateVersion, 2);
  await assert.rejects(
    recordJobStatePg(pool, {
      ...running,
      status: "FAILED",
      errorCode: "LATE_FAILURE",
    }),
    (error: unknown) =>
      error instanceof PostgresJobStateError &&
      error.code === "JOB_STATE_CONFLICT",
  );
  assert.equal(
    (
      await pool.query(
        "SELECT id FROM audit_events WHERE entity_type='evaluation_job'",
      )
    ).rowCount,
    2,
  );
  await pool.end();
});

test("job retry transition requires a higher attempt", async () => {
  const pool = await memoryPg();
  await recordJobStatePg(pool, {
    jobId: "job-retry",
    status: "RUNNING",
    attempt: 1,
    requestId: "request-retry-1",
  });
  await recordJobStatePg(pool, {
    jobId: "job-retry",
    status: "RETRY_PENDING",
    attempt: 1,
    requestId: "request-retry-1",
    errorCode: "TRANSIENT_PROVIDER_ERROR",
  });
  await assert.rejects(
    recordJobStatePg(pool, {
      jobId: "job-retry",
      status: "RUNNING",
      attempt: 1,
      requestId: "request-retry-2",
    }),
    (error: unknown) =>
      error instanceof PostgresJobStateError &&
      error.code === "JOB_STATE_CONFLICT",
  );
  const secondAttempt = await recordJobStatePg(pool, {
    jobId: "job-retry",
    status: "RUNNING",
    attempt: 2,
    requestId: "request-retry-2",
  });
  assert.equal(secondAttempt.stateVersion, 3);
  await pool.end();
});

test("same override key replays and preserves the incremented version", async () => {
  const pool = await memoryPg();
  const evaluation = await persistEvaluationPg(pool, evaluationInput());
  const input = overrideInput(evaluation.id);
  const created = await persistOverridePg(pool, input);
  assert.equal(created.created, true);
  assert.equal(created.resultVersion, 2);

  const replay = await persistOverridePg(pool, input);
  assert.deepEqual(replay, {
    id: created.id,
    created: false,
    resultVersion: 2,
  });
  const stored = await getEvaluationPg(
    pool,
    input.tenantId,
    input.evaluationId,
  );
  assert.equal(stored?.resultVersion, 2);
  assert.equal(stored?.overrides.length, 1);
  assert.equal(stored?.overrides[0].resulting_evaluation_version, 2);
  await pool.end();
});

class SerializedOverridePool implements PgPoolLike {
  resultVersion = 1;
  decision = "REVIEW";
  committedOverrides = 0;
  private locked = false;
  private waiters: Array<() => void> = [];

  async query<T>() {
    return { rows: [] as T[], rowCount: 0 };
  }

  private async acquire() {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.locked = true;
  }

  private unlock() {
    this.locked = false;
    this.waiters.shift()?.();
  }

  async connect(): Promise<PgClientLike> {
    let ownsLock = false;
    let pendingDecision: string | null = null;
    let pendingVersion: number | null = null;
    let pendingOverride = false;
    return {
      release: () => {
        if (ownsLock) {
          ownsLock = false;
          this.unlock();
        }
      },
      query: async <T>(sql: string, values?: readonly unknown[]) => {
        if (sql === "BEGIN") return { rows: [] as T[], rowCount: null };
        if (sql === "COMMIT") {
          if (pendingVersion !== null) this.resultVersion = pendingVersion;
          if (pendingDecision !== null) this.decision = pendingDecision;
          if (pendingOverride) this.committedOverrides += 1;
          if (ownsLock) {
            ownsLock = false;
            this.unlock();
          }
          return { rows: [] as T[], rowCount: null };
        }
        if (sql === "ROLLBACK") {
          if (ownsLock) {
            ownsLock = false;
            this.unlock();
          }
          return { rows: [] as T[], rowCount: null };
        }
        if (sql.includes("FROM human_overrides")) {
          return { rows: [] as T[], rowCount: 0 };
        }
        if (sql.includes("FROM asset_evaluations") && sql.includes("FOR UPDATE")) {
          await this.acquire();
          ownsLock = true;
          return {
            rows: [
              {
                id: "eval-concurrent",
                result_json: "{}",
                result_sha256: "hash",
                result_version: this.resultVersion,
                decision: this.decision,
              },
            ] as T[],
            rowCount: 1,
          };
        }
        if (sql.includes("INSERT INTO human_overrides")) {
          pendingOverride = true;
        }
        if (sql.includes("UPDATE asset_evaluations")) {
          pendingDecision = String(values?.[0]);
          pendingVersion = this.resultVersion + 1;
          return {
            rows: [{ result_version: pendingVersion }] as T[],
            rowCount: 1,
          };
        }
        return { rows: [] as T[], rowCount: 1 };
      },
    };
  }
}

test("concurrent different keys with one baseVersion allow only one override", async () => {
  const pool = new SerializedOverridePool();
  const outcomes = await Promise.allSettled([
    persistOverridePg(
      pool,
      overrideInput("eval-concurrent", "override-key-a"),
    ),
    persistOverridePg(
      pool,
      overrideInput("eval-concurrent", "override-key-b"),
    ),
  ]);
  assert.equal(
    outcomes.filter((outcome) => outcome.status === "fulfilled").length,
    1,
  );
  const rejected = outcomes.find(
    (outcome): outcome is PromiseRejectedResult =>
      outcome.status === "rejected",
  );
  assert.ok(rejected);
  assert.ok(rejected.reason instanceof PlatformConflictError);
  assert.equal(rejected.reason.code, "EVALUATION_VERSION_CONFLICT");
  assert.equal(pool.resultVersion, 2);
  assert.equal(pool.committedOverrides, 1);
});

class AtomicFailurePool implements PgPoolLike {
  state = {
    resultVersion: 1,
    decision: "REVIEW",
    overrideCount: 0,
    recalibrationCount: 0,
  };

  async query<T>() {
    return { rows: [] as T[], rowCount: 0 };
  }

  async connect(): Promise<PgClientLike> {
    let pendingVersion: number | null = null;
    let pendingDecision: string | null = null;
    let pendingOverrides = 0;
    let pendingRecalibrations = 0;
    return {
      release() {},
      query: async <T>(sql: string, values?: readonly unknown[]) => {
        if (sql === "BEGIN") return { rows: [] as T[], rowCount: null };
        if (sql === "COMMIT") {
          if (pendingVersion !== null) {
            this.state.resultVersion = pendingVersion;
            this.state.decision = pendingDecision ?? this.state.decision;
          }
          this.state.overrideCount += pendingOverrides;
          this.state.recalibrationCount += pendingRecalibrations;
          return { rows: [] as T[], rowCount: null };
        }
        if (sql === "ROLLBACK") {
          pendingVersion = null;
          pendingDecision = null;
          pendingOverrides = 0;
          pendingRecalibrations = 0;
          return { rows: [] as T[], rowCount: null };
        }
        if (sql.includes("FROM human_overrides")) {
          return { rows: [] as T[], rowCount: 0 };
        }
        if (sql.includes("FROM asset_evaluations") && sql.includes("FOR UPDATE")) {
          return {
            rows: [
              {
                id: "eval-atomic",
                result_json: "{}",
                result_sha256: "hash",
                result_version: this.state.resultVersion,
                decision: this.state.decision,
              },
            ] as T[],
            rowCount: 1,
          };
        }
        if (sql.includes("INSERT INTO human_overrides")) {
          pendingOverrides += 1;
          return { rows: [] as T[], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO commercial_recalibration_logs")) {
          pendingRecalibrations += 1;
          return { rows: [] as T[], rowCount: 1 };
        }
        if (sql.includes("UPDATE asset_evaluations")) {
          pendingVersion = this.state.resultVersion + 1;
          pendingDecision = String(values?.[0]);
          return {
            rows: [{ result_version: pendingVersion }] as T[],
            rowCount: 1,
          };
        }
        if (sql.includes("INSERT INTO audit_events")) {
          throw new Error("injected audit failure");
        }
        return { rows: [] as T[], rowCount: 1 };
      },
    };
  }
}

test("an injected late failure rolls back override, recalibration and version", async () => {
  const failing = new AtomicFailurePool();
  await assert.rejects(
    persistOverridePg(failing, overrideInput("eval-atomic")),
    /injected audit failure/,
  );
  assert.deepEqual(failing.state, {
    resultVersion: 1,
    decision: "REVIEW",
    overrideCount: 0,
    recalibrationCount: 0,
  });
});

class JobAtomicFailurePool implements PgPoolLike {
  jobCommitted = false;

  async query<T>() {
    return { rows: [] as T[], rowCount: 0 };
  }

  async connect(): Promise<PgClientLike> {
    let pendingJob = false;
    return {
      release() {},
      query: async <T>(sql: string) => {
        if (sql === "BEGIN") return { rows: [] as T[], rowCount: null };
        if (sql === "COMMIT") {
          this.jobCommitted = pendingJob;
          return { rows: [] as T[], rowCount: null };
        }
        if (sql === "ROLLBACK") {
          pendingJob = false;
          return { rows: [] as T[], rowCount: null };
        }
        if (sql.includes("FROM evaluation_jobs")) {
          return { rows: [] as T[], rowCount: 0 };
        }
        if (sql.includes("INSERT INTO evaluation_jobs")) {
          pendingJob = true;
          return { rows: [] as T[], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO audit_events")) {
          throw new Error("injected job audit failure");
        }
        return { rows: [] as T[], rowCount: 1 };
      },
    };
  }
}

test("job state and audit are atomic when the final write fails", async () => {
  const pool = new JobAtomicFailurePool();
  await assert.rejects(
    recordJobStatePg(pool, {
      jobId: "job-atomic",
      status: "RUNNING",
      attempt: 1,
      requestId: "request-job-atomic",
    }),
    /injected job audit failure/,
  );
  assert.equal(pool.jobCommitted, false);
});
