import { loadRuntimeConfig } from "./config.mjs";
import { loadRuntimeDependencies } from "./dependency-loader.mjs";
import { createHttpServer } from "./http-app.mjs";
import { createLogger } from "./logger.mjs";
import { createRuntimeService } from "./service.mjs";

const config = loadRuntimeConfig();
const logger = createLogger();
const service = createRuntimeService({
  config,
  dependencies: await loadRuntimeDependencies(config),
  logger,
});
createHttpServer({ service, config, logger }).listen(
  config.port,
  "0.0.0.0",
  () => logger.emit("runtime_started", { port: config.port, mode: config.mode }),
);
