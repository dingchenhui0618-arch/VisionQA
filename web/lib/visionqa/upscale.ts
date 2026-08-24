export const VISIONQA_UPSCALE_JOB_SCHEMA_VERSION =
  "visionqa-upscale-job-v0.1" as const;

export const UHD_4K_LONG_EDGE = 3840;

export type UpscaleExecutionMode =
  | "LOCAL_HIGH_QUALITY_RESAMPLE"
  | "AI_SUPER_RESOLUTION";

export type UpscaleDimensions = {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  scale: number;
  alreadyAtTarget: boolean;
};

export type LocalUpscaleResult = {
  blob: Blob;
  dimensions: UpscaleDimensions;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  durationMs: number;
  detailReconstruction: false;
};

export type UpscaleJobReceipt = {
  schemaVersion: typeof VISIONQA_UPSCALE_JOB_SCHEMA_VERSION;
  sourceName: string;
  sourceBytes: number;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  executionMode: UpscaleExecutionMode;
  providerId: string;
  detailReconstruction: boolean;
  externalTransmission: boolean;
  humanFinalReviewRequired: true;
  createdAt: string;
};

export const LOCAL_UPSCALE_CAPABILITY = {
  providerId: "visionqa-browser-resample-v0.1",
  executionMode: "LOCAL_HIGH_QUALITY_RESAMPLE" as const,
  configured: true,
  externalTransmission: false,
  detailReconstruction: false,
  label: "本机 4K 尺寸交付",
  boundary:
    "使用浏览器高质量分级重采样生成 4K 像素尺寸，不会凭空重建原图不存在的纹理细节。",
};

export const AI_SUPER_RESOLUTION_CAPABILITY = {
  providerId: "visionqa-ai-super-resolution-adapter-v0.1",
  executionMode: "AI_SUPER_RESOLUTION" as const,
  configured: false,
  externalTransmission: true,
  detailReconstruction: true,
  label: "AI 细节重建超分",
  boundary:
    "当前未配置本地 Real-ESRGAN 或外部超分 API。启用前需要确认 Provider、API Key、费用和图片发送范围。",
};

export function calculate4kDeliveryDimensions(
  sourceWidth: number,
  sourceHeight: number,
): UpscaleDimensions {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    throw new Error("Source image dimensions must be positive numbers.");
  }
  const longEdge = Math.max(sourceWidth, sourceHeight);
  const alreadyAtTarget = longEdge >= UHD_4K_LONG_EDGE;
  const scale = alreadyAtTarget ? 1 : UHD_4K_LONG_EDGE / longEdge;
  return {
    sourceWidth,
    sourceHeight,
    targetWidth: Math.max(1, Math.round(sourceWidth * scale)),
    targetHeight: Math.max(1, Math.round(sourceHeight * scale)),
    scale,
    alreadyAtTarget,
  };
}

export function createUpscaleFileName(
  sourceName: string,
  dimensions: Pick<UpscaleDimensions, "targetWidth" | "targetHeight">,
  mimeType: LocalUpscaleResult["mimeType"] = "image/jpeg",
): string {
  const baseName = sourceName.replace(/\.[^.]+$/, "") || "visionqa-output";
  const extension =
    mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return `${baseName}-${dimensions.targetWidth}x${dimensions.targetHeight}.${extension}`;
}

export function createUpscaleJobReceipt(input: {
  sourceName: string;
  sourceBytes: number;
  dimensions: UpscaleDimensions;
  executionMode?: UpscaleExecutionMode;
  providerId?: string;
  detailReconstruction?: boolean;
  externalTransmission?: boolean;
  now?: string;
}): UpscaleJobReceipt {
  const executionMode =
    input.executionMode ?? LOCAL_UPSCALE_CAPABILITY.executionMode;
  return {
    schemaVersion: VISIONQA_UPSCALE_JOB_SCHEMA_VERSION,
    sourceName: input.sourceName,
    sourceBytes: input.sourceBytes,
    sourceWidth: input.dimensions.sourceWidth,
    sourceHeight: input.dimensions.sourceHeight,
    targetWidth: input.dimensions.targetWidth,
    targetHeight: input.dimensions.targetHeight,
    executionMode,
    providerId:
      input.providerId ??
      (executionMode === "LOCAL_HIGH_QUALITY_RESAMPLE"
        ? LOCAL_UPSCALE_CAPABILITY.providerId
        : AI_SUPER_RESOLUTION_CAPABILITY.providerId),
    detailReconstruction:
      input.detailReconstruction ?? executionMode === "AI_SUPER_RESOLUTION",
    externalTransmission:
      input.externalTransmission ?? executionMode === "AI_SUPER_RESOLUTION",
    humanFinalReviewRequired: true,
    createdAt: input.now ?? new Date().toISOString(),
  };
}

export async function inspectImageFile(file: File): Promise<{
  width: number;
  height: number;
}> {
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export async function createLocal4kDelivery(
  file: File,
  options: {
    mimeType?: LocalUpscaleResult["mimeType"];
    quality?: number;
  } = {},
): Promise<LocalUpscaleResult> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    throw new Error("当前浏览器不支持本机 4K 图像处理。");
  }
  const startedAt = performance.now();
  const bitmap = await createImageBitmap(file);
  try {
    const dimensions = calculate4kDeliveryDimensions(bitmap.width, bitmap.height);
    const mimeType = options.mimeType ?? "image/jpeg";
    const quality = Math.min(1, Math.max(0.7, options.quality ?? 0.94));
    let source: CanvasImageSource = bitmap;
    let currentWidth = bitmap.width;
    let currentHeight = bitmap.height;
    let currentCanvas: HTMLCanvasElement | null = null;

    while (
      currentWidth < dimensions.targetWidth ||
      currentHeight < dimensions.targetHeight
    ) {
      const nextScale = Math.min(
        2,
        dimensions.targetWidth / currentWidth,
        dimensions.targetHeight / currentHeight,
      );
      const nextWidth = Math.min(
        dimensions.targetWidth,
        Math.max(currentWidth + 1, Math.round(currentWidth * nextScale)),
      );
      const nextHeight = Math.min(
        dimensions.targetHeight,
        Math.max(currentHeight + 1, Math.round(currentHeight * nextScale)),
      );
      const canvas = document.createElement("canvas");
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      const context = canvas.getContext("2d", { alpha: mimeType !== "image/jpeg" });
      if (!context) throw new Error("浏览器无法建立 4K 图像画布。");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      if (mimeType === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, nextWidth, nextHeight);
      }
      context.drawImage(source, 0, 0, nextWidth, nextHeight);
      source = canvas;
      currentCanvas = canvas;
      currentWidth = nextWidth;
      currentHeight = nextHeight;
    }

    if (!currentCanvas) {
      currentCanvas = document.createElement("canvas");
      currentCanvas.width = dimensions.targetWidth;
      currentCanvas.height = dimensions.targetHeight;
      const context = currentCanvas.getContext("2d", {
        alpha: mimeType !== "image/jpeg",
      });
      if (!context) throw new Error("浏览器无法建立交付图像画布。");
      if (mimeType === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, currentCanvas.width, currentCanvas.height);
      }
      context.drawImage(bitmap, 0, 0, currentCanvas.width, currentCanvas.height);
    }

    const blob = await canvasToBlob(currentCanvas, mimeType, quality);
    if (!blob) throw new Error("浏览器未能生成 4K 交付文件。");
    return {
      blob,
      dimensions,
      mimeType,
      durationMs: Math.round(performance.now() - startedAt),
      detailReconstruction: false,
    };
  } finally {
    bitmap.close();
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: LocalUpscaleResult["mimeType"],
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
