import { loadRuntimeConfig } from "./config.mjs";
import { createFixtureDependencies } from "./fixture-dependencies.mjs";
import { createLogger } from "./logger.mjs";
import { createRuntimeService } from "./service.mjs";

export async function handler(event, context = {}) {
  const config = loadRuntimeConfig();
  if (config.mode === "live") {
    throw new Error(
      "Live task composition is blocked until reviewed OSS/PG/Qwen bindings are supplied.",
    );
  }
  const logger = createLogger();
  const service = createRuntimeService({
    config,
    dependencies: createFixtureDependencies(),
    logger,
  });
  const payload = JSON.parse(Buffer.isBuffer(event) ? event.toString("utf8") : event);
  return service.runTask(payload, {
    requestId: context.requestId || crypto.randomUUID(),
    signal: AbortSignal.timeout(config.taskTimeoutMs),
  });
}
