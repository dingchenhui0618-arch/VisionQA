export const QWEN_IMAGE_3_PROVIDER_ID = "aliyun-bailian-qwen-image-3-beijing" as const;
export const QWEN_IMAGE_3_MODEL = "qwen-image-3.0-pro" as const;
export const QWEN_IMAGE_3_API_KEY_ENV = "VISION_REPAIR_QWEN_IMAGE_3_API_KEY" as const;
export const QWEN_IMAGE_3_WORKSPACE_ENV = "VISION_REPAIR_QWEN_IMAGE_3_WORKSPACE_ID" as const;
export const QWEN_IMAGE_3_PROVIDER_APPROVED_ENV = "VISION_REPAIR_QWEN_IMAGE_3_APPROVED" as const;
export const QWEN_IMAGE_3_PAID_CALLS_APPROVED_ENV = "VISION_REPAIR_QWEN_IMAGE_3_PAID_CALLS_APPROVED" as const;
export const QWEN_IMAGE_3_DATA_SCOPE_ENV = "VISION_REPAIR_QWEN_IMAGE_3_DATA_SCOPE" as const;
export const QWEN_IMAGE_3_MODEL_ENV = "VISION_REPAIR_QWEN_IMAGE_3_MODEL" as const;
export const QWEN_IMAGE_3_DATA_SCOPE = "MODEL_DRAFT_AND_PRODUCT_REFERENCES" as const;
export const QWEN_IMAGE_3_NEGATIVE_PROMPT_MAX_CHARS = 500;
export const QWEN_IMAGE_3_MAX_REFERENCES = 2;
export const QWEN_IMAGE_3_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const QWEN_IMAGE_3_MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
export const QWEN_IMAGE_3_MAX_OUTPUT_PIXELS = 2048 * 2048;

type Environment = Record<string, string | undefined>;
type FetchLike = typeof fetch;

type ImageInput = {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

export type QwenImage3EditInput = {
  source: ImageInput;
  references: ImageInput[];
  prompt: string;
  negativePrompt: string;
  sourceWidth: number;
  sourceHeight: number;
  signal?: AbortSignal;
};

export type QwenImage3OutputSize = {
  width: number;
  height: number;
  value: string;
};

export type QwenImage3EditResult = {
  providerId: typeof QWEN_IMAGE_3_PROVIDER_ID;
  modelSnapshot: typeof QWEN_IMAGE_3_MODEL;
  providerRequestId: string;
  outputBytes: Uint8Array;
  outputMimeType: "image/png" | "image/jpeg" | "image/webp";
  imageCount: number | null;
  outputWidth: number | null;
  outputHeight: number | null;
  outputSize: QwenImage3OutputSize;
};

export type QwenImage3Readiness = {
  apiKeyConfigured: boolean;
  workspaceConfigured: boolean;
  providerApproved: boolean;
  paidCallsApproved: boolean;
  dataScopeApproved: boolean;
  modelSnapshotLocked: boolean;
  liveReady: boolean;
  blockers: string[];
};

export class QwenImage3ProviderError extends Error {
  readonly code:
    | "CONFIGURATION"
    | "INVALID_INPUT"
    | "AUTHENTICATION"
    | "RATE_LIMITED"
    | "QUOTA"
    | "NETWORK"
    | "INVALID_OUTPUT"
    | "OUTPUT_FETCH";

  constructor(
    code: QwenImage3ProviderError["code"],
    message: string,
  ) {
    super(message);
    this.name = "QwenImage3ProviderError";
    this.code = code;
  }
}

function isWorkspaceId(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9-]{4,128}$/.test(value));
}

function endpointForWorkspace(workspaceId: string): string {
  return `https://${workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`;
}

function fromDedicatedOrGeneric(
  env: Environment,
  dedicated: string,
  generic: string,
): string | undefined {
  return env[dedicated] ?? env[generic];
}

/**
 * This checks configuration only. It intentionally takes no image input and
 * can therefore be called before a route parses FormData or reads image bytes.
 * The dedicated Image 3 variables take precedence; the established generic
 * Qwen approval variables remain a valid authorized configuration source.
 */
export function getQwenImage3Readiness(
  env: Environment,
): QwenImage3Readiness {
  const apiKeyConfigured = Boolean(
    fromDedicatedOrGeneric(env, QWEN_IMAGE_3_API_KEY_ENV, "VISION_REPAIR_QWEN_API_KEY")?.trim(),
  );
  const workspaceConfigured = isWorkspaceId(
    fromDedicatedOrGeneric(env, QWEN_IMAGE_3_WORKSPACE_ENV, "VISION_REPAIR_QWEN_WORKSPACE_ID")?.trim(),
  );
  const providerApproved =
    fromDedicatedOrGeneric(env, QWEN_IMAGE_3_PROVIDER_APPROVED_ENV, "VISION_REPAIR_QWEN_APPROVED") === "true";
  const paidCallsApproved =
    fromDedicatedOrGeneric(env, QWEN_IMAGE_3_PAID_CALLS_APPROVED_ENV, "VISION_REPAIR_QWEN_PAID_CALLS_APPROVED") === "true";
  const dataScopeApproved =
    fromDedicatedOrGeneric(env, QWEN_IMAGE_3_DATA_SCOPE_ENV, "VISION_REPAIR_QWEN_DATA_SCOPE") === QWEN_IMAGE_3_DATA_SCOPE;
  const modelSnapshotLocked =
    fromDedicatedOrGeneric(env, QWEN_IMAGE_3_MODEL_ENV, "VISION_REPAIR_QWEN_MODEL") === QWEN_IMAGE_3_MODEL;
  const blockers: string[] = [];
  if (!apiKeyConfigured) blockers.push("API_KEY_NOT_CONFIGURED");
  if (!workspaceConfigured) blockers.push("WORKSPACE_NOT_CONFIGURED");
  if (!providerApproved) blockers.push("PROVIDER_APPROVAL_REQUIRED");
  if (!paidCallsApproved) blockers.push("PAID_CALL_APPROVAL_REQUIRED");
  if (!dataScopeApproved) blockers.push("DATA_SCOPE_NOT_APPROVED");
  if (!modelSnapshotLocked) blockers.push("MODEL_SNAPSHOT_NOT_LOCKED");
  return {
    apiKeyConfigured,
    workspaceConfigured,
    providerApproved,
    paidCallsApproved,
    dataScopeApproved,
    modelSnapshotLocked,
    liveReady: blockers.length === 0,
    blockers,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function validImage(input: ImageInput): boolean {
  return input.bytes.byteLength > 0 && input.bytes.byteLength <= QWEN_IMAGE_3_MAX_IMAGE_BYTES;
}

function bytesToDataUrl(input: ImageInput): string {
  let binary = "";
  for (let offset = 0; offset < input.bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...input.bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${input.mimeType};base64,${btoa(binary)}`;
}

/**
 * Qwen Image 3 supports a total output pixel budget up to 2048*2048. The
 * result retains the candidate image aspect ratio, including when a 4K source
 * is supplied, rather than requesting an unsupported 4K edit.
 */
export function calculateQwenImage3OutputSize(
  sourceWidth: number,
  sourceHeight: number,
): QwenImage3OutputSize {
  if (
    !Number.isInteger(sourceWidth) ||
    !Number.isInteger(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    throw new QwenImage3ProviderError(
      "INVALID_INPUT",
      "待修主图尺寸必须是有效的正整数。",
    );
  }
  const ratio = sourceWidth / sourceHeight;
  if (ratio < 1 / 8 || ratio > 8) {
    throw new QwenImage3ProviderError(
      "INVALID_INPUT",
      "待修主图宽高比超出 Qwen Image 3 的 1:8 至 8:1 范围。",
    );
  }
  const scale = Math.sqrt(
    QWEN_IMAGE_3_MAX_OUTPUT_PIXELS / (sourceWidth * sourceHeight),
  );
  const width = Math.max(1, Math.floor(sourceWidth * scale));
  const height = Math.max(1, Math.floor(sourceHeight * scale));
  return { width, height, value: `${width}*${height}` };
}

function classifyHttpFailure(status: number): QwenImage3ProviderError {
  if (status === 401 || status === 403) {
    return new QwenImage3ProviderError("AUTHENTICATION", "千问图像 3 鉴权失败。");
  }
  if (status === 402) {
    return new QwenImage3ProviderError("QUOTA", "千问图像 3 额度不足。");
  }
  if (status === 429) {
    return new QwenImage3ProviderError("RATE_LIMITED", "千问图像 3 达到限流，需人工重新确认后提交。");
  }
  return new QwenImage3ProviderError("NETWORK", "千问图像 3 服务暂时不可用。");
}

function classifyBusinessFailure(code: string): QwenImage3ProviderError {
  const normalized = code.toLowerCase();
  if (normalized.includes("apikey") || normalized.includes("auth") || normalized.includes("permission")) {
    return new QwenImage3ProviderError("AUTHENTICATION", "千问图像 3 返回鉴权或权限错误。");
  }
  if (normalized.includes("throttl") || normalized.includes("ratelimit")) {
    return new QwenImage3ProviderError("RATE_LIMITED", "千问图像 3 返回限流错误，需人工重新确认后提交。");
  }
  if (normalized.includes("quota") || normalized.includes("balance")) {
    return new QwenImage3ProviderError("QUOTA", "千问图像 3 返回额度错误。");
  }
  return new QwenImage3ProviderError("INVALID_OUTPUT", "千问图像 3 返回业务错误。");
}

function outputImageUrl(body: Record<string, unknown>): string {
  const output = asRecord(body.output);
  const choices = Array.isArray(output.choices) ? output.choices : [];
  const message = asRecord(asRecord(choices[0]).message);
  const content = Array.isArray(message.content) ? message.content : [];
  const image = content
    .map(asRecord)
    .find((item) => typeof item.image === "string")?.image;
  if (typeof image !== "string") {
    throw new QwenImage3ProviderError("INVALID_OUTPUT", "千问图像 3 未返回可下载的候选图。");
  }
  let url: URL;
  try {
    url = new URL(image);
  } catch {
    throw new QwenImage3ProviderError("INVALID_OUTPUT", "千问图像 3 返回了无效的图片地址。");
  }
  if (
    url.protocol !== "https:" ||
    !(url.hostname === "aliyuncs.com" || url.hostname.endsWith(".aliyuncs.com"))
  ) {
    throw new QwenImage3ProviderError("INVALID_OUTPUT", "千问图像 3 返回了未获准的图片地址。");
  }
  return url.toString();
}

function outputUsage(body: Record<string, unknown>) {
  const usage = asRecord(body.usage);
  return {
    imageCount:
      typeof usage.output_image_count === "number"
        ? usage.output_image_count
        : null,
    width: typeof usage.output_width === "number" ? usage.output_width : null,
    height: typeof usage.output_height === "number" ? usage.output_height : null,
  };
}

export class QwenImage3Provider {
  readonly providerId = QWEN_IMAGE_3_PROVIDER_ID;
  readonly modelSnapshot = QWEN_IMAGE_3_MODEL;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(apiKey: string, workspaceId: string, fetchImpl: FetchLike = fetch) {
    if (!apiKey.trim() || !isWorkspaceId(workspaceId)) {
      throw new QwenImage3ProviderError("CONFIGURATION", "千问图像 3 配置不完整。");
    }
    this.apiKey = apiKey;
    this.endpoint = endpointForWorkspace(workspaceId);
    this.fetchImpl = fetchImpl;
  }

  async edit(input: QwenImage3EditInput): Promise<QwenImage3EditResult> {
    if (
      !input.prompt.trim() ||
      input.prompt.length > 5_000 ||
      !input.negativePrompt.trim() ||
      input.negativePrompt.length > QWEN_IMAGE_3_NEGATIVE_PROMPT_MAX_CHARS ||
      !validImage(input.source) ||
      input.references.length > QWEN_IMAGE_3_MAX_REFERENCES ||
      input.references.some((reference) => !validImage(reference))
    ) {
      throw new QwenImage3ProviderError("INVALID_INPUT", "千问图像 3 输入图片或提示词超出受控范围。");
    }
    const outputSize = calculateQwenImage3OutputSize(
      input.sourceWidth,
      input.sourceHeight,
    );
    const content: Array<{ image: string } | { text: string }> = [
      { image: bytesToDataUrl(input.source) },
      ...input.references.map((reference) => ({ image: bytesToDataUrl(reference) })),
      {
        text:
          "图1是唯一待修的AI模特或商品候选主图，也是唯一的构图、画幅和人物身份依据。" +
          "后续图片仅作为商品真值参考，用于核对颜色、版型、口袋、图案、Logo与材质；禁止采用参考图的背景、裁切、镜头或人物。" +
          "只能执行以下局部修正，保持人物、姿势、手脚、背景、相机机位、景别、构图、画幅、非目标服装结构和非目标纹理不变；不得添加促销信息、价格、折扣、品牌文字或未提供的细节。" +
          `具体局部任务：${input.prompt}`,
      },
    ];

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: QWEN_IMAGE_3_MODEL,
          input: { messages: [{ role: "user", content }] },
          parameters: {
            size: outputSize.value,
            n: 1,
            prompt_extend: false,
            watermark: false,
            negative_prompt: input.negativePrompt,
          },
        }),
        signal: input.signal,
      });
    } catch {
      throw new QwenImage3ProviderError("NETWORK", "千问图像 3 请求失败；不会自动重试。");
    }
    if (!response.ok) throw classifyHttpFailure(response.status);

    const body = asRecord(await response.json().catch(() => null));
    if (typeof body.code === "string") throw classifyBusinessFailure(body.code);
    const providerRequestId = typeof body.request_id === "string" ? body.request_id : "";
    if (!providerRequestId) {
      throw new QwenImage3ProviderError("INVALID_OUTPUT", "千问图像 3 结果缺少请求标识。");
    }
    const url = outputImageUrl(body);
    const usage = outputUsage(body);

    let outputResponse: Response;
    try {
      outputResponse = await this.fetchImpl(url, {
        method: "GET",
        redirect: "error",
        signal: input.signal,
      });
    } catch {
      throw new QwenImage3ProviderError("OUTPUT_FETCH", "千问图像 3 候选图下载失败。");
    }
    if (!outputResponse.ok) {
      throw new QwenImage3ProviderError("OUTPUT_FETCH", "千问图像 3 候选图临时地址不可用。");
    }
    const mimeType = outputResponse.headers.get("content-type")?.split(";")[0];
    if (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/webp") {
      throw new QwenImage3ProviderError("INVALID_OUTPUT", "千问图像 3 候选图返回了不支持的格式。");
    }
    const outputBytes = new Uint8Array(await outputResponse.arrayBuffer());
    if (outputBytes.byteLength === 0 || outputBytes.byteLength > QWEN_IMAGE_3_MAX_OUTPUT_BYTES) {
      throw new QwenImage3ProviderError("INVALID_OUTPUT", "千问图像 3 候选图为空或超过保存上限。");
    }
    return {
      providerId: QWEN_IMAGE_3_PROVIDER_ID,
      modelSnapshot: QWEN_IMAGE_3_MODEL,
      providerRequestId,
      outputBytes,
      outputMimeType: mimeType,
      imageCount: usage.imageCount,
      outputWidth: usage.width,
      outputHeight: usage.height,
      outputSize,
    };
  }
}

/**
 * Deliberately has no process.env default: a caller must explicitly choose this
 * experimental provider and pass the environment it is authorized to use.
 */
export function createQwenImage3Provider(
  env: Environment,
  fetchImpl: FetchLike = fetch,
): QwenImage3Provider {
  const readiness = getQwenImage3Readiness(env);
  if (!readiness.liveReady) {
    throw new QwenImage3ProviderError(
      "CONFIGURATION",
      `千问图像 3 尚未获准：${readiness.blockers.join(",")}`,
    );
  }
  return new QwenImage3Provider(
    fromDedicatedOrGeneric(env, QWEN_IMAGE_3_API_KEY_ENV, "VISION_REPAIR_QWEN_API_KEY") ?? "",
    fromDedicatedOrGeneric(env, QWEN_IMAGE_3_WORKSPACE_ENV, "VISION_REPAIR_QWEN_WORKSPACE_ID") ?? "",
    fetchImpl,
  );
}
