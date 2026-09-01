import { RuntimeError } from "./errors.mjs";
import { createFixtureDependencies } from "./fixture-dependencies.mjs";

const defaultImportLiveBindings = () =>
  import("../generated/live-bindings.mjs");

export async function loadRuntimeDependencies(
  config,
  { importLiveBindings = defaultImportLiveBindings } = {},
) {
  if (config.mode === "fixture") return createFixtureDependencies();
  let liveBindings;
  try {
    liveBindings = await importLiveBindings();
  } catch (cause) {
    throw new RuntimeError(
      "LIVE_BINDINGS_NOT_DEPLOYED",
      "Live runtime is blocked until the reviewed OSS, PostgreSQL and Qwen binding artifact is deployed.",
      { status: 503, cause },
    );
  }
  if (typeof liveBindings?.createReviewedLiveDependencies !== "function") {
    throw new RuntimeError(
      "LIVE_BINDINGS_NOT_DEPLOYED",
      "The deployed live binding artifact does not expose the reviewed composition entrypoint.",
      { status: 503 },
    );
  }
  return liveBindings.createReviewedLiveDependencies({ env: process.env });
}
