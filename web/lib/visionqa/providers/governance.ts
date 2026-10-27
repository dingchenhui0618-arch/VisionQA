import {
  QWEN_BAILIAN_DEFINITION,
  QWEN_CANARY_APPROVAL,
  type ApprovedProviderDefinition,
} from "./registry.ts";
import { assertQwenDataProcessingContract } from "./data-processing-contract.ts";
import { VisionProviderError } from "./types.ts";

export type VisionProviderEnvironment = Record<string, string | undefined>;

const REQUIRED_TRUE_GATES = [
  "VISION_LIVE_PROVIDER_ENABLED",
  "VISION_PAID_CALLS_ENABLED",
  "VISION_DATA_PROCESSING_APPROVED",
  "VISION_STAGING_READY",
  "STAGING_ALIYUN_OSS_PG_ACCEPTED",
  "DATASET_RIGHTS_ALLOWLIST_MATCH",
  "MAINLAND_PROCESSING_EVIDENCE",
  "NO_TRAINING_WRITTEN_EVIDENCE",
  "RETENTION_DAYS_AND_SCOPE_CONFIRMED",
  "CONTENT_REVIEW_AND_HUMAN_ACCESS_CONFIRMED",
  "DELETION_AND_BACKUP_SLA_CONFIRMED",
  "PRIVATE_OR_TENANT_ISOLATED_PATH_CONFIRMED",
  "LOG_BACKFLOW_DISABLED",
  "SECRET_MANAGER_CONFIGURED",
  "IP_AND_MODEL_ALLOWLIST_CONFIGURED",
  "COST_HARD_STOP_TESTED",
  "VISION_PRIVATE_IMAGE_URLS_CONFIRMED",
  "EXPLICIT_RUN_APPROVAL",
] as const;

function requiredPositiveInteger(
  env: VisionProviderEnvironment,
  name: string,
): number {
  const parsed = Number(env[name]);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new VisionProviderError(
      "CONFIGURATION",
      `${name} must be an explicit positive integer.`,
    );
  }
  return parsed;
}

function isApprovedActivationStatus(status: string): boolean {
  return status === "APPROVED";
}

export interface QwenGovernanceConfig {
  apiKey: string;
  imageEnvelopeHmacSecret: string;
  maxConcurrency: number;
}

export function assertQwenGovernance(
  env: VisionProviderEnvironment,
  definition: ApprovedProviderDefinition = QWEN_BAILIAN_DEFINITION,
): QwenGovernanceConfig {
  if (env.QWEN_PROVIDER_APPROVED !== "true") {
    throw new VisionProviderError(
      "CONFIGURATION",
      "QWEN_PROVIDER_APPROVED must be explicitly true.",
    );
  }
  if (env.VISION_PROVIDER_APPROVED !== definition.providerId) {
    throw new VisionProviderError(
      "CONFIGURATION",
      "The approved provider must exactly match the Qwen registry entry.",
    );
  }
  const approvalBindings = {
    VISION_RUN_APPROVAL_ARTIFACT_PATH: QWEN_CANARY_APPROVAL.artifactPath,
    VISION_RUN_APPROVAL_ARTIFACT_ID: QWEN_CANARY_APPROVAL.artifactId,
    VISION_RUN_APPROVAL_ARTIFACT_SHA256:
      QWEN_CANARY_APPROVAL.artifactSha256,
    VISION_RUN_APPROVAL_DECISION_IDS:
      QWEN_CANARY_APPROVAL.decisionIds,
    CANARY_MANIFEST_ID: QWEN_CANARY_APPROVAL.manifestId,
    CANARY_MANIFEST_SHA256: QWEN_CANARY_APPROVAL.manifestSha256,
  } as const;
  for (const [name, approvedValue] of Object.entries(approvalBindings)) {
    if (env[name]?.trim().toLowerCase() !== approvedValue.toLowerCase()) {
      throw new VisionProviderError(
        "CONFIGURATION",
        `Qwen run approval binding is missing or invalid: ${name}.`,
      );
    }
  }
  if (env.VISION_ENVIRONMENT !== "staging") {
    throw new VisionProviderError(
      "CONFIGURATION",
      "Qwen live evaluation is restricted to staging.",
    );
  }
  for (const gate of REQUIRED_TRUE_GATES) {
    if (env[gate] !== "true") {
      throw new VisionProviderError(
        "CONFIGURATION",
        `Required Qwen governance gate is missing: ${gate}.`,
      );
    }
  }
  assertQwenDataProcessingContract(env);
  if (env.VISION_MODEL !== definition.modelSnapshot) {
    throw new VisionProviderError(
      "CONFIGURATION",
      `VISION_MODEL must equal the approved dated Qwen snapshot ${definition.modelSnapshot}.`,
    );
  }
  const apiKey = env[definition.apiKeySecretName]?.trim();
  if (!apiKey) {
    throw new VisionProviderError(
      "CONFIGURATION",
      "The Qwen API secret is not configured.",
    );
  }
  const imageEnvelopeHmacSecret =
    env.VISION_PRIVATE_IMAGE_ENVELOPE_HMAC_SECRET?.trim();
  if (!imageEnvelopeHmacSecret) {
    throw new VisionProviderError(
      "CONFIGURATION",
      "The private-image envelope verification secret is not configured.",
    );
  }
  if (new TextEncoder().encode(imageEnvelopeHmacSecret).byteLength < 32) {
    throw new VisionProviderError(
      "CONFIGURATION",
      "The private-image envelope verification secret must be at least 32 bytes.",
    );
  }
  if (env.VISION_BUDGET_CURRENCY !== "CNY") {
    throw new VisionProviderError(
      "CONFIGURATION",
      "Qwen budget currency must be CNY.",
    );
  }

  const budget = requiredPositiveInteger(
    env,
    "VISION_BUDGET_LIMIT_MINOR_UNITS",
  );
  const estimated = requiredPositiveInteger(
    env,
    "VISION_ESTIMATED_BATCH_COST_MINOR_UNITS",
  );
  const batchSize = requiredPositiveInteger(env, "VISION_BATCH_SIZE");
  const maxConcurrency = requiredPositiveInteger(
    env,
    "VISION_MAX_CONCURRENCY",
  );
  const maxTotalRequests = requiredPositiveInteger(
    env,
    "VISION_MAX_TOTAL_REQUESTS",
  );
  if (
    budget !== QWEN_CANARY_APPROVAL.maxBudgetMinorUnits ||
    estimated > budget
  ) {
    throw new VisionProviderError(
      "CONFIGURATION",
      "The Qwen canary budget must exactly match the approved CNY 20 scope.",
    );
  }
  if (batchSize !== QWEN_CANARY_APPROVAL.maxImages) {
    throw new VisionProviderError(
      "CONFIGURATION",
      "VISION_BATCH_SIZE must exactly match the approved five-image canary.",
    );
  }
  if (maxTotalRequests !== QWEN_CANARY_APPROVAL.maxTotalRequests) {
    throw new VisionProviderError(
      "CONFIGURATION",
      "VISION_MAX_TOTAL_REQUESTS must exactly match the approved value 15.",
    );
  }
  if (maxConcurrency !== QWEN_CANARY_APPROVAL.maxConcurrency) {
    throw new VisionProviderError(
      "CONFIGURATION",
      "VISION_MAX_CONCURRENCY must exactly match the approved value 1.",
    );
  }
  if (
    !isApprovedActivationStatus(QWEN_CANARY_APPROVAL.activationStatus)
  ) {
    throw new VisionProviderError(
      "CONFIGURATION",
      "The bound Qwen approval artifact is not yet an approved activation record.",
    );
  }
  return { apiKey, imageEnvelopeHmacSecret, maxConcurrency };
}
