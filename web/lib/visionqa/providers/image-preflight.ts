import type { ApprovedProviderDefinition } from "./registry.ts";
import { verifyPrivateImageEnvelope } from "./private-image-envelope.ts";
import {
  VisionProviderError,
  type ProviderEvaluationInput,
} from "./types.ts";

const MAX_PRIVATE_URL_TTL_MS = 15 * 60 * 1000;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function assertProviderImages(
  input: ProviderEvaluationInput,
  definition: ApprovedProviderDefinition,
  imageEnvelopeHmacSecret: string,
): Promise<void> {
  const images = [input.candidate, ...input.references];
  if (images.length > definition.maxImagesPerRequest) {
    throw new VisionProviderError(
      "PAYLOAD_TOO_LARGE",
      "The provider image-count limit was exceeded.",
    );
  }

  const now = Date.now();
  for (const image of images) {
    await verifyPrivateImageEnvelope(image, imageEnvelopeHmacSecret);
    let parsed: URL;
    try {
      parsed = new URL(image.url);
    } catch {
      throw new VisionProviderError(
        "CONFIGURATION",
        "Provider images must use an approved private HTTPS asset URL.",
      );
    }
    if (
      !image.privateEnvelope ||
      image.privateEnvelope.byteSize > definition.maxImageBytes
    ) {
      throw new VisionProviderError(
        "PAYLOAD_TOO_LARGE",
        "The provider image exceeds the approved byte-size limit.",
      );
    }
    const expiresAt = Date.parse(image.expiresAt ?? "");
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      !definition.imageHosts.includes(parsed.hostname) ||
      image.access !== "short_lived_private" ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now ||
      expiresAt - now > MAX_PRIVATE_URL_TTL_MS
    ) {
      throw new VisionProviderError(
        "CONFIGURATION",
        "Provider images must use an allowlisted private HTTPS URL expiring within 15 minutes.",
      );
    }
    if (image.mimeType && !ALLOWED_MIME_TYPES.has(image.mimeType)) {
      throw new VisionProviderError(
        "UNSUPPORTED_MEDIA",
        "The provider image media type is not supported.",
      );
    }
  }
}
