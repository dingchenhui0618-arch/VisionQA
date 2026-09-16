import { createHash } from "node:crypto";

import { DOWNLOAD_URL_TTL_SECONDS, type BetaAsset } from "./contracts.ts";
import {
  ObjectStorageError,
  assertScopedObjectKey,
  assertSha256,
  type DeleteObjectResult,
  type ObjectStorage,
  type StoredObjectMetadata,
} from "../storage/object-storage.ts";

export type PrivateAssetDownload = {
  asset: BetaAsset;
  url: string;
  expiresAt: string;
};

export type PrivateAssetDelete = {
  asset: BetaAsset;
  storage: DeleteObjectResult;
};

/** Server-side adapter between the trusted beta asset record and object storage. */
export class PrivateAssetStorage {
  private readonly storage: ObjectStorage;
  private readonly now: () => Date;

  constructor(
    storage: ObjectStorage,
    now: () => Date = () => new Date(),
  ) {
    this.storage = storage;
    this.now = now;
  }

  async put(
    tenantId: string,
    asset: BetaAsset,
    bytes: Uint8Array,
  ): Promise<BetaAsset> {
    this.assertOwned(tenantId, asset);
    this.assertLive(asset);
    if (asset.uploadStatus !== "PENDING") {
      throw new ObjectStorageError("CONFLICT", "Asset is not pending upload.");
    }
    if (bytes.byteLength !== asset.byteSize || asset.byteSize <= 0) {
      throw new ObjectStorageError("INTEGRITY", "Asset byte size does not match.");
    }

    const sha256 = hashBytes(bytes);
    if (asset.sha256 !== null && assertSha256(asset.sha256) !== sha256) {
      throw new ObjectStorageError("INTEGRITY", "Asset SHA-256 does not match the upload.");
    }
    const stored = await this.storage.put({
      tenantId,
      objectKey: asset.objectKey,
      body: bytes,
      sha256,
      byteSize: asset.byteSize,
      mimeType: asset.mimeType,
      retentionUntil: asset.retentionUntil,
    });
    this.assertMetadata(asset, stored, sha256);
    const headed = await this.storage.head({ tenantId, objectKey: asset.objectKey });
    if (!headed) throw new ObjectStorageError("INTEGRITY", "Stored asset disappeared after PUT.");
    this.assertMetadata(asset, headed, sha256);
    return { ...asset, sha256, uploadStatus: "READY" };
  }

  async download(
    tenantId: string,
    asset: BetaAsset,
    ttlSeconds = DOWNLOAD_URL_TTL_SECONDS,
  ): Promise<PrivateAssetDownload> {
    this.assertOwned(tenantId, asset);
    this.assertLive(asset);
    if (asset.uploadStatus !== "READY" || !asset.sha256) {
      throw new ObjectStorageError("NOT_FOUND", "Asset is not ready for download.");
    }
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 300) {
      throw new ObjectStorageError("CONFIGURATION", "Download URL TTL exceeds the asset retention period.");
    }
    const metadata = await this.storage.head({ tenantId, objectKey: asset.objectKey });
    if (!metadata) throw new ObjectStorageError("NOT_FOUND", "Asset object was not found.");
    this.assertMetadata(asset, metadata, asset.sha256);
    // Re-read the clock after HEAD; signing must never outlive retention.
    const remaining = new Date(asset.retentionUntil).getTime() - this.now().getTime();
    const ttl = Math.min(ttlSeconds, Math.floor(remaining / 1000));
    if (ttl < 1) {
      throw new ObjectStorageError("CONFIGURATION", "Download URL TTL exceeds the asset retention period.");
    }
    const signed = await this.storage.presignGet({ tenantId, objectKey: asset.objectKey, ttlSeconds: ttl });
    return { asset: { ...asset }, url: signed.url, expiresAt: signed.expiresAt };
  }

  async delete(tenantId: string, asset: BetaAsset): Promise<PrivateAssetDelete> {
    this.assertOwned(tenantId, asset);
    const result = await this.storage.delete({ tenantId, objectKey: asset.objectKey });
    return { asset: { ...asset, uploadStatus: "DELETED" }, storage: result };
  }

  private assertOwned(tenantId: string, asset: BetaAsset): void {
    if (!tenantId || asset.tenantId !== tenantId) {
      throw new ObjectStorageError("FORBIDDEN", "Asset does not belong to this tenant.");
    }
    // Keep the existing staging prefix gate. Legacy beta/visionqa keys are not
    // silently migrated or widened by this bridge.
    assertScopedObjectKey(tenantId, asset.objectKey);
  }

  private assertLive(asset: BetaAsset): void {
    const retention = Date.parse(asset.retentionUntil);
    if (!Number.isFinite(retention) || retention <= this.now().getTime()) {
      throw new ObjectStorageError("NOT_FOUND", "Asset retention period has expired.");
    }
  }

  private assertMetadata(asset: BetaAsset, metadata: StoredObjectMetadata, expectedSha: string): void {
    if (
      metadata.objectKey !== asset.objectKey ||
      metadata.provider !== this.storage.provider ||
      metadata.encryption !== "SSE-OSS" ||
      metadata.sha256 !== expectedSha ||
      metadata.byteSize !== asset.byteSize ||
      metadata.mimeType !== asset.mimeType
    ) {
      throw new ObjectStorageError("INTEGRITY", "Stored asset metadata does not match the trusted asset.");
    }
  }
}

export function hashBytes(bytes: Uint8Array): string {
  return assertSha256(createHash("sha256").update(bytes).digest("hex"));
}
