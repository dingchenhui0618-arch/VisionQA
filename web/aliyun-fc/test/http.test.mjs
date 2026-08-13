import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { loadRuntimeConfig } from "../src/config.mjs";
import { createFixtureDependencies } from "../src/fixture-dependencies.mjs";
import { createHttpServer } from "../src/http-app.mjs";
import { createLogger } from "../src/logger.mjs";
import { createRuntimeService } from "../src/service.mjs";

async function withServer(run) {
  const config = loadRuntimeConfig({
    VISIONQA_RUNTIME_MODE: "fixture",
    ALIBABA_CLOUD_REGION_ID: "cn-beijing",
    VISIONQA_INTERNAL_TOKEN: "local-smoke-only",
  });
  const logger = createLogger(() => {});
  const service = createRuntimeService({
    config,
    dependencies: createFixtureDependencies(),
    logger,
  });
  const server = createHttpServer({ service, config, logger });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("health and readiness are available without credentials", async () => {
  await withServer(async (base) => {
    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      status: "ok",
      mode: "fixture",
      region: "cn-beijing",
      maxConcurrency: 1,
    });
    const ready = await fetch(`${base}/readyz`);
    assert.equal(ready.status, 200);
  });
});

test("evaluation route enforces auth and returns fixture result", async () => {
  await withServer(async (base) => {
    const body = {
      tenantId: "tenant-1",
      assetId: "asset-1",
      objectKey: "staging/visionqa/tenant-1/asset-1.jpg",
      idempotencyKey: "idem-1",
      providerInput: {},
    };
    const denied = await fetch(`${base}/v1/evaluations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(denied.status, 401);
    const accepted = await fetch(`${base}/v1/evaluations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-visionqa-internal-token": "local-smoke-only",
      },
      body: JSON.stringify(body),
    });
    assert.equal(accepted.status, 202);
    assert.equal((await accepted.json()).evaluationId, "eval_fixture_asset-1");
  });
});
