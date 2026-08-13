export type StorageProvider = "aliyun_oss" | "cloudflare_r2_legacy" | "memory";

export type StorageErrorCode =
  | "CONFIGURATION"
  | "AUTHENTICATION"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTEGRITY"
  | "TIMEOUT"
  | "UPSTREAM";

export class ObjectStorageError extends Error {
  readonly code: StorageErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    code: StorageErrorCode,
    message: string,
    options: { retryable?: boolean; status?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ObjectStorageError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

export interface StoredObjectIdentity {
  provider: StorageProvider;
  region: string;
  bucket: string;
  objectKey: string;
}

export interface StoredObjectMetadata extends StoredObjectIdentity {
  sha256: string;
  byteSize: number;
  mimeType: string;
  etag?: string;
  encryption: "SSE-OSS";
  retentionUntil?: string;
  lastModified?: string;
}

export interface PutObjectInput {
  tenantId: string;
  objectKey: string;
  body: Uint8Array;
  sha256: string;
  byteSize: number;
  mimeType: string;
  retentionUntil?: string;
}

export interface ObjectReference {
  tenantId: string;
  objectKey: string;
}

export interface PresignedGetInput extends ObjectReference {
  ttlSeconds: number;
}

export interface PresignedGetResult {
  url: string;
  expiresAt: string;
}

export interface DeleteObjectResult {
  deleted: boolean;
  audit: StorageAuditRecord;
}

export interface LifecycleMetadata {
  prefix: "staging/visionqa/";
  expirationDays: number;
  abortMultipartUploadDays: number;
  versioning: "disabled";
}

export interface StorageAuditRecord {
  operation: "PUT" | "HEAD" | "PRESIGN_GET" | "DELETE";
  provider: StorageProvider;
  region: string;
  bucket: string;
  objectKey: string;
  outcome: "SUCCESS" | "NOT_FOUND";
  occurredAt: string;
  sha256?: string;
  byteSize?: number;
  expiresAt?: string;
}

export interface StorageAuditSink {
  record(event: StorageAuditRecord): void | Promise<void>;
}

export interface ObjectStorage {
  readonly provider: StorageProvider;
  put(input: PutObjectInput): Promise<StoredObjectMetadata>;
  head(input: ObjectReference): Promise<StoredObjectMetadata | null>;
  presignGet(input: PresignedGetInput): Promise<PresignedGetResult>;
  delete(input: ObjectReference): Promise<DeleteObjectResult>;
  lifecycleMetadata(): Promise<LifecycleMetadata>;
}

const SHA256_HEX = /^[a-f0-9]{64}$/;
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PREFIX = "staging/visionqa/" as const;

export function assertSha256(value: string): string {
  const normalized = value.toLowerCase();
  if (!SHA256_HEX.test(normalized)) {
    throw new ObjectStorageError("INTEGRITY", "Object SHA-256 is invalid.");
  }
  return normalized;
}

export function assertTenantId(value: string): string {
  if (!SAFE_SEGMENT.test(value)) {
    throw new ObjectStorageError(
      "FORBIDDEN",
      "Storage tenant scope is invalid.",
    );
  }
  return value;
}

export function assertScopedObjectKey(
  tenantId: string,
  objectKey: string,
): string {
  const tenant = assertTenantId(tenantId);
  const expectedPrefix = `${PREFIX}${tenant}/`;
  if (
    !objectKey.startsWith(expectedPrefix) ||
    objectKey.includes("\\") ||
    objectKey.includes("//") ||
    objectKey.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new ObjectStorageError(
      "FORBIDDEN",
      "Object key is outside the authorized staging tenant prefix.",
    );
  }
  return objectKey;
}

export function toStorageRecord(input: {
  storageProvider?: string | null;
  objectKey?: string | null;
  r2Key?: string | null;
}): { storageProvider: StorageProvider; objectKey: string | null } {
  if (input.objectKey) {
    return {
      storageProvider:
        input.storageProvider === "memory"
          ? "memory"
          : input.storageProvider === "cloudflare_r2_legacy"
            ? "cloudflare_r2_legacy"
            : "aliyun_oss",
      objectKey: input.objectKey,
    };
  }
  return {
    storageProvider: input.r2Key ? "cloudflare_r2_legacy" : "aliyun_oss",
    objectKey: input.r2Key ?? null,
  };
}

export function newStorageWrite(objectKey: string): {
  storageProvider: "aliyun_oss";
  objectKey: string;
} {
  return { storageProvider: "aliyun_oss", objectKey };
}
