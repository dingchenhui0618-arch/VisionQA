import { FixtureVisionAdapter } from "./fixture.ts";
import type { VisionProviderEnvironment } from "./governance.ts";
import { createGovernedQwenBailianAdapter } from "./qwen.ts";
import {
  QWEN_BAILIAN_DEFINITION,
  QWEN_BAILIAN_MODEL_SNAPSHOT,
} from "./registry.ts";
import {
  VisionProviderError,
  type VisionProviderAdapter,
} from "./types.ts";

export type { VisionProviderEnvironment } from "./governance.ts";
export { QWEN_BAILIAN_MODEL_SNAPSHOT };

export function createVisionProviderFromEnv(
  env: VisionProviderEnvironment,
  options: { fetchImpl?: typeof fetch } = {},
): VisionProviderAdapter {
  const provider = env.VISION_PROVIDER?.trim().toLowerCase() || "fixture";
  if (provider === "fixture") return new FixtureVisionAdapter();

  if (provider === "openai") {
    throw new VisionProviderError(
      "CONFIGURATION",
      "The legacy OpenAI live provider is disabled.",
    );
  }
  if (provider !== QWEN_BAILIAN_DEFINITION.providerId) {
    throw new VisionProviderError(
      "CONFIGURATION",
      `Unsupported VISION_PROVIDER: ${provider}`,
    );
  }
  return createGovernedQwenBailianAdapter(env, {
    fetchImpl: options.fetchImpl,
  });
}
