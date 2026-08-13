import { getApiContext } from "../../../lib/platform/api-context";
import {
  stableError,
  text,
} from "../../../lib/platform/contracts";
import {
  validateEvaluationResultV03,
} from "../../../lib/visionqa/contracts";
import {
  createLocalCanaryQwenAdapter,
  getLocalCanaryReadiness,
  LOCAL_CANARY_MAX_IMAGE_BYTES,
  LOCAL_CANARY_MAX_REFERENCE_IMAGES,
} from "../../../lib/visionqa/providers/local-canary";
import { applyContextGate } from "../../../lib/visionqa/context-gate";
import { orchestrateVisionEvaluation } from "../../../lib/visionqa/providers/orchestrator";
import { VisionProviderError } from "../../../lib/visionqa/providers/types";

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function isLoopbackRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

async function authorize(request: Request, requestId: string) {
  if (isLoopbackRequest(request)) {
    if (process.env.VISION_LOCAL_CANARY_ALLOW_LOCALHOST === "true") {
      return null;
    }
    return stableError(
      "LOCAL_CANARY_NOT_AUTHORIZED",
      "本机真实模型演示尚未获得运行授权。",
      requestId,
      403,
    );
  }
  const context = await getApiContext(requestId);
  return "response" in context ? context.response : null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function providerErrorResponse(error: VisionProviderError, requestId: string) {
  const mapping: Record<
    VisionProviderError["code"],
    { status: number; code: string; message: string }
  > = {
    CONFIGURATION: {
      status: 503,
      code: "LIVE_MODEL_NOT_CONFIGURED",
      message: "真实模型尚未完成密钥与运行授权配置。",
    },
    AUTHENTICATION: {
      status: 502,
      code: "LIVE_MODEL_AUTHENTICATION_FAILED",
      message: "模型服务鉴权失败，请检查百炼 API Key。",
    },
    RATE_LIMITED: {
      status: 429,
      code: "LIVE_MODEL_RATE_LIMITED",
      message: "模型服务繁忙，请稍后重试。",
    },
    TIMEOUT: {
      status: 504,
      code: "LIVE_MODEL_TIMEOUT",
      message: "模型分析超时，本次没有形成结果。",
    },
    NETWORK: {
      status: 502,
      code: "LIVE_MODEL_NETWORK_FAILED",
      message: "无法连接模型服务，本次没有形成结果。",
    },
    PROVIDER_UNAVAILABLE: {
      status: 503,
      code: "LIVE_MODEL_UNAVAILABLE",
      message: "模型服务暂不可用，请稍后重试。",
    },
    INVALID_OUTPUT: {
      status: 502,
      code: "LIVE_MODEL_INVALID_OUTPUT",
      message: "模型返回内容未通过结构校验，本次结果已丢弃。",
    },
    POLICY_BLOCKED: {
      status: 422,
      code: "LIVE_MODEL_POLICY_BLOCKED",
      message: "模型服务拒绝处理该图片。",
    },
    PAYLOAD_TOO_LARGE: {
      status: 413,
      code: "LIVE_MODEL_IMAGE_TOO_LARGE",
      message: "图片超过真实模型演示的 10 MB 限制。",
    },
    UNSUPPORTED_MEDIA: {
      status: 415,
      code: "LIVE_MODEL_UNSUPPORTED_MEDIA",
      message: "真实模型服务仅支持 JPG、PNG 和 WebP。",
    },
    QUOTA_EXHAUSTED: {
      status: 429,
      code: "LIVE_MODEL_CANARY_LIMIT_REACHED",
      message: "当前批次的模型请求上限已达到。",
    },
    ABORTED: {
      status: 499,
      code: "LIVE_MODEL_ABORTED",
      message: "模型分析已取消。",
    },
  };
  const mapped = mapping[error.code];
  return stableError(
    mapped.code,
    mapped.message,
    requestId,
    mapped.status,
    error.retryable,
  );
}

function resolveCommercialTemplate(templateId: string, channel: string, placement: string) {
  const templates: Record<string, { id: string; scope: string }> = {
    "brand-flagship": {
      id: "brand_flagship_main_image",
      scope: "品牌旗舰商品主图：强调商品主体、品牌质感与图位适配；无促销文案时，促销层级和文字可读性可标 NOT_APPLICABLE。",
    },
    "product-main-image": {
      id: "product_main_image",
      scope: "普通服饰商品主图：强调商品主体、款式材质与购买判断；不因缺少促销价格文案扣分，促销层级可标 NOT_APPLICABLE。",
    },
    "lifestyle-campaign": {
      id: "lifestyle_campaign",
      scope: "服饰生活方式广告：强调真人、摄影、材质、氛围与点击动机；不要求价格或促销文案，促销层级与无文字画面的信息可读性可标 NOT_APPLICABLE。",
    },
    "aesthetic-reference": {
      id: "aesthetic_reference",
      scope: "服饰审美参考：评估真人、摄影、材质和视觉吸引力，不把平台促销或商品主图规则作为硬要求；不适用的商业子项必须标 NOT_APPLICABLE。",
    },
    "platform-promotion": {
      id: "platform_promotion_main_image",
      scope: "平台促销主图：完整评估商品主体、卖点、促销层级、信息可读性、点击动机和渠道图位适配。",
    },
  };
  const selected = templates[templateId] ?? templates["platform-promotion"];
  return {
    id: selected.id,
    version: "0.3.0",
    assessmentScope: `${channel} / ${placement}。${selected.scope}`,
  };
}

type CustomerProfile = {
  styles: string[];
  priceMin: string;
  priceMax: string;
  audiences: string[];
  skuLinks: string[];
};

function parseCustomerProfile(value: FormDataEntryValue | null): CustomerProfile {
  const empty = { styles: [], priceMin: "", priceMax: "", audiences: [], skuLinks: [] };
  if (typeof value !== "string") return empty;
  try {
    const source = JSON.parse(value) as Partial<CustomerProfile>;
    const list = (input: unknown, limit: number) =>
      Array.isArray(input)
        ? input.filter((item): item is string => typeof item === "string")
            .map((item) => item.trim().slice(0, 120)).filter(Boolean).slice(0, limit)
        : [];
    return {
      styles: list(source.styles, 8),
      priceMin: typeof source.priceMin === "string" ? source.priceMin.slice(0, 20) : "",
      priceMax: typeof source.priceMax === "string" ? source.priceMax.slice(0, 20) : "",
      audiences: list(source.audiences, 8),
      skuLinks: list(source.skuLinks, 20),
    };
  } catch {
    return empty;
  }
}

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const readiness = getLocalCanaryReadiness(process.env);
  return Response.json(
    {
      configured: readiness.configured,
      provider_id: readiness.providerId,
      model_snapshot: readiness.modelSnapshot,
      max_image_bytes: readiness.maxImageBytes,
      max_total_requests: readiness.maxTotalRequests,
      budget_currency: readiness.budgetCurrency,
      budget_minor_units: readiness.budgetMinorUnits,
      requires_per_image_consent: true,
      image_persistence: "NONE",
      result_persistence: "BROWSER_ONLY",
      review_policy: "HUMAN_REVIEW_REQUIRED",
      auto_pass_enabled: false,
      request_id: requestId,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const authorizationError = await authorize(request, requestId);
  if (authorizationError) return authorizationError;

  const readiness = getLocalCanaryReadiness(process.env);
  if (!readiness.configured) {
    return stableError(
      "LIVE_MODEL_NOT_CONFIGURED",
      "真实模型尚未完成密钥与运行授权配置。",
      requestId,
      503,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return stableError(
      "LIVE_MODEL_INVALID_FORM",
      "请求必须包含一张候选图片和评估上下文。",
      requestId,
      400,
    );
  }

  const candidate = form.get("candidate");
  if (!(candidate instanceof File)) {
    return stableError(
      "LIVE_MODEL_IMAGE_REQUIRED",
      "请选择一张候选图片。",
      requestId,
      400,
    );
  }
  const references = form.getAll("references").filter(
    (item): item is File => item instanceof File && item.size > 0,
  );
  if (references.length > LOCAL_CANARY_MAX_REFERENCE_IMAGES) {
    return stableError(
      "LIVE_MODEL_TOO_MANY_REFERENCES",
      `历史参考图最多上传 ${LOCAL_CANARY_MAX_REFERENCE_IMAGES} 张。`,
      requestId,
      413,
    );
  }
  if (references.some((file) =>
    !allowedMimeTypes.has(file.type) || file.size > LOCAL_CANARY_MAX_IMAGE_BYTES
  )) {
    return stableError(
      "LIVE_MODEL_REFERENCE_INVALID",
      "历史参考图仅支持 10 MB 以内的 JPG、PNG 和 WebP。",
      requestId,
      415,
    );
  }
  if (
    !allowedMimeTypes.has(candidate.type) ||
    candidate.size <= 0 ||
    candidate.size > LOCAL_CANARY_MAX_IMAGE_BYTES
  ) {
    return stableError(
      candidate.size > LOCAL_CANARY_MAX_IMAGE_BYTES
        ? "LIVE_MODEL_IMAGE_TOO_LARGE"
        : "LIVE_MODEL_UNSUPPORTED_MEDIA",
      candidate.size > LOCAL_CANARY_MAX_IMAGE_BYTES
        ? "图片超过真实模型服务的 10 MB 限制。"
        : "真实模型服务仅支持 JPG、PNG 和 WebP。",
      requestId,
      candidate.size > LOCAL_CANARY_MAX_IMAGE_BYTES ? 413 : 415,
    );
  }
  if (form.get("consent") !== "confirmed") {
    return stableError(
      "LIVE_MODEL_CONSENT_REQUIRED",
      "必须确认当前图片可发送至阿里云百炼。",
      requestId,
      400,
    );
  }

  const channel = text(form.get("channel"), 80) || "未提供";
  const placement = text(form.get("placement"), 80) || "未提供";
  const referenceStatus = text(form.get("referenceStatus"), 20);
  const provenanceStatus = text(form.get("provenanceStatus"), 20);
  const templateId = text(form.get("commercialTemplateId"), 40);
  const customerProfile = parseCustomerProfile(form.get("customerProfile"));
  const profileSummary = [
    `风格：${customerProfile.styles.join("、") || "未提供"}`,
    `定价：${customerProfile.priceMin || "未提供"} 至 ${customerProfile.priceMax || "未提供"} 元`,
    `目标人群：${customerProfile.audiences.join("、") || "未提供"}`,
    `SKU 链接：${customerProfile.skuLinks.join("；") || "未提供"}`,
  ].join("。 ");
  const missingContext = [
    ...(referenceStatus === "complete"
      ? []
      : ["商品参考图未进入模型上下文", "SKU/参考声明"]),
    ...(provenanceStatus === "known" ? [] : ["AI 来源"]),
  ];

  try {
    const bytes = await candidate.arrayBuffer();
    const referenceInputs = await Promise.all(
      references.map(async (reference) => {
        const referenceBytes = await reference.arrayBuffer();
        return {
          role: "reference" as const,
          mimeType: reference.type as "image/jpeg" | "image/png" | "image/webp",
          url: `data:${reference.type};base64,${arrayBufferToBase64(referenceBytes)}`,
        };
      }),
    );
    const sha256 = await sha256Hex(bytes);
    const adapter = createLocalCanaryQwenAdapter(process.env);
    const outcome = await orchestrateVisionEvaluation(
      adapter,
      {
        requestId,
        runId: `live_${requestId}`,
        assetId: `candidate_${sha256.slice(0, 16)}`,
        scene: "服饰电商 AI 模特商品图质检",
        placement: `${channel} / ${placement}`,
        candidate: {
          role: "candidate",
          mimeType: candidate.type as "image/jpeg" | "image/png" | "image/webp",
          url: `data:${candidate.type};base64,${arrayBufferToBase64(bytes)}`,
        },
        references: referenceInputs,
        lockedAttributes: ["商品款式", "颜色", "Logo", "面料纹理"],
        taxonomyVersion: "visionqa-taxonomy-0.3.0",
        commercialTemplate: (() => {
          const template = resolveCommercialTemplate(templateId, channel, placement);
          return {
            ...template,
            assessmentScope: `${template.assessmentScope} 客户画像：${profileSummary}。参考图共 ${referenceInputs.length} 张；第一张图片是候选图，其余图片是客户历史优秀参考，只用于风格、材质与商业表达一致性比较。SKU 链接仅作为文本上下文，不代表已抓取远程图片。`,
          };
        })(),
        promptVersion: "vision-observer-0.3.0-calibrated",
      },
      request.signal,
      { maxAttempts: 2, attemptTimeoutMs: 45_000 },
    );
    const result = applyContextGate(outcome.result, missingContext);
    const validation = validateEvaluationResultV03(result);
    if (!validation.valid) {
      return stableError(
        "LIVE_MODEL_RESULT_INVALID",
        "真实模型结果未通过本地规则校验，本次结果已丢弃。",
        requestId,
        502,
      );
    }

    return Response.json(
      {
        evaluation_id: `live_${crypto.randomUUID()}`,
        result_version: 1,
        result,
        overrides: [],
        provider: outcome.provider,
        candidate: {
          trace_id: `live_${sha256.slice(0, 16)}`,
          sha256,
          name: candidate.name.slice(0, 160),
          size: candidate.size,
          mime_type: candidate.type,
        },
        persistence: "NONE",
        request_id: requestId,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof VisionProviderError) {
      return providerErrorResponse(error, requestId);
    }
    return stableError(
      "LIVE_MODEL_FAILED",
      "真实模型分析失败，本次没有形成结果。",
      requestId,
      500,
      true,
    );
  }
}
