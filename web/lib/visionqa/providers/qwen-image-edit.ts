import {
  QWEN_IMAGE_EDIT_DATA_SCOPE,
  QWEN_IMAGE_EDIT_MODEL_SNAPSHOT,
  QWEN_IMAGE_EDIT_PROVIDER_ID,
  type RepairProviderCapability,
} from "../repair-provider-contract.ts";

export const QWEN_IMAGE_EDIT_API_KEY_ENV =
  "VISION_REPAIR_QWEN_API_KEY" as const;
export const QWEN_IMAGE_EDIT_WORKSPACE_ENV =
  "VISION_REPAIR_QWEN_WORKSPACE_ID" as const;
export const QWEN_IMAGE_EDIT_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
// Provider contract: one source image plus at most two product-truth images
// (three input images total).
export const QWEN_IMAGE_EDIT_MAX_REFERENCES = 2;
export const QWEN_IMAGE_EDIT_MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

type Environment = Record<string, string | undefined>;
type FetchLike = typeof fetch;

type ImageInput = {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

export type QwenImageEditInput = {
  source: ImageInput;
  references: ImageInput[];
  prompt: string;
  signal?: AbortSignal;
};

export type QwenImageEditResult = {
  providerId: typeof QWEN_IMAGE_EDIT_PROVIDER_ID;
  modelSnapshot: typeof QWEN_IMAGE_EDIT_MODEL_SNAPSHOT;
  providerRequestId: string;
  outputBytes: Uint8Array;
  outputMimeType: "image/png" | "image/jpeg" | "image/webp";
  imageCount: number;
  outputWidth: number | null;
  outputHeight: number | null;
};

export class QwenImageEditProviderError extends Error {
  readonly code:
    | "CONFIGURATION"
    | "INVALID_INPUT"
    | "AUTHENTICATION"
    | "RATE_LIMITED"
    | "QUOTA"
    | "NETWORK"
    | "INVALID_OUTPUT"
    | "OUTPUT_FETCH";
  readonly retryable: boolean;

  constructor(
    code:
      | "CONFIGURATION"
      | "INVALID_INPUT"
      | "AUTHENTICATION"
      | "RATE_LIMITED"
      | "QUOTA"
      | "NETWORK"
      | "INVALID_OUTPUT"
      | "OUTPUT_FETCH",
    message: string,
    retryable = false,
  ) {
    super(message);
    this.name = "QwenImageEditProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

function isWorkspaceId(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9-]{4,128}$/.test(value));
}

function endpointForWorkspace(workspaceId: string): string {
  return `https://${workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`;
}

export function getQwenImageEditReadiness(
  env: Environment = process.env,
): RepairProviderCapability {
  const apiKeyConfigured = Boolean(env[QWEN_IMAGE_EDIT_API_KEY_ENV]?.trim());
  const workspaceConfigured = isWorkspaceId(
    env[QWEN_IMAGE_EDIT_WORKSPACE_ENV]?.trim(),
  );
  const providerApproved = env.VISION_REPAIR_QWEN_APPROVED === "true";
  const paidCallsApproved =
    env.VISION_REPAIR_QWEN_PAID_CALLS_APPROVED === "true";
  const dataScopeApproved =
    env.VISION_REPAIR_QWEN_DATA_SCOPE === QWEN_IMAGE_EDIT_DATA_SCOPE;
  const modelSnapshotLocked =
    env.VISION_REPAIR_QWEN_MODEL === QWEN_IMAGE_EDIT_MODEL_SNAPSHOT;
  const blockers: string[] = [];
  if (!apiKeyConfigured) blockers.push("API_KEY_NOT_CONFIGURED");
  if (!workspaceConfigured) blockers.push("WORKSPACE_NOT_CONFIGURED");
  if (!providerApproved) blockers.push("PROVIDER_APPROVAL_REQUIRED");
  if (!paidCallsApproved) blockers.push("PAID_CALL_APPROVAL_REQUIRED");
  if (!dataScopeApproved) blockers.push("DATA_SCOPE_NOT_APPROVED");
  if (!modelSnapshotLocked) blockers.push("MODEL_SNAPSHOT_NOT_LOCKED");
  return {
    adapterReady: true,
    providerId: QWEN_IMAGE_EDIT_PROVIDER_ID,
    modelSnapshot: QWEN_IMAGE_EDIT_MODEL_SNAPSHOT,
    region: "cn-beijing",
    apiKeyConfigured,
    workspaceConfigured,
    providerApproved,
    paidCallsApproved,
    dataScopeApproved,
    modelSnapshotLocked,
    liveReady: blockers.length === 0,
    blockers,
    maxSourceBytes: QWEN_IMAGE_EDIT_MAX_SOURCE_BYTES,
    maxReferenceImages: QWEN_IMAGE_EDIT_MAX_REFERENCES,
    outputMaxDimension: 2048,
    outputPersistence: "BROWSER_PROJECT",
    humanFinalReviewRequired: true,
    autoPublishEnabled: false,
  };
}

function bytesToDataUrl(input: ImageInput): string {
  let binary = "";
  for (let offset = 0; offset < input.bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...input.bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${input.mimeType};base64,${btoa(binary)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function classifyProviderFailure(status: number): QwenImageEditProviderError {
  if (status === 401 || status === 403) {
    return new QwenImageEditProviderError(
      "AUTHENTICATION",
      "千问图像编辑鉴权失败。",
    );
  }
  if (status === 429) {
    return new QwenImageEditProviderError(
      "RATE_LIMITED",
      "千问图像编辑达到限流，请稍后人工重试。",
      true,
    );
  }
  if (status === 402) {
    return new QwenImageEditProviderError(
      "QUOTA",
      "千问图像编辑额度不足。",
    );
  }
  return new QwenImageEditProviderError(
    "NETWORK",
    "千问图像编辑服务暂时不可用。",
    status >= 500,
  );
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
    throw new QwenImageEditProviderError(
      "INVALID_OUTPUT",
      "千问图像编辑没有返回可下载的候选图。",
    );
  }
  const url = new URL(image);
  if (
    url.protocol !== "https:" ||
    !(url.hostname === "aliyuncs.com" || url.hostname.endsWith(".aliyuncs.com"))
  ) {
    throw new QwenImageEditProviderError(
      "INVALID_OUTPUT",
      "千问图像编辑返回了未获准的图片地址。",
    );
  }
  return url.toString();
}

function outputUsage(body: Record<string, unknown>) {
  const usage = asRecord(body.usage);
  return {
    imageCount:
      typeof usage.image_count === "number" ? usage.image_count : 1,
    width: typeof usage.width === "number" ? usage.width : null,
    height: typeof usage.height === "number" ? usage.height : null,
  };
}

export class QwenImageEditProvider {
  readonly providerId = QWEN_IMAGE_EDIT_PROVIDER_ID;
  readonly modelSnapshot = QWEN_IMAGE_EDIT_MODEL_SNAPSHOT;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(
    apiKey: string,
    workspaceId: string,
    fetchImpl: FetchLike = fetch,
  ) {
    if (!apiKey.trim() || !isWorkspaceId(workspaceId)) {
      throw new QwenImageEditProviderError(
        "CONFIGURATION",
        "千问图像编辑配置不完整。",
      );
    }
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.endpoint = endpointForWorkspace(workspaceId);
  }

  async edit(input: QwenImageEditInput): Promise<QwenImageEditResult> {
    if (!input.prompt.trim() || input.prompt.length > 4_000) {
      throw new QwenImageEditProviderError(
        "INVALID_INPUT",
        "改图 Prompt 为空或超过当前受控长度。",
      );
    }
    if (
      input.source.bytes.byteLength === 0 ||
      input.source.bytes.byteLength > QWEN_IMAGE_EDIT_MAX_SOURCE_BYTES ||
      input.references.length > QWEN_IMAGE_EDIT_MAX_REFERENCES
    ) {
      throw new QwenImageEditProviderError(
        "INVALID_INPUT",
        "改图图片数量或大小超出当前受控范围。",
      );
    }

    // Qwen derives the output aspect ratio from the LAST input image. Product
    // truth references therefore come first and the model draft must be last;
    // otherwise a truth board can accidentally become the new composition.
    const sourceImageNumber = input.references.length + 1;
    const referenceImageNumbers = input.references
      .map((_, index) => `图${index + 1}`)
      .join("、");
    const content: Array<{ image: string } | { text: string }> = [
      ...input.references.map((reference) => ({ image: bytesToDataUrl(reference) })),
      { image: bytesToDataUrl(input.source) },
      {
        text:
          `${referenceImageNumbers || "前序图片"}仅是商品真值参考，只用于核对服装颜色、版型、口袋、图案、Logo与材质，禁止采用这些参考图的背景、裁切、镜头或商品摆放方式。` +
          `图${sourceImageNumber}是唯一需要编辑的AI模特母版，也是唯一的构图、画幅和人物身份依据。` +
          `输出必须保持图${sourceImageNumber}的同一位完整模特、面部、发型、姿势、手脚、白色上衣、背景、相机机位、景别、人物大小、画布比例和像素方向。` +
          `只能在诊断明确指出的服装局部做最小修改；除目标局部外，其余像素级视觉内容应尽量保持不变。` +
          `禁止改成服装白底图、商品特写、局部裁切、无人物图或重新摆拍；禁止放大裤子、移除人物、改变全身构图。` +
          `不得新增促销信息、价格、折扣、品牌文字或未提供的商品细节。具体局部任务：${input.prompt}`,
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
          model: QWEN_IMAGE_EDIT_MODEL_SNAPSHOT,
          input: { messages: [{ role: "user", content }] },
          parameters: {
            n: 1,
            negative_prompt:
              "服装白底图，商品特写，局部特写，裁切人物，移除人物，无人物，改变构图，改变景别，改变相机机位，改变人物大小，改变姿势，改变面部，改变发型，改变背景，商品颜色漂移，版型变化，图案变化，Logo错误，文字错误，多余手指，肢体变形，过度磨皮，过度锐化",
            prompt_extend: false,
            watermark: false,
          },
        }),
        signal: input.signal,
      });
    } catch (error) {
      if (error instanceof QwenImageEditProviderError) throw error;
      throw new QwenImageEditProviderError(
        "NETWORK",
        "千问图像编辑请求失败。",
        true,
      );
    }
    if (!response.ok) throw classifyProviderFailure(response.status);

    const body = asRecord(await response.json().catch(() => null));
    if (typeof body.code === "string") {
      throw new QwenImageEditProviderError(
        body.code === "InvalidApiKey" ? "AUTHENTICATION" : "INVALID_OUTPUT",
        "千问图像编辑返回业务错误。",
      );
    }
    const providerRequestId =
      typeof body.request_id === "string" ? body.request_id : "";
    if (!providerRequestId) {
      throw new QwenImageEditProviderError(
        "INVALID_OUTPUT",
        "千问图像编辑结果缺少请求标识。",
      );
    }
    const outputUrl = outputImageUrl(body);
    const usage = outputUsage(body);

    let outputResponse: Response;
    try {
      outputResponse = await this.fetchImpl(outputUrl, {
        method: "GET",
        redirect: "error",
        signal: input.signal,
      });
    } catch {
      throw new QwenImageEditProviderError(
        "OUTPUT_FETCH",
        "千问候选图临时地址下载失败。",
        true,
      );
    }
    if (!outputResponse.ok) {
      throw new QwenImageEditProviderError(
        "OUTPUT_FETCH",
        "千问候选图临时地址不可用。",
        outputResponse.status >= 500,
      );
    }
    const mimeType = outputResponse.headers.get("content-type")?.split(";")[0];
    if (
      mimeType !== "image/png" &&
      mimeType !== "image/jpeg" &&
      mimeType !== "image/webp"
    ) {
      throw new QwenImageEditProviderError(
        "INVALID_OUTPUT",
        "千问候选图返回了不支持的文件格式。",
      );
    }
    const outputBytes = new Uint8Array(await outputResponse.arrayBuffer());
    if (
      outputBytes.byteLength === 0 ||
      outputBytes.byteLength > QWEN_IMAGE_EDIT_MAX_OUTPUT_BYTES
    ) {
      throw new QwenImageEditProviderError(
        "INVALID_OUTPUT",
        "千问候选图文件为空或超过当前保存上限。",
      );
    }
    return {
      providerId: QWEN_IMAGE_EDIT_PROVIDER_ID,
      modelSnapshot: QWEN_IMAGE_EDIT_MODEL_SNAPSHOT,
      providerRequestId,
      outputBytes,
      outputMimeType: mimeType,
      imageCount: usage.imageCount,
      outputWidth: usage.width,
      outputHeight: usage.height,
    };
  }
}

export function createGovernedQwenImageEditProvider(
  env: Environment = process.env,
  fetchImpl: FetchLike = fetch,
): QwenImageEditProvider {
  const readiness = getQwenImageEditReadiness(env);
  if (!readiness.liveReady) {
    throw new QwenImageEditProviderError(
      "CONFIGURATION",
      `千问图像编辑尚未获准：${readiness.blockers.join(",")}`,
    );
  }
  return new QwenImageEditProvider(
    env[QWEN_IMAGE_EDIT_API_KEY_ENV]!,
    env[QWEN_IMAGE_EDIT_WORKSPACE_ENV]!,
    fetchImpl,
  );
}
