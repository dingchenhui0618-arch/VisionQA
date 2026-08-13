import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createBatch,
  persistEvaluation,
  persistOverride,
  PlatformConflictError,
} from "../lib/platform/repository.ts";
import {
  executionMetadataFromRequest,
  sha256Hex,
  validateEvaluationEnvelope,
  type EvaluationResultV02,
} from "../lib/platform/contracts.ts";

type FirstResolver = (sql: string, values: unknown[]) => unknown;

class FakeStatement {
  values: unknown[] = [];
  readonly sql: string;
  private readonly resolveFirst: FirstResolver;

  constructor(
    sql: string,
    resolveFirst: FirstResolver,
  ) {
    this.sql = sql;
    this.resolveFirst = resolveFirst;
  }

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    return (this.resolveFirst(this.sql, this.values) ?? null) as T | null;
  }

  async run<T>() {
    return { success: true, results: [] as T[] };
  }

  async all<T>() {
    return { success: true, results: [] as T[] };
  }
}

class FakeD1 {
  batches: FakeStatement[][] = [];
  private readonly resolveFirst: FirstResolver;
  private readonly failBatch: boolean;

  constructor(resolveFirst: FirstResolver, failBatch = false) {
    this.resolveFirst = resolveFirst;
    this.failBatch = failBatch;
  }

  prepare(sql: string) {
    return new FakeStatement(sql, this.resolveFirst);
  }

  async batch<T>(statements: FakeStatement[]) {
    this.batches.push(statements);
    if (this.failBatch) throw new Error("simulated concurrent unique conflict");
    return statements.map(() => ({ success: true, results: [] as T[] }));
  }
}

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

function execution(result: EvaluationResultV02) {
  const normalized = executionMetadataFromRequest(result, null);
  assert.ok(normalized.metadata);
  return normalized.metadata;
}

const batchInput = {
  tenantId: "tenant-test",
  requestId: "req-batch",
  idempotencyKey: "batch-key-1",
  actorId: "reviewer@example.com",
  scenario: "fashion_ecommerce_ai_model_image",
  commercialTemplateId: "platform-promo",
  commercialTemplateVersion: "0.2",
  lockedAttributes: ["颜色", "印花"],
  assets: [
    {
      id: "asset-1",
      role: "CANDIDATE" as const,
      position: 0,
      sha256: "a".repeat(64),
      sourceUrl: "private://asset-1",
      productLabel: "SKU-1",
      mimeType: "image/jpeg",
      byteSize: 1234,
      r2Key: "tenant/tenant-test/assets/asset-1/a.jpg",
    },
  ],
};

test("evaluation envelope validation rejects incomplete records", () => {
  assert.deepEqual(validateEvaluationEnvelope({ schema_version: "0.2.0" }), [
    { path: "$.run", message: "缺少必需对象" },
    { path: "$.input", message: "缺少必需对象" },
    { path: "$.scope", message: "缺少必需对象" },
    { path: "$.model_evaluation", message: "缺少必需对象" },
    { path: "$.score_evaluation", message: "缺少必需对象" },
    { path: "$.gate_evaluation", message: "缺少必需对象" },
    { path: "$.action_plan", message: "缺少必需对象" },
    { path: "$.performance", message: "缺少必需对象" },
    { path: "$.run.run_id", message: "缺少非空字符串" },
    { path: "$.run.model_snapshot", message: "缺少非空字符串" },
    { path: "$.run.prompt_version", message: "缺少非空字符串" },
    { path: "$.run.taxonomy_version", message: "缺少非空字符串" },
    { path: "$.run.score_policy_version", message: "缺少非空字符串" },
    { path: "$.run.threshold_policy_version", message: "缺少非空字符串" },
    { path: "$.run.gate_policy_version", message: "缺少非空字符串" },
    { path: "$.input.asset_id", message: "缺少素材 ID" },
    { path: "$.input.asset_sha256", message: "必须是 64 位 SHA-256" },
    {
      path: "$.gate_evaluation.decision",
      message: "必须为 PASS、REVIEW、REJECT 或 null",
    },
    { path: "$.performance.latency_ms", message: "必须是非负整数" },
  ]);
});

test("complete v0.2 result is stored losslessly in one D1 batch", async () => {
  const db = new FakeD1(() => null);
  const result = example();
  const saved = await persistEvaluation(db, {
    tenantId: "tenant-test",
    requestId: "req-test",
    idempotencyKey: "eval-key-1",
    actorId: "reviewer@example.com",
    result,
    execution: execution(result),
  });

  assert.equal(saved.created, true);
  assert.equal(db.batches.length, 1);
  assert.equal(db.batches[0].length, 4);
  const evaluationInsert = db.batches[0].find((query) =>
    query.sql.includes("INSERT INTO asset_evaluations"),
  );
  assert.ok(evaluationInsert);
  const storedJson = evaluationInsert.values.find(
    (value) =>
      typeof value === "string" &&
      value.startsWith('{"schema_version":"0.2.0"'),
  );
  assert.deepEqual(JSON.parse(String(storedJson)), result);
});

test("evaluation idempotent replay does not issue another batch", async () => {
  const result = example();
  const resultJson = JSON.stringify(result);
  const resultSha256 = await sha256Hex(resultJson);
  const db = new FakeD1((sql) =>
    sql.includes("FROM asset_evaluations")
      ? {
          id: "eval_existing",
          result_json: resultJson,
          result_sha256: resultSha256,
          result_version: 1,
          decision: "REVIEW",
        }
      : null,
  );
  const saved = await persistEvaluation(db, {
    tenantId: "tenant-test",
    requestId: "req-test",
    idempotencyKey: "eval-key-1",
    actorId: "reviewer@example.com",
    result,
    execution: execution(result),
  });
  assert.deepEqual(saved, {
    id: "eval_existing",
    created: false,
    resultVersion: 1,
  });
  assert.equal(db.batches.length, 0);
});

test("canonical v0.3 result is accepted with separate execution metadata", () => {
  const result = JSON.parse(
    readFileSync(
      new URL(
        "../../contracts/evaluation-result-v0.3.example.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(validateEvaluationEnvelope(result), []);
  const normalized = executionMetadataFromRequest(result, {
    run_id: "run-v03",
    created_at: "2026-07-29T00:00:00Z",
    model_snapshot: "model-snapshot",
    prompt_version: "prompt-0.3",
    taxonomy_version: "taxonomy-0.3",
    score_policy_version: "score-0.3",
    threshold_policy_version: "threshold-0.3",
    gate_policy_version: "gate-0.3",
    provider_adapter_version: "adapter-0.1",
    asset_id: "asset-v03",
    asset_sha256: "a".repeat(64),
    locked_attributes: ["颜色"],
    latency_ms: 1200,
    cost_amount: null,
    cost_currency: null,
  });
  assert.ok(normalized.metadata);
  assert.equal(normalized.metadata.asset_id, "asset-v03");
});

test("batch same key and same request fingerprint replays successfully", async () => {
  let firstCall = true;
  const writer = new FakeD1((sql) => {
    if (sql.includes("FROM batches")) return null;
    if (sql.includes("FROM assets")) return null;
    return null;
  });
  const created = await createBatch(writer, batchInput);
  assert.equal(created.created, true);
  const batchInsert = writer.batches[0].find((query) =>
    query.sql.includes("INSERT INTO batches"),
  );
  assert.ok(batchInsert);
  const requestSha256 = batchInsert.values.find(
    (value) =>
      typeof value === "string" && /^[a-f0-9]{64}$/.test(value),
  ) as string;

  const replayDb = new FakeD1((sql) => {
    if (sql.includes("FROM batches") && firstCall) {
      firstCall = false;
      return { id: created.id, request_sha256: requestSha256 };
    }
    return null;
  });
  const replay = await createBatch(replayDb, batchInput);
  assert.deepEqual(replay, { id: created.id, created: false });
  assert.equal(replayDb.batches.length, 0);
});

test("batch same key with different request is an idempotency conflict", async () => {
  const db = new FakeD1((sql) =>
    sql.includes("FROM batches")
      ? { id: "batch-existing", request_sha256: "0".repeat(64) }
      : null,
  );
  await assert.rejects(
    createBatch(db, {
      ...batchInput,
      scenario: "different-scenario",
    }),
    (error: unknown) =>
      error instanceof PlatformConflictError &&
      error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  assert.equal(db.batches.length, 0);
});

test("batch concurrent race with different fingerprint remains a conflict", async () => {
  let batchLookupCount = 0;
  const db = new FakeD1((sql) => {
    if (sql.includes("FROM batches")) {
      batchLookupCount += 1;
      return batchLookupCount === 1
        ? null
        : { id: "batch-raced", request_sha256: "f".repeat(64) };
    }
    if (sql.includes("FROM assets")) return null;
    return null;
  }, true);
  await assert.rejects(
    createBatch(db, batchInput),
    (error: unknown) =>
      error instanceof PlatformConflictError &&
      error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  assert.equal(db.batches.length, 1);
});

test("override snapshot, recalibration and audit append atomically", async () => {
  const db = new FakeD1((sql) => {
    if (sql.includes("FROM human_overrides")) return null;
    if (sql.includes("FROM asset_evaluations")) {
      return {
        id: "eval_1",
        result_json: "{}",
        result_sha256: "hash",
        result_version: 1,
        decision: "REVIEW",
      };
    }
    return null;
  });
  const saved = await persistOverride(db, {
    tenantId: "tenant-test",
    requestId: "req-override",
    idempotencyKey: "override-key-1",
    actorId: "reviewer@example.com",
    evaluationId: "eval_1",
    baseEvaluationVersion: 1,
    originalDecision: "REVIEW",
    humanDecision: "REJECT",
    reasonCode: "PRODUCT_MISMATCH",
    evidenceNote: "袖口结构与参考图不一致",
  });
  assert.equal(saved.created, true);
  assert.equal(db.batches.length, 1);
  assert.equal(db.batches[0].length, 4);
  assert.ok(
    db.batches[0].some((query) =>
      query.sql.includes("INSERT INTO human_overrides"),
    ),
  );
  assert.ok(
    db.batches[0].some((query) =>
      query.sql.includes("INSERT INTO commercial_recalibration_logs"),
    ),
  );
  assert.ok(
    db.batches[0].some((query) =>
      query.sql.includes("INSERT INTO audit_events"),
    ),
  );
});

test("override same key and same content replays without writes", async () => {
  const existing = {
    id: "override-existing",
    asset_evaluation_id: "eval_1",
    original_decision: "REVIEW",
    human_decision: "REJECT",
    reason_code: "PRODUCT_MISMATCH",
    evidence_note: "袖口结构与参考图不一致",
    reviewer_id: "reviewer@example.com",
    request_id: "req-original",
    idempotency_key: "override-key-1",
    base_evaluation_version: 1,
    created_at: "2026-07-29T00:00:00Z",
  };
  const db = new FakeD1((sql) =>
    sql.includes("FROM human_overrides") ? existing : null,
  );
  const replay = await persistOverride(db, {
    tenantId: "tenant-test",
    requestId: "req-replay",
    idempotencyKey: "override-key-1",
    actorId: "reviewer@example.com",
    evaluationId: "eval_1",
    baseEvaluationVersion: 1,
    originalDecision: "REVIEW",
    humanDecision: "REJECT",
    reasonCode: "PRODUCT_MISMATCH",
    evidenceNote: "袖口结构与参考图不一致",
  });
  assert.deepEqual(replay, { id: "override-existing", created: false });
  assert.equal(db.batches.length, 0);
});

test("override same key with different content is an idempotency conflict", async () => {
  const db = new FakeD1((sql) =>
    sql.includes("FROM human_overrides")
      ? {
          id: "override-existing",
          asset_evaluation_id: "eval_1",
          original_decision: "REVIEW",
          human_decision: "PASS",
          reason_code: "CONFIRMED",
          evidence_note: "different evidence",
          reviewer_id: "reviewer@example.com",
          request_id: "req-original",
          idempotency_key: "override-key-1",
          base_evaluation_version: 1,
          created_at: "2026-07-29T00:00:00Z",
        }
      : null,
  );
  await assert.rejects(
    persistOverride(db, {
      tenantId: "tenant-test",
      requestId: "req-replay",
      idempotencyKey: "override-key-1",
      actorId: "reviewer@example.com",
      evaluationId: "eval_1",
      baseEvaluationVersion: 1,
      originalDecision: "REVIEW",
      humanDecision: "REJECT",
      reasonCode: "PRODUCT_MISMATCH",
      evidenceNote: "袖口结构与参考图不一致",
    }),
    (error: unknown) =>
      error instanceof PlatformConflictError &&
      error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  assert.equal(db.batches.length, 0);
});

test("override concurrent race rechecks content before replaying", async () => {
  let overrideLookupCount = 0;
  const db = new FakeD1((sql) => {
    if (sql.includes("FROM human_overrides")) {
      overrideLookupCount += 1;
      return overrideLookupCount === 1
        ? null
        : {
            id: "override-raced",
            asset_evaluation_id: "eval_1",
            original_decision: "REVIEW",
            human_decision: "PASS",
            reason_code: "DIFFERENT_REASON",
            evidence_note: "different evidence",
            reviewer_id: "other@example.com",
            request_id: "other-request",
            idempotency_key: "override-key-1",
            base_evaluation_version: 1,
            created_at: "2026-07-29T00:00:00Z",
          };
    }
    if (sql.includes("FROM asset_evaluations")) {
      return {
        id: "eval_1",
        result_json: "{}",
        result_sha256: "hash",
        result_version: 1,
        decision: "REVIEW",
      };
    }
    return null;
  }, true);

  await assert.rejects(
    persistOverride(db, {
      tenantId: "tenant-test",
      requestId: "req-override",
      idempotencyKey: "override-key-1",
      actorId: "reviewer@example.com",
      evaluationId: "eval_1",
      baseEvaluationVersion: 1,
      originalDecision: "REVIEW",
      humanDecision: "REJECT",
      reasonCode: "PRODUCT_MISMATCH",
      evidenceNote: "袖口结构与参考图不一致",
    }),
    (error: unknown) =>
      error instanceof PlatformConflictError &&
      error.code === "IDEMPOTENCY_KEY_REUSED",
  );
});
