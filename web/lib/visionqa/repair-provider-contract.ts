export const REPAIR_PROVIDER_JOB_SCHEMA_VERSION =
  "visionqa-repair-provider-job-v0.1" as const;
export const QWEN_IMAGE_EDIT_PROVIDER_ID =
  "aliyun-bailian-qwen-image-edit-beijing" as const;
export const QWEN_IMAGE_EDIT_MODEL_SNAPSHOT =
  "qwen-image-edit-max-2026-01-16" as const;
export const QWEN_IMAGE_EDIT_DATA_SCOPE =
  "MODEL_DRAFT_AND_PRODUCT_REFERENCES" as const;
export const QWEN_IMAGE_3_PROVIDER_ID =
  "aliyun-bailian-qwen-image-3-beijing" as const;
export const QWEN_IMAGE_3_MODEL_SNAPSHOT = "qwen-image-3.0-pro" as const;

export type RepairProviderRoute = "qwen-image-3" | "qwen-image-edit-max";

export type RepairProviderJobStatus =
  | "READY"
  | "BLOCKED_AUTHORIZATION"
  | "ADAPTER_NOT_CONFIGURED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "OUTPUT_SUPPLIED";

export type RepairProviderJobSnapshot = {
  schemaVersion: typeof REPAIR_PROVIDER_JOB_SCHEMA_VERSION;
  jobId: string;
  sourceAssetId: number;
  sourceSha256: string;
  providerId: string;
  modelSnapshot: string | null;
  status: RepairProviderJobStatus;
  authorizationBlockers: string[];
  providerRequestId: string | null;
  outputSource: "QWEN_BAILIAN" | "USER_SUPPLIED" | null;
  externalNetworkUsed: boolean;
  modelInferenceUsed: boolean;
  imageCount: number | null;
  outputWidth: number | null;
  outputHeight: number | null;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
  humanFinalReviewRequired: true;
};

export type RepairProviderCapability = {
  adapterReady: true;
  providerId: string;
  modelSnapshot: string;
  region: "cn-beijing";
  apiKeyConfigured: boolean;
  workspaceConfigured: boolean;
  providerApproved: boolean;
  paidCallsApproved: boolean;
  dataScopeApproved: boolean;
  modelSnapshotLocked: boolean;
  liveReady: boolean;
  blockers: string[];
  maxSourceBytes: number;
  maxReferenceImages: number;
  outputMaxDimension: number;
  outputPersistence: "BROWSER_PROJECT";
  humanFinalReviewRequired: true;
  autoPublishEnabled: false;
};

export function createRepairProviderJob(input: {
  sourceAssetId: number;
  sourceSha256: string;
  providerId: string;
  modelSnapshot?: string | null;
  status: RepairProviderJobStatus;
  authorizationBlockers?: string[];
  now?: string;
  jobId?: string;
}): RepairProviderJobSnapshot {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: REPAIR_PROVIDER_JOB_SCHEMA_VERSION,
    jobId:
      input.jobId ??
      `repair-${input.sourceAssetId}-${globalThis.crypto.randomUUID()}`,
    sourceAssetId: input.sourceAssetId,
    sourceSha256: input.sourceSha256,
    providerId: input.providerId,
    modelSnapshot: input.modelSnapshot ?? null,
    status: input.status,
    authorizationBlockers: [...(input.authorizationBlockers ?? [])],
    providerRequestId: null,
    outputSource: null,
    externalNetworkUsed: false,
    modelInferenceUsed: false,
    imageCount: null,
    outputWidth: null,
    outputHeight: null,
    failureCode: null,
    createdAt: now,
    updatedAt: now,
    humanFinalReviewRequired: true,
  };
}

export function updateRepairProviderJob(
  current: RepairProviderJobSnapshot,
  patch: Partial<
    Omit<
      RepairProviderJobSnapshot,
      "schemaVersion" | "jobId" | "sourceAssetId" | "sourceSha256" | "createdAt" | "humanFinalReviewRequired"
    >
  >,
  now = new Date().toISOString(),
): RepairProviderJobSnapshot {
  return {
    ...current,
    ...patch,
    authorizationBlockers:
      patch.authorizationBlockers === undefined
        ? current.authorizationBlockers
        : [...patch.authorizationBlockers],
    updatedAt: now,
  };
}
