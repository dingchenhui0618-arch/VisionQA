import { ZodError } from "zod";
import {
  dataUrlBytes,
  hostCapturePromptContext,
  hostCaptureSchemaVersion,
  hostCaptureToVisualReviewRequest,
  parseHostCapture,
} from "../../../../lib/visionqa/host-adapter-contract.ts";
import {
  hostEvidenceSchemaVersion,
  hostEvidenceToLegacyVisualReviewRequest,
  hostEvidenceToVisualReviewV02Request,
  hostEvidencePromptContext,
  parseHostEvidenceCapture,
} from "../../../../lib/visionqa/host-evidence-v0.2.ts";
import {
  normalizePluginProvider,
  PLUGIN_MAX_IMAGE_BYTES,
  PLUGIN_MAX_REFERENCE_IMAGES,
  runVisualPluginReview,
  runVisualReviewV02Mock,
  type PluginImage,
} from "../../../../lib/visionqa/plugin-runtime.ts";
import { VisionProviderError } from "../../../../lib/visionqa/providers/types.ts";

export const config = { api: { bodyParser: { sizeLimit: "16mb" } } };

const HOST_RESULT_CACHE_TTL_MS = 5 * 60 * 1000;
const hostResultCache = new Map<string, { expiresAt: number; value: Record<string, unknown> }>();

function pruneHostResultCache(now = Date.now()): void {
  for (const [key, entry] of hostResultCache) if (entry.expiresAt <= now) hostResultCache.delete(key);
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const extensionId = process.env.VISIONQA_CHROME_EXTENSION_ID?.trim() || "audit";
  const allowedExtensionOrigin = `chrome-extension://${extensionId}`;
  const allowed = !origin || origin === "http://localhost:6300" || origin === allowedExtensionOrigin;
  return {
    "cache-control": "no-store",
    ...(allowed && origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
    "access-control-allow-headers": "content-type,x-request-id",
    "access-control-allow-methods": "POST,OPTIONS",
  };
}

function errorResponse(error: unknown, requestId: string, request: Request): Response {
  const headers = corsHeaders(request);
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return Response.json({ error: { code: "VISUAL_REVIEW_HOST_INVALID_REQUEST", message: "宿主上下文不完整，请重新采集当前页面。", retryable: false, request_id: requestId } }, { status: 400, headers });
  }
  if (error instanceof VisionProviderError) {
    const status = error.code === "CONFIGURATION" ? 503 : error.code === "AUTHENTICATION" ? 502 : error.code === "RATE_LIMITED" || error.code === "QUOTA_EXHAUSTED" ? 429 : error.code === "PAYLOAD_TOO_LARGE" ? 413 : error.code === "UNSUPPORTED_MEDIA" ? 415 : error.code === "POLICY_BLOCKED" ? 403 : error.code === "TIMEOUT" ? 504 : 502;
    return Response.json({ error: { code: `VISUAL_REVIEW_${error.code}`, message: error.message, retryable: error.retryable, request_id: requestId } }, { status, headers });
  }
  return Response.json({ error: { code: "VISUAL_REVIEW_HOST_FAILED", message: "当前宿主页面没有形成评审结果，请重新采集。", retryable: true, request_id: requestId } }, { status: 500, headers });
}

function toPluginImage(image: { role: "candidate" | "reference"; name: string; mime_type: PluginImage["mimeType"]; data_url: string }): PluginImage {
  const bytes = dataUrlBytes(image.data_url);
  if (bytes.byteLength <= 0 || bytes.byteLength > PLUGIN_MAX_IMAGE_BYTES) throw new VisionProviderError("PAYLOAD_TOO_LARGE", "宿主截图不能超过 10 MB。", { retryable: false });
  return { bytes: bytes.slice().buffer, mimeType: image.mime_type, role: image.role, name: image.name };
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  try {
    const hostname = new URL(request.url).hostname;
    const localHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    if (!localHost || process.env.NODE_ENV === "production") throw new VisionProviderError("CONFIGURATION", "宿主适配器只允许在非生产的 localhost 服务上运行。", { retryable: false });
    const payload = await request.json() as { capture?: unknown; provider?: unknown } | null;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new SyntaxError("Host Capture body must be an object.");
    const rawCapture = payload.capture ?? payload;
    if (rawCapture && typeof rawCapture === "object" && !Array.isArray(rawCapture) && (rawCapture as { schema_version?: unknown }).schema_version === hostEvidenceSchemaVersion) {
      const capture = parseHostEvidenceCapture(rawCapture);
      const provider = normalizePluginProvider(payload.provider);
      if (provider !== "mock" && process.env.VISION_LOCAL_CANARY_ALLOW_LOCALHOST !== "true") {
        throw new VisionProviderError("CONFIGURATION", "真实宿主评审只在已明确允许的本地环境运行。", { retryable: false });
      }
      if (provider !== "mock" && !capture.permissions.can_call_model) {
        throw new VisionProviderError("POLICY_BLOCKED", "宿主尚未授权本次视觉模型调用。", { retryable: false });
      }
      pruneHostResultCache();
      const cacheKey = `${capture.capture_id}:${provider}:v0.2`;
      const cached = hostResultCache.get(cacheKey);
      if (cached) return Response.json({ ...cached.value, replayed: true }, { headers: corsHeaders(request) });
      const v02Request = hostEvidenceToVisualReviewV02Request(capture);
      const result = provider === "mock"
        ? runVisualReviewV02Mock(v02Request)
        : await runVisualPluginReview({
            request: hostEvidenceToLegacyVisualReviewRequest(capture),
            provider,
            candidate: capture.images.find((image) => image.role === "candidate") ? toPluginImage(capture.images.find((image) => image.role === "candidate")!) : undefined,
            references: capture.images.filter((image) => image.role === "reference").map(toPluginImage),
            contextSummary: hostEvidencePromptContext(capture),
            env: process.env,
            signal: request.signal,
          });
      const responsePayload = {
        ...result,
        host_capture: {
          capture_id: capture.capture_id,
          schema_version: capture.schema_version,
          dom_elements_received: capture.dom.elements.length,
          selected_element_received: Boolean(capture.dom.selected_element),
          page_revision_id: capture.page.revision_id,
          conversation_messages_received: capture.conversation.length,
        },
      } as unknown as Record<string, unknown>;
      hostResultCache.set(cacheKey, { expiresAt: Date.now() + HOST_RESULT_CACHE_TTL_MS, value: responsePayload });
      return Response.json(responsePayload, { headers: corsHeaders(request) });
    }
    const capture = parseHostCapture(payload.capture ?? payload);
    if (capture.schema_version !== hostCaptureSchemaVersion) throw new Error("宿主上下文版本不受支持。");
    const provider = normalizePluginProvider(payload.provider);
    if (provider !== "mock" && process.env.VISION_LOCAL_CANARY_ALLOW_LOCALHOST !== "true") throw new VisionProviderError("CONFIGURATION", "本地宿主适配器尚未开启 localhost 模型调用门控。", { retryable: false });
    if (provider !== "mock" && !capture.permissions.can_call_model) throw new VisionProviderError("POLICY_BLOCKED", "宿主尚未授权本次视觉模型调用。", { retryable: false });
    pruneHostResultCache();
    const cacheKey = `${capture.capture_id}:${provider}`;
    const cached = hostResultCache.get(cacheKey);
    if (cached) return Response.json({ ...cached.value, replayed: true }, { headers: corsHeaders(request) });
    const candidateRecord = capture.images.find((image) => image.role === "candidate");
    const candidate = candidateRecord ? toPluginImage(candidateRecord) : undefined;
    const referenceRecords = capture.images.filter((image) => image.role === "reference");
    if (referenceRecords.length > PLUGIN_MAX_REFERENCE_IMAGES) throw new VisionProviderError("PAYLOAD_TOO_LARGE", `参考图片最多 ${PLUGIN_MAX_REFERENCE_IMAGES} 张。`, { retryable: false });
    const references = referenceRecords.map(toPluginImage);
    const result = await runVisualPluginReview({
      request: {
        ...hostCaptureToVisualReviewRequest(capture),
        request_id: requestId,
      },
      provider,
      candidate,
      references,
      contextSummary: hostCapturePromptContext(capture),
      env: process.env,
      signal: request.signal,
    });
    const responsePayload = { ...result, host_capture: { capture_id: capture.capture_id, dom_summary_received: true, conversation_messages_received: capture.conversation.length } } as unknown as Record<string, unknown>;
    hostResultCache.set(cacheKey, { expiresAt: Date.now() + HOST_RESULT_CACHE_TTL_MS, value: responsePayload });
    return Response.json(responsePayload, { headers: corsHeaders(request) });
  } catch (error) {
    return errorResponse(error, requestId, request);
  }
}
