import type {
  RepairProviderCapability,
  RepairProviderRoute,
} from "./repair-provider-contract";

export class RepairProviderApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "RepairProviderApiError";
  }
}

export type RepairProviderExecution = {
  file: File;
  providerId: string;
  modelSnapshot: string;
  providerRequestId: string;
  imageCount: number;
  outputWidth: number | null;
  outputHeight: number | null;
};

async function parseError(response: Response): Promise<RepairProviderApiError> {
  const body = (await response.json().catch(() => null)) as
    | {
        error?: {
          code?: string;
          message?: string;
          retryable?: boolean;
        };
      }
    | null;
  return new RepairProviderApiError(
    body?.error?.message || `改图请求失败（HTTP ${response.status}）`,
    body?.error?.code || "REPAIR_PROVIDER_REQUEST_FAILED",
    Boolean(body?.error?.retryable),
  );
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function outputName(sourceName: string, mimeType: string): string {
  const base = sourceName.replace(/\.[^.]+$/, "") || "model-draft";
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  return `${base}-qwen-repair.${extension}`;
}

export async function getRepairProviderCapability(
  route: RepairProviderRoute,
  signal?: AbortSignal,
): Promise<RepairProviderCapability> {
  const response = await fetch(`/api/repair-jobs?route=${encodeURIComponent(route)}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw await parseError(response);
  const body = (await response.json()) as {
    adapter_ready: true;
    provider_id: RepairProviderCapability["providerId"];
    model_snapshot: RepairProviderCapability["modelSnapshot"];
    region: "cn-beijing";
    api_key_configured: boolean;
    workspace_configured: boolean;
    provider_approved: boolean;
    paid_calls_approved: boolean;
    data_scope_approved: boolean;
    model_snapshot_locked: boolean;
    live_ready: boolean;
    blockers: string[];
    max_source_bytes: number;
    max_reference_images: number;
    output_max_dimension: number;
    output_persistence: "BROWSER_PROJECT";
    human_final_review_required: true;
    auto_publish_enabled: false;
  };
  return {
    adapterReady: body.adapter_ready,
    providerId: body.provider_id,
    modelSnapshot: body.model_snapshot,
    region: body.region,
    apiKeyConfigured: body.api_key_configured,
    workspaceConfigured: body.workspace_configured,
    providerApproved: body.provider_approved,
    paidCallsApproved: body.paid_calls_approved,
    dataScopeApproved: body.data_scope_approved,
    modelSnapshotLocked: body.model_snapshot_locked,
    liveReady: body.live_ready,
    blockers: body.blockers,
    maxSourceBytes: body.max_source_bytes,
    maxReferenceImages: body.max_reference_images,
    outputMaxDimension: body.output_max_dimension,
    outputPersistence: body.output_persistence,
    humanFinalReviewRequired: body.human_final_review_required,
    autoPublishEnabled: body.auto_publish_enabled,
  };
}

export async function executeQwenRepair(input: {
  route: RepairProviderRoute;
  source: File;
  references: File[];
  sourceSha256: string;
  prompt: string;
  sourceWidth: number;
  sourceHeight: number;
  signal?: AbortSignal;
}): Promise<RepairProviderExecution> {
  const form = new FormData();
  form.set("source", input.source);
  input.references.slice(0, 4).forEach((file) => form.append("references", file));
  form.set("sourceSha256", input.sourceSha256);
  form.set("prompt", input.prompt);
  form.set("route", input.route);
  form.set("sourceWidth", String(input.sourceWidth));
  form.set("sourceHeight", String(input.sourceHeight));
  form.set("consent", "MODEL_DRAFT_AND_PRODUCT_REFERENCES");
  const response = await fetch(`/api/repair-jobs?route=${encodeURIComponent(input.route)}`, {
    method: "POST",
    body: form,
    cache: "no-store",
    signal: input.signal,
  });
  if (!response.ok) throw await parseError(response);
  const body = (await response.json()) as {
    provider: {
      provider_id: string;
      model_snapshot: string;
      provider_request_id: string;
      image_count: number;
      output_width: number | null;
      output_height: number | null;
    };
    output: { mime_type: string; base64: string };
  };
  const blob = base64ToBlob(body.output.base64, body.output.mime_type);
  return {
    file: new File([blob], outputName(input.source.name, body.output.mime_type), {
      type: body.output.mime_type,
      lastModified: Date.now(),
    }),
    providerId: body.provider.provider_id,
    modelSnapshot: body.provider.model_snapshot,
    providerRequestId: body.provider.provider_request_id,
    imageCount: body.provider.image_count,
    outputWidth: body.provider.output_width,
    outputHeight: body.provider.output_height,
  };
}
