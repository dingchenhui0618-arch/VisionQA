import { signPrivateImageEnvelope } from "../visionqa/providers/private-image-envelope.ts";
import type { ProviderImageInput } from "../visionqa/providers/types.ts";
import {
  ObjectStorageError,
  type ObjectStorage,
} from "./object-storage.ts";

export interface IssuePrivateImageInput {
  tenantId: string;
  objectKey: string;
  role: "candidate" | "reference";
  expectedAssetSha256: string;
  expectedByteSize: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  nonce: string;
  hmacSecret: string;
  ttlSeconds?: number;
}

export async function issuePrivateImageReference(
  storage: ObjectStorage,
  input: IssuePrivateImageInput,
): Promise<ProviderImageInput> {
  const metadata = await storage.head({
    tenantId: input.tenantId,
    objectKey: input.objectKey,
  });
  if (!metadata) {
    throw new ObjectStorageError(
      "NOT_FOUND",
      "Private image object was not found.",
    );
  }
  if (
    metadata.sha256 !== input.expectedAssetSha256.toLowerCase() ||
    metadata.byteSize !== input.expectedByteSize ||
    metadata.mimeType !== input.mimeType
  ) {
    throw new ObjectStorageError(
      "INTEGRITY",
      "Private image metadata does not match the asset record.",
    );
  }
  const signed = await storage.presignGet({
    tenantId: input.tenantId,
    objectKey: input.objectKey,
    ttlSeconds: input.ttlSeconds ?? 300,
  });
  return signPrivateImageEnvelope({
    image: {
      url: signed.url,
      role: input.role,
      mimeType: input.mimeType,
      access: "short_lived_private",
      expiresAt: signed.expiresAt,
    },
    assetSha256: metadata.sha256,
    byteSize: metadata.byteSize,
    nonce: input.nonce,
    secret: input.hmacSecret,
  });
}
