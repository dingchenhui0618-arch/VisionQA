import assert from "node:assert/strict";
import test from "node:test";
import { loadRuntimeConfig } from "../src/config.mjs";
import { createLogger } from "../src/logger.mjs";
import { createRuntimeService } from "../src/service.mjs";

test("reviewed provider-neutral PostgreSQL adapter composes with FC readiness", async (t) => {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 22) {
    t.skip("Source-level TypeScript composition smoke runs in the repository toolchain.");
    return;
  }
  const { createAliyunPostgresPersistencePort } = await import(
    "../../lib/platform/postgres-port-adapter.ts"
  );
  const repository = createAliyunPostgresPersistencePort(
    {
      async query() {
        throw new Error("Composition smoke must not query PostgreSQL.");
      },
      async connect() {
        throw new Error("Composition smoke must not connect to PostgreSQL.");
      },
    },
    {
      promptVersion: "prompt-v0.1",
      taxonomyVersion: "taxonomy-v0.1",
      scorePolicyVersion: "score-v0.1",
      thresholdPolicyVersion: "threshold-v0.1",
      gatePolicyVersion: "gate-v0.1",
    },
  );
  const config = loadRuntimeConfig({
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
  });
  const service = createRuntimeService({
    config,
    dependencies: {
      repository,
      objectStorage: {
        provider: "aliyun_oss",
        async head() {
          throw new Error("Composition readiness must not call OSS.");
        },
        async presignGet() {
          throw new Error("Composition readiness must not sign OSS URLs.");
        },
      },
      visionProvider: {
        providerId: "aliyun-bailian-cn-beijing",
        async preparePrivateImage() {
          throw new Error("Composition readiness must not sign images.");
        },
        async evaluate() {
          throw new Error("Composition readiness must not call Qwen.");
        },
      },
    },
    logger: createLogger(() => {}),
  });
  assert.deepEqual(service.ready(), {
    status: "ready",
    mode: "live",
    region: "cn-beijing",
  });
  assert.equal(repository.provider, "aliyun_postgresql");
  assert.equal(typeof repository.persistEvaluation, "function");
  assert.equal(typeof repository.recordJobState, "function");
});
