import assert from "node:assert/strict";
import test from "node:test";
import { loadRuntimeConfig } from "../src/config.mjs";
import { RuntimeError } from "../src/errors.mjs";
import { createFixtureDependencies } from "../src/fixture-dependencies.mjs";
import { createLogger, redact } from "../src/logger.mjs";
import { createRuntimeService } from "../src/service.mjs";

function fixtureRuntime() {
  const records = [];
  const config = loadRuntimeConfig({
    VISIONQA_RUNTIME_MODE: "fixture",
    ALIBABA_CLOUD_REGION_ID: "cn-beijing",
  });
  const dependencies = createFixtureDependencies();
  const service = createRuntimeService({
    config,
    dependencies,
    logger: createLogger((line) => records.push(JSON.parse(line))),
  });
  return { config, dependencies, service, records };
}

function evaluation() {
  return {
    tenantId: "tenant-1",
    assetId: "asset-1",
    objectKey: "staging/visionqa/tenant-1/asset-1.jpg",
    idempotencyKey: "idem-1",
    providerInput: { scene: "platform-promo" },
  };
}

function liveConfig(overrides = {}) {
  return loadRuntimeConfig({
    VISIONQA_RUNTIME_MODE: "live",
    ALIBABA_CLOUD_REGION_ID: "cn-beijing",
    FC_INSTANCE_CONCURRENCY: "1",
    OSS_GOVERNANCE_EVIDENCE_ACCEPTED: "true",
    PG_GOVERNANCE_EVIDENCE_ACCEPTED: "true",
    QWEN_GOVERNANCE_EVIDENCE_ACCEPTED: "true",
    SECRET_MANAGER_CONFIGURED: "true",
    PRIVATE_NETWORK_PATH_CONFIRMED: "true",
    SLS_REDACTION_CONFIRMED: "true",
    VISIONQA_INTERNAL_TOKEN: "test-only-in-memory",
    PG_PASSWORD: "test-only-in-memory",
    QWEN_API_KEY: "test-only-in-memory",
    VISION_PRIVATE_IMAGE_ENVELOPE_HMAC_SECRET:
      "test-only-in-memory-at-least-thirty-two-bytes",
    ...overrides,
  });
}

test("fixture evaluation consumes storage, provider and repository ports", async () => {
  const { service, records } = fixtureRuntime();
  const result = await service.evaluate(evaluation(), {
    requestId: "request-1",
  });
  assert.equal(result.evaluationId, "eval_fixture_asset-1");
  assert.equal(records.at(-1).event, "evaluation_completed");
  assert.equal(records.at(-1).region, "cn-beijing");
});

test("async task records bounded state transitions", async () => {
  const { service, dependencies } = fixtureRuntime();
  await service.runTask(
    { jobId: "job-1", attempt: 1, evaluation: evaluation() },
    { requestId: "request-task-1" },
  );
  assert.deepEqual(
    dependencies.repository.jobStates.map((state) => state.status),
    ["RUNNING", "SUCCEEDED"],
  );
  await assert.rejects(
    () =>
      service.runTask(
        { jobId: "job-2", attempt: 4, evaluation: evaluation() },
        { requestId: "request-task-2" },
      ),
    (error) =>
      error instanceof RuntimeError && error.code === "TASK_ATTEMPT_LIMIT",
  );
});

test("tenant object scope fails closed", async () => {
  const { service } = fixtureRuntime();
  await assert.rejects(
    () =>
      service.evaluate(
        { ...evaluation(), objectKey: "staging/visionqa/tenant-2/asset.jpg" },
        { requestId: "request-scope" },
      ),
    (error) =>
      error instanceof RuntimeError && error.code === "INVALID_OBJECT_SCOPE",
  );
});

test("live mode fails before network when governance evidence is missing", () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        VISIONQA_RUNTIME_MODE: "live",
        ALIBABA_CLOUD_REGION_ID: "cn-beijing",
        FC_INSTANCE_CONCURRENCY: "1",
      }),
    (error) =>
      error instanceof RuntimeError &&
      error.code === "GOVERNANCE_EVIDENCE_MISSING",
  );
});

test("region and concurrency are immutable security boundaries", () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        VISIONQA_RUNTIME_MODE: "fixture",
        ALIBABA_CLOUD_REGION_ID: "cn-shanghai",
      }),
    /fixed to cn-beijing/,
  );
});

test("permanent or incomplete Aliyun credentials fail closed", () => {
  for (const name of ["ALIYUN_ACCESS_KEY_ID", "ALIYUN_ACCESS_KEY_SECRET"]) {
    assert.throws(
      () =>
        loadRuntimeConfig({
          VISIONQA_RUNTIME_MODE: "fixture",
          ALIBABA_CLOUD_REGION_ID: "cn-beijing",
          [name]: "must-not-be-present",
        }),
      (error) =>
        error instanceof RuntimeError &&
        error.code === "STATIC_ACCESS_KEY_FORBIDDEN",
      name,
    );
  }
  assert.throws(
    () =>
      loadRuntimeConfig({
        VISIONQA_RUNTIME_MODE: "fixture",
        ALIBABA_CLOUD_ACCESS_KEY_ID: "LTAI-permanent",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "secret",
        ALIBABA_CLOUD_SECURITY_TOKEN: "token",
      }),
    (error) =>
      error instanceof RuntimeError &&
      error.code === "STATIC_ACCESS_KEY_FORBIDDEN",
  );
  assert.throws(
    () =>
      loadRuntimeConfig({
        VISIONQA_RUNTIME_MODE: "fixture",
        ALIBABA_CLOUD_ACCESS_KEY_ID: "STS.temporary",
      }),
    (error) =>
      error instanceof RuntimeError &&
      error.code === "STATIC_ACCESS_KEY_FORBIDDEN",
  );
});

test("complete FC Function Role STS credentials are accepted without logging values", () => {
  const config = loadRuntimeConfig({
    VISIONQA_RUNTIME_MODE: "fixture",
    ALIBABA_CLOUD_REGION_ID: "cn-beijing",
    ALIBABA_CLOUD_ACCESS_KEY_ID: "STS.temporary-id",
    ALIBABA_CLOUD_ACCESS_KEY_SECRET: "temporary-secret",
    ALIBABA_CLOUD_SECURITY_TOKEN: "temporary-token",
  });
  assert.equal(config.mode, "fixture");
  assert.doesNotMatch(JSON.stringify(config), /temporary/);
});

test("live runtime resolves and signs candidate and references from trusted storage", async () => {
  const prepared = [];
  let received;
  const metadata = (objectKey) => ({
    objectKey,
    mimeType: "image/jpeg",
    sha256: objectKey.includes("reference") ? "b".repeat(64) : "a".repeat(64),
    byteSize: 2048,
  });
  const dependencies = {
    objectStorage: {
      provider: "aliyun_oss",
      async head({ objectKey }) {
        return metadata(objectKey);
      },
      async presignGet({ objectKey }) {
        return {
          url: `https://approved-bucket.oss-cn-beijing.aliyuncs.com/${objectKey}?signature=test`,
          expiresAt: "2026-08-06T12:00:00.000Z",
        };
      },
    },
    repository: {
      provider: "aliyun_postgresql",
      async persistEvaluation() {
        return { id: "eval-live-1", resultVersion: 1 };
      },
      async recordJobState() {},
    },
    visionProvider: {
      providerId: "aliyun-bailian-cn-beijing",
      async preparePrivateImage({ image, metadata: trusted }) {
        prepared.push({ image, trusted });
        return { ...image, privateEnvelope: { signed: true } };
      },
      async evaluate(input) {
        received = input;
        return {
          result: { schema_version: "0.3.0" },
          provider: { providerId: "aliyun-bailian-cn-beijing" },
        };
      },
    },
  };
  const service = createRuntimeService({
    config: liveConfig(),
    dependencies,
    logger: createLogger(() => {}),
  });
  await service.evaluate(
    {
      ...evaluation(),
      providerInput: {
        candidate: { url: "https://caller.invalid/candidate.jpg" },
        references: [{ url: "https://caller.invalid/reference.jpg" }],
      },
      referenceObjects: [
        { objectKey: "staging/visionqa/tenant-1/reference-1.jpg" },
      ],
    },
    { requestId: "request-live-1" },
  );
  assert.equal(prepared.length, 2);
  assert.equal(received.candidate.role, "candidate");
  assert.equal(received.references[0].role, "reference");
  assert.doesNotMatch(JSON.stringify(received), /caller\.invalid/);
  assert.equal(prepared[0].trusted.assetSha256, "a".repeat(64));
  assert.equal(prepared[1].trusted.assetSha256, "b".repeat(64));
});

test("live dependency ports reject a provider without private-image signing", () => {
  assert.throws(
    () =>
      createRuntimeService({
        config: liveConfig(),
        dependencies: {
          objectStorage: {
            provider: "aliyun_oss",
            async head() {},
            async presignGet() {},
          },
          repository: {
            provider: "aliyun_postgresql",
            async persistEvaluation() {},
            async recordJobState() {},
          },
          visionProvider: {
            providerId: "aliyun-bailian-cn-beijing",
            async evaluate() {},
          },
        },
        logger: createLogger(() => {}),
      }),
    (error) =>
      error instanceof RuntimeError && error.code === "DEPENDENCY_PORT_INVALID",
  );
});

test("SLS redaction removes whole URL values, not only signatures", () => {
  const output = redact({
    authorization: "Bearer top-secret",
    nested: { apiKey: "key-value" },
    url: "https://bucket.oss-cn-beijing.aliyuncs.com/a?Signature=abc&x=1",
    harmless_named_url: "not-a-url-but-the-field-is-sensitive",
    note: "Bearer abc.def",
  });
  assert.equal(output.authorization, "[REDACTED]");
  assert.equal(output.nested.apiKey, "[REDACTED]");
  assert.equal(output.url, "[REDACTED]");
  assert.equal(output.harmless_named_url, "[REDACTED]");
  assert.doesNotMatch(
    JSON.stringify(output),
    /top-secret|key-value|abc\.def|bucket|\/a|Signature/,
  );
});

test("SLS redaction resists nested object, array and mixed-case URL key attacks", () => {
  const output = redact({
    payload: {
      PRIVATE_URL: "https://private.example/tenant-a/object-a?other=leak",
      candidateUri: "oss://bucket/tenant-b/object-b",
      array: [
        "prefix https://example.invalid/tenant-c/object-c suffix",
        {
          signedURL:
            "https://bucket.oss-cn-beijing-internal.aliyuncs.com/tenant-d/object-d?x=1",
          safe: "ordinary evidence",
        },
        new URL("https://url-object.invalid/private/path"),
      ],
      uppercase: {
        CALLBACK_URI: "field-value-without-a-scheme",
      },
    },
  });
  assert.equal(output.payload.PRIVATE_URL, "[REDACTED]");
  assert.equal(output.payload.candidateUri, "[REDACTED]");
  assert.equal(output.payload.array[0], "[REDACTED]");
  assert.equal(output.payload.array[1].signedURL, "[REDACTED]");
  assert.equal(output.payload.array[1].safe, "ordinary evidence");
  assert.equal(output.payload.array[2], "[REDACTED]");
  assert.equal(output.payload.uppercase.CALLBACK_URI, "[REDACTED]");
  assert.doesNotMatch(
    JSON.stringify(output),
    /tenant-[a-d]|object-[a-d]|private\.example|oss-cn-beijing/,
  );
});
