import { z, ZodError } from "zod";
import {
  normalizePluginProvider,
  runVisualPluginReview,
  type PluginImage,
  PLUGIN_MAX_IMAGE_BYTES,
  PLUGIN_MAX_REFERENCE_IMAGES,
  PLUGIN_MAX_TOTAL_IMAGE_BYTES,
} from "../../../lib/visionqa/plugin-runtime";
import { parseVisualReviewRequest } from "../../../lib/visionqa/visual-review-contract";
import { getLocalCanaryReadiness } from "../../../lib/visionqa/providers/local-canary";
import { getMultimodalReadiness } from "../../../lib/visionqa/providers/multimodal.ts";
import { VisionProviderError } from "../../../lib/visionqa/providers/types";

const requestEnvelopeSchema = z.object({
  schema_version: z.literal("visual-review-v0.1"),
  request_id: z.string().min(1),
});

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

// The plugin accepts up to 14 MB of image bytes plus multipart boundaries and
// the VisualReview request envelope. Keep the framework parser above that
// governed application limit so valid local calls do not fail as a bare 413.
export const config = { api: { bodyParser: { sizeLimit: "16mb" } } };

function errorResponse(error: unknown, requestId: string) {
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return Response.json(
      {
        error: {
          code: "VISUAL_REVIEW_INVALID_REQUEST",
          message: "评审请求格式不完整，请重新发送当前上下文。",
          retryable: false,
          request_id: requestId,
        },
      },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  if (error instanceof VisionProviderError) {
    const status =
      error.code === "CONFIGURATION" ? 503 :
      error.code === "AUTHENTICATION" ? 502 :
      error.code === "RATE_LIMITED" || error.code === "QUOTA_EXHAUSTED" ? 429 :
      error.code === "PAYLOAD_TOO_LARGE" ? 413 :
      error.code === "UNSUPPORTED_MEDIA" ? 415 :
      error.code === "POLICY_BLOCKED" ? 403 :
      error.code === "TIMEOUT" ? 504 : 502;
    return Response.json(
      {
        error: {
          code: `VISUAL_REVIEW_${error.code}`,
          message: error.message,
          retryable: error.retryable,
          request_id: requestId,
        },
      },
      { status, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    {
      error: {
        code: "VISUAL_REVIEW_FAILED",
        message: "本次评审没有形成结果，请稍后重试。",
        retryable: true,
        request_id: requestId,
      },
    },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}

function imageFromFile(file: File, role: PluginImage["role"]): Promise<PluginImage> {
  if (!allowedMimeTypes.has(file.type)) {
    throw new VisionProviderError("UNSUPPORTED_MEDIA", "图片仅支持 JPG、PNG 和 WebP。", {
      retryable: false,
    });
  }
  if (file.size <= 0 || file.size > PLUGIN_MAX_IMAGE_BYTES) {
    throw new VisionProviderError("PAYLOAD_TOO_LARGE", "单张图片不能超过 10 MB。", {
      retryable: false,
    });
  }
  return file.arrayBuffer().then((bytes) => ({
    bytes,
    mimeType: file.type as PluginImage["mimeType"],
    role,
    name: file.name.slice(0, 160),
  }));
}

export function GET() {
  const readiness = getLocalCanaryReadiness(process.env);
  const multimodal = getMultimodalReadiness(process.env);
  const desktopProviderMode = process.env.VISIONQA_DESKTOP_PROVIDER_MODE ?? process.env.VISIONQA_DESKTOP_MODE;
  return Response.json(
    {
      contract: "visual-review-v0.1",
      route: "/api/visual-review",
      providers: {
        mock: { available: true, network: false, writes: false },
        qwen: {
          available: readiness.configured,
          network: true,
          writes: false,
          provider_id: readiness.providerId,
          model_snapshot: readiness.modelSnapshot,
          remaining_requests: readiness.remainingRequests,
          max_total_requests: readiness.maxTotalRequests,
          budget_minor_units: readiness.budgetMinorUnits,
          missing_configuration: readiness.missing,
        },
        user_multimodal: {
          available: multimodal.configured,
          network: true,
          writes: false,
          protocol: multimodal.protocol,
          provider_id: multimodal.providerId,
          model: multimodal.model,
          endpoint_configured: Boolean(multimodal.endpoint),
          remaining_requests: multimodal.remainingRequests,
          max_total_requests: multimodal.maxTotalRequests,
          missing_configuration: multimodal.missing,
        },
      },
      image_limits: {
        max_image_bytes: PLUGIN_MAX_IMAGE_BYTES,
        max_reference_images: PLUGIN_MAX_REFERENCE_IMAGES,
        max_total_image_bytes: PLUGIN_MAX_TOTAL_IMAGE_BYTES,
      },
      api_key_location: "server_environment_only",
      desktop_runtime: desktopProviderMode === "off" || desktopProviderMode === "real"
        ? { provider_mode: desktopProviderMode }
        : null,
      writes: false,
      human_review_required: true,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  try {
    const form = await request.formData();
    const rawRequest = form.get("request");
    if (typeof rawRequest !== "string") {
      return Response.json({ error: { code: "VISUAL_REVIEW_REQUEST_REQUIRED", message: "缺少 VisualReview 请求。", request_id: requestId } }, { status: 400 });
    }
    const parsedEnvelope = requestEnvelopeSchema.parse(JSON.parse(rawRequest));
    const visualRequest = parseVisualReviewRequest(JSON.parse(rawRequest));
    const provider = normalizePluginProvider(form.get("provider"));
    if (provider !== "mock") {
      const hostname = new URL(request.url).hostname;
      const localHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
      if (!localHost || process.env.VISION_LOCAL_CANARY_ALLOW_LOCALHOST !== "true") {
        throw new VisionProviderError(
          "CONFIGURATION",
          "真实 Provider 只在已明确允许的本地环境运行。",
          { retryable: false },
        );
      }
    }
    const candidateFile = form.get("candidate");
    const referenceFiles = form.getAll("references").filter((item): item is File => item instanceof File && item.size > 0);
    const candidate = candidateFile instanceof File ? await imageFromFile(candidateFile, "candidate") : undefined;
    if (referenceFiles.length > PLUGIN_MAX_REFERENCE_IMAGES) {
      throw new VisionProviderError(
        "PAYLOAD_TOO_LARGE",
        `参考图片最多 ${PLUGIN_MAX_REFERENCE_IMAGES} 张。`,
        { retryable: false },
      );
    }
    const references = await Promise.all(referenceFiles.map((file) => imageFromFile(file, "reference")));
    const result = await runVisualPluginReview({
      request: visualRequest,
      provider,
      candidate,
      references,
      env: process.env,
      signal: request.signal,
    });
    return Response.json(
      { ...result, request_id: parsedEnvelope.request_id },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

