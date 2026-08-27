import {
  QWEN_IMAGE_EDIT_DATA_SCOPE,
  type RepairProviderRoute,
} from "../../../lib/visionqa/repair-provider-contract";
import {
  createGovernedQwenImageEditProvider,
  getQwenImageEditReadiness,
  QWEN_IMAGE_EDIT_MAX_REFERENCES,
  QWEN_IMAGE_EDIT_MAX_SOURCE_BYTES,
  QwenImageEditProviderError,
} from "../../../lib/visionqa/providers/qwen-image-edit";
import {
  createQwenImage3Provider,
  getQwenImage3Readiness,
  QWEN_IMAGE_3_MAX_IMAGE_BYTES,
  QWEN_IMAGE_3_MAX_REFERENCES,
  QWEN_IMAGE_3_MODEL,
  QWEN_IMAGE_3_PROVIDER_ID,
  QwenImage3ProviderError,
} from "../../../lib/visionqa/providers/qwen-image-3";

const MAX_REQUEST_BYTES = 34 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function selectedRoute(value: string | null): RepairProviderRoute {
  return value === "qwen-image-edit-max" ? value : "qwen-image-3";
}

function readinessFor(route: RepairProviderRoute) {
  if (route !== "qwen-image-3") return getQwenImageEditReadiness();
  const readiness = getQwenImage3Readiness(process.env);
  return {
    adapterReady: true as const,
    providerId: QWEN_IMAGE_3_PROVIDER_ID,
    modelSnapshot: QWEN_IMAGE_3_MODEL,
    region: "cn-beijing" as const,
    ...readiness,
    maxSourceBytes: QWEN_IMAGE_3_MAX_IMAGE_BYTES,
    maxReferenceImages: QWEN_IMAGE_3_MAX_REFERENCES,
    outputMaxDimension: 2048,
    outputPersistence: "BROWSER_PROJECT" as const,
    humanFinalReviewRequired: true as const,
    autoPublishEnabled: false as const,
  };
}

function capabilityResponse(route: RepairProviderRoute) {
  const readiness = readinessFor(route);
  return {
    adapter_ready: readiness.adapterReady,
    provider_id: readiness.providerId,
    model_snapshot: readiness.modelSnapshot,
    region: readiness.region,
    api_key_configured: readiness.apiKeyConfigured,
    workspace_configured: readiness.workspaceConfigured,
    provider_approved: readiness.providerApproved,
    paid_calls_approved: readiness.paidCallsApproved,
    data_scope_approved: readiness.dataScopeApproved,
    model_snapshot_locked: readiness.modelSnapshotLocked,
    live_ready: readiness.liveReady,
    blockers: readiness.blockers,
    max_source_bytes: readiness.maxSourceBytes,
    max_reference_images: readiness.maxReferenceImages,
    output_max_dimension: readiness.outputMaxDimension,
    output_persistence: readiness.outputPersistence,
    human_final_review_required: readiness.humanFinalReviewRequired,
    auto_publish_enabled: readiness.autoPublishEnabled,
  };
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  retryable = false,
) {
  return Response.json(
    { error: { code, message, retryable } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function validImage(file: File): boolean {
  return (
    SUPPORTED_IMAGE_TYPES.has(file.type) &&
    file.size > 0 &&
    file.size <= QWEN_IMAGE_EDIT_MAX_SOURCE_BYTES
  );
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function GET(request: Request) {
  const route = selectedRoute(new URL(request.url).searchParams.get("route"));
  return Response.json(capabilityResponse(route), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const requestedRoute = selectedRoute(new URL(request.url).searchParams.get("route"));
  const headerReadiness = readinessFor(requestedRoute);
  // Authorization is checked before request.formData() so blocked requests never read image bytes.
  if (!headerReadiness.liveReady) {
    return errorResponse(
      403,
      "REPAIR_PROVIDER_NOT_AUTHORIZED",
      `千问改图仍被授权 Gate 阻断：${headerReadiness.blockers.join(",")}`,
    );
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return errorResponse(413, "REPAIR_INPUT_TOO_LARGE", "改图任务超过当前请求上限。");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "INVALID_FORM_DATA", "无法读取改图任务。");
  }
  const route = selectedRoute(typeof form.get("route") === "string" ? String(form.get("route")) : null);
  if (route !== requestedRoute) {
    return errorResponse(409, "PROVIDER_ROUTE_MISMATCH", "改图模型路由与当前授权检查不一致。");
  }
  if (form.get("consent") !== QWEN_IMAGE_EDIT_DATA_SCOPE) {
    return errorResponse(
      403,
      "DATA_TRANSFER_CONSENT_REQUIRED",
      "本次发送 AI 模特草图与商品真值图前必须重新确认。",
    );
  }
  const source = form.get("source");
  const references = form.getAll("references").filter(
    (value): value is File => value instanceof File,
  );
  const prompt = form.get("prompt");
  const claimedSha256 = form.get("sourceSha256");
  const sourceWidth = Number(form.get("sourceWidth"));
  const sourceHeight = Number(form.get("sourceHeight"));
  const maxReferences = route === "qwen-image-3" ? QWEN_IMAGE_3_MAX_REFERENCES : QWEN_IMAGE_EDIT_MAX_REFERENCES;
  const maxImageBytes = route === "qwen-image-3" ? QWEN_IMAGE_3_MAX_IMAGE_BYTES : QWEN_IMAGE_EDIT_MAX_SOURCE_BYTES;
  if (
    !(source instanceof File) ||
    !validImage(source) ||
    source.size > maxImageBytes ||
    references.length > maxReferences ||
    references.some((file) => !validImage(file)) ||
    typeof prompt !== "string" ||
    !prompt.trim() ||
    prompt.length > 4_000 ||
    typeof claimedSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(claimedSha256) ||
    !Number.isInteger(sourceWidth) || sourceWidth <= 0 ||
    !Number.isInteger(sourceHeight) || sourceHeight <= 0
  ) {
    return errorResponse(422, "INVALID_REPAIR_INPUT", "改图任务缺少有效图片、Prompt 或素材指纹。");
  }
  const totalBytes =
    source.size + references.reduce((total, file) => total + file.size, 0);
  if (totalBytes > 30 * 1024 * 1024) {
    return errorResponse(413, "REPAIR_INPUT_TOO_LARGE", "改图素材总大小超过 30 MB。");
  }
  if ((await sha256(source)) !== claimedSha256) {
    return errorResponse(409, "SOURCE_HASH_MISMATCH", "改图素材与当前项目记录不一致。");
  }

  try {
    const sourceInput = {
      bytes: new Uint8Array(await source.arrayBuffer()),
      mimeType: source.type as "image/jpeg" | "image/png" | "image/webp",
    };
    const referenceInputs = await Promise.all(
      references.map(async (file) => ({
        bytes: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
      })),
    );
    const result = route === "qwen-image-3"
      ? await createQwenImage3Provider(process.env).edit({
          source: sourceInput,
          references: referenceInputs,
          prompt,
          negativePrompt: "禁止改变人物身份、姿势、脸、手脚、背景、镜头、构图和画幅；禁止添加文字、水印、促销信息或未提供的商品细节；禁止裁切成商品局部特写。",
          sourceWidth,
          sourceHeight,
          signal: request.signal,
        })
      : await createGovernedQwenImageEditProvider().edit({
          source: sourceInput,
          references: referenceInputs,
          prompt,
          signal: request.signal,
        });
    return Response.json(
      {
        schema_version: "visionqa-repair-provider-response-v0.1",
        provider: {
          provider_id: result.providerId,
          model_snapshot: result.modelSnapshot,
          provider_request_id: result.providerRequestId,
          image_count: result.imageCount,
          output_width: result.outputWidth,
          output_height: result.outputHeight,
        },
        output: {
          mime_type: result.outputMimeType,
          base64: bytesToBase64(result.outputBytes),
          persistence: "BROWSER_PROJECT",
        },
        human_final_review_required: true,
        auto_publish_enabled: false,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-VisionQA-Repair-Provider": result.providerId,
        },
      },
    );
  } catch (error) {
    if (error instanceof QwenImageEditProviderError || error instanceof QwenImage3ProviderError) {
      const status =
        error.code === "AUTHENTICATION"
          ? 401
          : error.code === "RATE_LIMITED"
            ? 429
            : error.code === "QUOTA"
              ? 402
              : error.code === "INVALID_INPUT"
                ? 422
                : 502;
      return errorResponse(status, error.code, error.message, "retryable" in error ? Boolean(error.retryable) : false);
    }
    return errorResponse(500, "REPAIR_PROVIDER_FAILED", "千问改图任务执行失败。");
  }
}
