export const CUSTOMER_REPAIR_GATE_VERSION = "customer-basic-gate-v0.1" as const;

export type ServerRepairGateInput = {
  source: { mimeType: string; bytes: Uint8Array; width: number; height: number };
  output: { mimeType: string; bytes: Uint8Array; reportedWidth: number | null; reportedHeight: number | null };
  issueRegion: { x: number; y: number; width: number; height: number } | null;
  lockedRegions: Array<{ x: number; y: number; width: number; height: number }>;
};

export type ServerRepairGateResult = {
  passed: boolean;
  version: typeof CUSTOMER_REPAIR_GATE_VERSION;
  checks: {
    decodable: boolean;
    dimensionsValid: boolean;
    aspectRatioStable: boolean;
    pixelCountStable: boolean;
    targetRegionRecorded: boolean;
    lockedRegionsRecorded: boolean;
  };
  sourceDimensions: { width: number; height: number };
  outputDimensions: { width: number; height: number } | null;
  reason: string;
};

export function runServerRepairGate(input: ServerRepairGateInput): ServerRepairGateResult {
  const parsed = parseImageDimensions(input.output.bytes, input.output.mimeType);
  const outputDimensions = parsed ?? (
    validDimension(input.output.reportedWidth) && validDimension(input.output.reportedHeight)
      ? { width: input.output.reportedWidth!, height: input.output.reportedHeight! }
      : null
  );
  const sourceDimensions = { width: input.source.width, height: input.source.height };
  const decodable = Boolean(parsed) && input.output.bytes.byteLength > 64;
  const dimensionsValid = Boolean(outputDimensions && outputDimensions.width >= 64 && outputDimensions.height >= 64);
  const sourceAspect = sourceDimensions.width / sourceDimensions.height;
  const outputAspect = outputDimensions ? outputDimensions.width / outputDimensions.height : 0;
  const aspectRatioStable = dimensionsValid && Math.abs(outputAspect / sourceAspect - 1) <= 0.035;
  const sourcePixels = sourceDimensions.width * sourceDimensions.height;
  const outputPixels = outputDimensions ? outputDimensions.width * outputDimensions.height : 0;
  const pixelRatio = outputPixels / sourcePixels;
  const pixelCountStable = dimensionsValid && pixelRatio >= 0.45 && pixelRatio <= 4.5;
  const targetRegionRecorded = validRegion(input.issueRegion);
  const lockedRegionsRecorded = input.lockedRegions.length > 0 && input.lockedRegions.every(validRegion);
  const checks = {
    decodable,
    dimensionsValid,
    aspectRatioStable,
    pixelCountStable,
    targetRegionRecorded,
    lockedRegionsRecorded,
  };
  const passed = Object.values(checks).every(Boolean);
  const failedLabels = Object.entries(checks)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  return {
    passed,
    version: CUSTOMER_REPAIR_GATE_VERSION,
    checks,
    sourceDimensions,
    outputDimensions,
    reason: passed
      ? "文件、画幅、像素规模和修正边界已通过基础检查；仍需客户人工确认商品与非目标区域。"
      : `基础检查未通过：${failedLabels.join("、")}`,
  };
}

export function parseImageDimensions(bytes: Uint8Array, mimeType: string): { width: number; height: number } | null {
  if (mimeType === "image/png" && bytes.length >= 24) {
    const png = [137, 80, 78, 71, 13, 10, 26, 10];
    if (png.every((value, index) => bytes[index] === value)) {
      return { width: readUint32(bytes, 16), height: readUint32(bytes, 20) };
    }
  }
  if (mimeType === "image/jpeg" && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (length < 2 || offset + length + 2 > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          height: (bytes[offset + 5] << 8) | bytes[offset + 6],
          width: (bytes[offset + 7] << 8) | bytes[offset + 8],
        };
      }
      offset += length + 2;
    }
  }
  if (mimeType === "image/webp" && bytes.length >= 30) {
    const fourcc = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
    if (fourcc(0) === "RIFF" && fourcc(8) === "WEBP") {
      const type = fourcc(12);
      if (type === "VP8X") {
        return {
          width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
          height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
        };
      }
      if (type === "VP8L" && bytes[20] === 0x2f) {
        const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
  }
  return null;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function validDimension(value: number | null): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function validRegion(region: { x: number; y: number; width: number; height: number } | null): boolean {
  return Boolean(
    region &&
      region.x >= 0 &&
      region.y >= 0 &&
      region.width > 0 &&
      region.height > 0 &&
      region.x + region.width <= 1.000001 &&
      region.y + region.height <= 1.000001,
  );
}
