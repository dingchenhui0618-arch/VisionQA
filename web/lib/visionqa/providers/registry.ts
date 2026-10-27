export const QWEN_BAILIAN_PROVIDER_ID = "aliyun-bailian-cn-beijing";
export const QWEN_BAILIAN_MODEL_SNAPSHOT = "qwen3-vl-plus-2025-12-19";

export const QWEN_CANARY_APPROVAL = Object.freeze({
  activationStatus: "PENDING_ROLE_AND_ACCOUNT_EVIDENCE",
  artifactPath:
    "handoffs/DOMESTIC_PROVIDER_REVIEW_v0.1/provider_activation_decisions.csv",
  artifactId: "DOMESTIC_PROVIDER_REVIEW_v0.1",
  artifactSha256:
    "70b50cb4c5e2dbb493d1d32e70023b37191f92f0e3a7b0d3a72425bf55796dde",
  decisionIds:
    "DOMESTIC-QWEN-001,DOMESTIC-BUDGET-001,DOMESTIC-DATA-001",
  manifestId: "domestic-provider-canary-v0.1",
  manifestSha256:
    "daa501ece72af64f25fa7e180166282ecb9cb930c56f35243926aed8e3fa0746",
  maxBudgetMinorUnits: 2_000,
  maxImages: 5,
  maxTotalRequests: 15,
  maxConcurrency: 1,
} as const);

export interface ApprovedProviderDefinition {
  readonly providerId: string;
  readonly protocol: "openai_compatible_chat";
  readonly endpoint: string;
  readonly modelSnapshot: string;
  readonly apiKeySecretName: string;
  readonly imageHosts: readonly string[];
  readonly maxImagesPerRequest: number;
  readonly maxImageBytes: number;
}

export const QWEN_BAILIAN_DEFINITION: ApprovedProviderDefinition =
  Object.freeze({
  providerId: QWEN_BAILIAN_PROVIDER_ID,
  protocol: "openai_compatible_chat",
  endpoint:
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  modelSnapshot: QWEN_BAILIAN_MODEL_SNAPSHOT,
  apiKeySecretName: "VISION_CN_ALIYUN_BAILIAN_API_KEY",
  // The exact OSS bucket host is added only after the cloud resource binding
  // is reviewed. An empty allowlist deliberately keeps governed live calls off.
  imageHosts: Object.freeze([]),
  maxImagesPerRequest: 5,
  maxImageBytes: 10 * 1024 * 1024,
});
