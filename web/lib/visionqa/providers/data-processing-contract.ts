import { VisionProviderError } from "./types.ts";

export const QWEN_DATA_PROCESSING_CONTRACT = Object.freeze({
  store: "false",
  training: "disabled",
  retention: "short_lived_private_url",
  deletionSla: "required",
  humanFinalReview: "required",
} as const);

const REQUIRED_EVIDENCE_FLAGS = {
  VISION_STORE_FALSE_CONFIRMED: "store:false",
  VISION_ZDR_CONFIRMED: "ZDR/no training",
  VISION_DELETE_SLA_CONFIRMED: "deletion SLA",
  VISION_HUMAN_FINAL_REVIEW_REQUIRED: "human final review",
} as const;

export function assertQwenDataProcessingContract(
  env: Record<string, string | undefined>,
): typeof QWEN_DATA_PROCESSING_CONTRACT {
  for (const [name, label] of Object.entries(REQUIRED_EVIDENCE_FLAGS)) {
    if (env[name] !== "true") {
      throw new VisionProviderError(
        "CONFIGURATION",
        `Required Qwen data-processing evidence is missing: ${label}.`,
      );
    }
  }
  return QWEN_DATA_PROCESSING_CONTRACT;
}
