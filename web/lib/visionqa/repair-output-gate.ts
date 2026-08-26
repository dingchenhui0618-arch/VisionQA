export const REPAIR_OUTPUT_GATE_VERSION = "repair-output-gate-v0.1" as const;

export type RepairOutputGateMetrics = {
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  aspectRatioDrift: number;
  meanPixelDifference: number;
  changedCellRatio: number;
};

export type RepairOutputGateResult = {
  version: typeof REPAIR_OUTPUT_GATE_VERSION;
  decision: "ALLOW_HUMAN_REVIEW" | "BLOCK_MAJOR_DRIFT";
  failureCodes: Array<
    | "OUTPUT_ASPECT_RATIO_DRIFT"
    | "OUTPUT_COMPOSITION_DRIFT"
  >;
  summary: string;
  metrics: RepairOutputGateMetrics;
};

const ASPECT_RATIO_DRIFT_LIMIT = 0.04;
const MEAN_PIXEL_DIFFERENCE_LIMIT = 0.18;
const CHANGED_CELL_RATIO_LIMIT = 0.55;

export function assessRepairOutputMetrics(
  metrics: RepairOutputGateMetrics,
): RepairOutputGateResult {
  const failureCodes: RepairOutputGateResult["failureCodes"] = [];
  if (metrics.aspectRatioDrift > ASPECT_RATIO_DRIFT_LIMIT) {
    failureCodes.push("OUTPUT_ASPECT_RATIO_DRIFT");
  }
  if (
    metrics.meanPixelDifference > MEAN_PIXEL_DIFFERENCE_LIMIT ||
    metrics.changedCellRatio > CHANGED_CELL_RATIO_LIMIT
  ) {
    failureCodes.push("OUTPUT_COMPOSITION_DRIFT");
  }
  const blocked = failureCodes.length > 0;
  return {
    version: REPAIR_OUTPUT_GATE_VERSION,
    decision: blocked ? "BLOCK_MAJOR_DRIFT" : "ALLOW_HUMAN_REVIEW",
    failureCodes,
    summary: blocked
      ? "候选图与原始模特母版的画幅或整体构图差异过大，疑似重生成而非局部修正。"
      : "候选图未触发本机大幅构图漂移 Gate，仍需人工逐项复审。",
    metrics,
  };
}

async function imageFingerprint(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 36;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("无法建立本机构图指纹。 ");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return {
      width: bitmap.width,
      height: bitmap.height,
      pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
    };
  } finally {
    bitmap.close();
  }
}

export async function validateRepairOutputFiles(
  source: File,
  output: File,
): Promise<RepairOutputGateResult> {
  const [sourceImage, outputImage] = await Promise.all([
    imageFingerprint(source),
    imageFingerprint(output),
  ]);
  let totalDifference = 0;
  let changedCells = 0;
  const cellCount = sourceImage.pixels.length / 4;
  for (let offset = 0; offset < sourceImage.pixels.length; offset += 4) {
    const difference =
      (Math.abs(sourceImage.pixels[offset] - outputImage.pixels[offset]) +
        Math.abs(sourceImage.pixels[offset + 1] - outputImage.pixels[offset + 1]) +
        Math.abs(sourceImage.pixels[offset + 2] - outputImage.pixels[offset + 2])) /
      (255 * 3);
    totalDifference += difference;
    if (difference > 0.22) changedCells += 1;
  }
  const sourceAspect = sourceImage.width / sourceImage.height;
  const outputAspect = outputImage.width / outputImage.height;
  return assessRepairOutputMetrics({
    sourceWidth: sourceImage.width,
    sourceHeight: sourceImage.height,
    outputWidth: outputImage.width,
    outputHeight: outputImage.height,
    aspectRatioDrift: Math.abs(sourceAspect - outputAspect) / sourceAspect,
    meanPixelDifference: totalDifference / cellCount,
    changedCellRatio: changedCells / cellCount,
  });
}
