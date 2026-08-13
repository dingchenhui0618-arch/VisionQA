import {
  ObjectStorageError,
  assertScopedObjectKey,
  assertSha256,
  type DeleteObjectResult,
  type LifecycleMetadata,
  type ObjectReference,
  type ObjectStorage,
  type PresignedGetInput,
  type PresignedGetResult,
  type PutObjectInput,
  type StorageAuditRecord,
  type StoredObjectMetadata,
} from "./object-storage.ts";

export class MockObjectStorage implements ObjectStorage {
  readonly provider = "memory" as const;
  readonly audit: StorageAuditRecord[] = [];
  private readonly objects = new Map<
    string,
    { body: Uint8Array; metadata: StoredObjectMetadata }
  >();

  async put(input: PutObjectInput): Promise<StoredObjectMetadata> {
    const key = assertScopedObjectKey(input.tenantId, input.objectKey);
    const sha256 = assertSha256(input.sha256);
    if (this.objects.has(key)) {
      throw new ObjectStorageError("CONFLICT", "Mock object already exists.");
    }
    if (input.body.byteLength !== input.byteSize || input.byteSize <= 0) {
      throw new ObjectStorageError("INTEGRITY", "Mock object size mismatch.");
    }
    const metadata: StoredObjectMetadata = {
      provider: this.provider,
      region: "local",
      bucket: "visionqa-memory",
      objectKey: key,
      sha256,
      byteSize: input.byteSize,
      mimeType: input.mimeType,
      encryption: "SSE-OSS",
      retentionUntil: input.retentionUntil,
    };
    this.objects.set(key, { body: input.body.slice(), metadata });
    this.audit.push({
      operation: "PUT",
      provider: this.provider,
      region: "local",
      bucket: "visionqa-memory",
      objectKey: key,
      outcome: "SUCCESS",
      occurredAt: new Date().toISOString(),
      sha256,
      byteSize: input.byteSize,
    });
    return { ...metadata };
  }

  async head(input: ObjectReference): Promise<StoredObjectMetadata | null> {
    const key = assertScopedObjectKey(input.tenantId, input.objectKey);
    const found = this.objects.get(key)?.metadata ?? null;
    this.audit.push({
      operation: "HEAD",
      provider: this.provider,
      region: "local",
      bucket: "visionqa-memory",
      objectKey: key,
      outcome: found ? "SUCCESS" : "NOT_FOUND",
      occurredAt: new Date().toISOString(),
      ...(found ? { sha256: found.sha256, byteSize: found.byteSize } : {}),
    });
    return found ? { ...found } : null;
  }

  async presignGet(input: PresignedGetInput): Promise<PresignedGetResult> {
    const key = assertScopedObjectKey(input.tenantId, input.objectKey);
    if (input.ttlSeconds <= 0 || input.ttlSeconds > 300) {
      throw new ObjectStorageError(
        "CONFIGURATION",
        "Mock signed GET TTL must be between 1 and 300 seconds.",
      );
    }
    if (!this.objects.has(key)) {
      throw new ObjectStorageError("NOT_FOUND", "Mock object was not found.");
    }
    const expiresAt = new Date(
      Date.now() + input.ttlSeconds * 1000,
    ).toISOString();
    const url = `https://mock.invalid/${encodeURIComponent(key)}?signature=redacted`;
    this.audit.push({
      operation: "PRESIGN_GET",
      provider: this.provider,
      region: "local",
      bucket: "visionqa-memory",
      objectKey: key,
      outcome: "SUCCESS",
      occurredAt: new Date().toISOString(),
      expiresAt,
    });
    return { url, expiresAt };
  }

  async delete(input: ObjectReference): Promise<DeleteObjectResult> {
    const key = assertScopedObjectKey(input.tenantId, input.objectKey);
    const deleted = this.objects.delete(key);
    const audit: StorageAuditRecord = {
      operation: "DELETE",
      provider: this.provider,
      region: "local",
      bucket: "visionqa-memory",
      objectKey: key,
      outcome: deleted ? "SUCCESS" : "NOT_FOUND",
      occurredAt: new Date().toISOString(),
    };
    this.audit.push(audit);
    return { deleted, audit };
  }

  async lifecycleMetadata(): Promise<LifecycleMetadata> {
    return {
      prefix: "staging/visionqa/",
      expirationDays: 14,
      abortMultipartUploadDays: 1,
      versioning: "disabled",
    };
  }
}
