import { once } from "node:events";
import { loadRuntimeConfig } from "../src/config.mjs";
import { createFixtureDependencies } from "../src/fixture-dependencies.mjs";
import { createHttpServer } from "../src/http-app.mjs";
import { createLogger } from "../src/logger.mjs";
import { createRuntimeService } from "../src/service.mjs";

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
const base = `http://127.0.0.1:${address.port}`;
try {
  const ready = await fetch(`${base}/readyz`);
  if (ready.status !== 200) throw new Error("readiness failed");
  const evaluated = await fetch(`${base}/v1/evaluations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-visionqa-internal-token": "local-smoke-only",
    },
    body: JSON.stringify({
      tenantId: "smoke-tenant",
      assetId: "smoke-asset",
      objectKey: "staging/visionqa/smoke-tenant/smoke.jpg",
      idempotencyKey: "smoke-idempotency",
      providerInput: {},
    }),
  });
  if (evaluated.status !== 202) {
    throw new Error(`evaluation smoke failed: ${evaluated.status}`);
  }
  console.log("smoke ok (fixture HTTP readiness + evaluation; network providers=0)");
} finally {
  server.close();
  await once(server, "close");
}
