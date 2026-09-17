import sharp from "sharp";

const MAX_PIXELS = 20_000_000;
const MAX_ASPECT_DEVIATION = 0.035;
const VERSION = "locked-region-composite-v1" as const;

export type CompositeRegion = { x: number; y: number; width: number; height: number };
export type LockedRepairComposite = {
  outputBytes: Uint8Array;
  width: number;
  height: number;
  metadata: {
    version: typeof VERSION;
    sourceSha256: string;
    rawOutputSha256: string;
    outsideChangedPixels: number;
  };
};

/** Composite only the model's target rectangle over the original image. */
export async function composeLockedRepair(input: {
  sourceBytes: Uint8Array;
  outputBytes: Uint8Array;
  issueRegion: CompositeRegion;
}): Promise<LockedRepairComposite> {
  const region = validateRegion(input.issueRegion);
  const source = await decode(input.sourceBytes, "source");
  const output = await decode(input.outputBytes, "output");
  if (source.width * source.height > MAX_PIXELS || output.width * output.height > MAX_PIXELS) {
    throw new Error("Image exceeds the 20 megapixel limit");
  }
  const sourceRatio = source.width / source.height;
  const outputRatio = output.width / output.height;
  if (Math.abs(outputRatio / sourceRatio - 1) > MAX_ASPECT_DEVIATION || output.width * output.height / (source.width * source.height) < 0.45 || output.width * output.height / (source.width * source.height) > 4.5) {
    throw new Error("Output aspect ratio differs too much from source");
  }

  const resized = await sharp(input.outputBytes, { limitInputPixels: MAX_PIXELS, failOn: "warning" })
    .toColourspace("srgb")
    .resize(source.width, source.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const composited = Buffer.from(source.raw);
  const x0 = Math.max(0, Math.ceil(region.x * source.width));
  const y0 = Math.max(0, Math.ceil(region.y * source.height));
  const x1 = Math.min(source.width, Math.floor((region.x + region.width) * source.width));
  const y1 = Math.min(source.height, Math.floor((region.y + region.height) * source.height));
  if (x1 <= x0 || y1 <= y0) throw new Error("Issue region contains no pixels");
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = (y * source.width + x) * 4;
      const edge = Math.min(x - x0, x1 - 1 - x, y - y0, y1 - 1 - y);
      const alpha = Math.min(1, (edge + 1) / 2);
      for (let channel = 0; channel < 4; channel += 1) composited[index + channel] = Math.round(source.raw[index + channel] * (1 - alpha) + resized[index + channel] * alpha);
    }
  }
  const encoded = await sharp(composited, { raw: { width: source.width, height: source.height, channels: 4 } }).png().toBuffer();
  let outsideChangedPixels = 0;
  for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
    if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
    const index = (y * source.width + x) * 4;
    if ([0, 1, 2, 3].some((channel) => composited[index + channel] !== source.raw[index + channel])) outsideChangedPixels += 1;
  }
  return {
    outputBytes: new Uint8Array(encoded), width: source.width, height: source.height,
    metadata: { version: VERSION, sourceSha256: await sha256(input.sourceBytes), rawOutputSha256: await sha256(input.outputBytes), outsideChangedPixels },
  };
}

async function decode(bytes: Uint8Array, label: string) {
  if (!bytes.byteLength) throw new Error(`${label} image is empty`);
  const image = sharp(bytes, { animated: false, limitInputPixels: MAX_PIXELS, failOn: "warning" }).toColourspace("srgb");
  const info = await image.metadata();
  if (info.orientation && info.orientation !== 1) throw new Error(`${label} image orientation must be normalized before repair`);
  if (!info.width || !info.height || info.pages && info.pages > 1) throw new Error(`${label} image is invalid or animated`);
  const raw = await image.ensureAlpha().raw().toBuffer();
  return { width: info.width, height: info.height, raw };
}

function validateRegion(region: CompositeRegion): CompositeRegion {
  if (!region || ![region.x, region.y, region.width, region.height].every(Number.isFinite) || region.width <= 0 || region.height <= 0 || region.x < 0 || region.y < 0 || region.x + region.width > 1 || region.y + region.height > 1) {
    throw new Error("Issue region must be within normalized image bounds");
  }
  return region;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
