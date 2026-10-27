import {
  VisionProviderError,
  type ProviderImageInput,
} from "./types.ts";

const ENVELOPE_ISSUER = "visionqa-staging-asset-signer-v1" as const;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256(value: string): Promise<string> {
  return toHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))),
  );
}

function canonicalPayload(
  image: ProviderImageInput,
  envelope: NonNullable<ProviderImageInput["privateEnvelope"]>,
): string {
  return JSON.stringify({
    version: envelope.version,
    issuer: envelope.issuer,
    nonce: envelope.nonce,
    role: image.role,
    mimeType: image.mimeType ?? "",
    expiresAt: image.expiresAt ?? "",
    assetSha256: envelope.assetSha256,
    byteSize: envelope.byteSize,
    urlHost: envelope.urlHost,
    urlPathSha256: envelope.urlPathSha256,
    urlSha256: envelope.urlSha256,
  });
}

async function hmacSha256(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
    ),
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export interface SignPrivateImageOptions {
  image: Omit<ProviderImageInput, "privateEnvelope">;
  assetSha256: string;
  byteSize: number;
  nonce: string;
  secret: string;
}

/**
 * Server-side staging asset signer. The secret must come from secret manager.
 * The returned envelope authenticates object-storage-derived metadata; callers cannot
 * widen it without invalidating the HMAC.
 */
export async function signPrivateImageEnvelope(
  options: SignPrivateImageOptions,
): Promise<ProviderImageInput> {
  const parsed = new URL(options.image.url);
  const envelope: NonNullable<ProviderImageInput["privateEnvelope"]> = {
    version: "v1",
    issuer: ENVELOPE_ISSUER,
    nonce: options.nonce,
    assetSha256: options.assetSha256.toLowerCase(),
    byteSize: options.byteSize,
    urlHost: parsed.hostname,
    urlPathSha256: await sha256(parsed.pathname),
    urlSha256: await sha256(options.image.url),
    signature: "",
  };
  envelope.signature = await hmacSha256(
    canonicalPayload(options.image, envelope),
    options.secret,
  );
  return { ...options.image, privateEnvelope: envelope };
}

export async function verifyPrivateImageEnvelope(
  image: ProviderImageInput,
  secret: string,
): Promise<void> {
  const envelope = image.privateEnvelope;
  if (
    !envelope ||
    envelope.version !== "v1" ||
    envelope.issuer !== ENVELOPE_ISSUER ||
    !NONCE.test(envelope.nonce) ||
    !SHA256_HEX.test(envelope.assetSha256) ||
    !Number.isInteger(envelope.byteSize) ||
    envelope.byteSize <= 0 ||
    !envelope.signature
  ) {
    throw new VisionProviderError(
      "CONFIGURATION",
      "The private-image envelope is missing or invalid.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(image.url);
  } catch {
    throw new VisionProviderError(
      "CONFIGURATION",
      "The private-image envelope URL is invalid.",
    );
  }
  const expectedPathHash = await sha256(parsed.pathname);
  const expectedUrlHash = await sha256(image.url);
  if (
    envelope.urlHost !== parsed.hostname ||
    envelope.urlPathSha256 !== expectedPathHash ||
    envelope.urlSha256 !== expectedUrlHash
  ) {
    throw new VisionProviderError(
      "CONFIGURATION",
      "The private-image envelope does not match the image reference.",
    );
  }
  const expectedSignature = await hmacSha256(
    canonicalPayload(image, envelope),
    secret,
  );
  if (!constantTimeEqual(envelope.signature, expectedSignature)) {
    throw new VisionProviderError(
      "CONFIGURATION",
      "The private-image envelope signature is invalid.",
    );
  }
}
