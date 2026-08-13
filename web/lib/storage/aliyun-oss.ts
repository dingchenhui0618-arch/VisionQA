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
  type StorageAuditSink,
  type StoredObjectMetadata,
} from "./object-storage.ts";

const REGION = "cn-beijing" as const;
const PREFIX = "staging/visionqa/" as const;
const MAX_GET_TTL_SECONDS = 300;
const LIFECYCLE_EXPIRATION_DAYS = 14;
const ABORT_MULTIPART_UPLOAD_DAYS = 1;
const BUCKET_NAME = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const ROUTING_QUERY_KEYS = new Set([
  "bucket",
  "key",
  "object",
  "objectkey",
  "path",
]);

export const ALIYUN_OSS_STAGING_GOVERNANCE = Object.freeze({
  artifactId: "ALIYUN_AUTHORIZATION_v0.1",
  artifactPath:
    "handoffs/ALIYUN_AUTHORIZATION_v0.1/authorization_decisions.csv",
  artifactSha256:
    "2d8089b8e42d41c978c1e818b470b6c223f17a9852b74cc969d35c7af60f7db4",
} as const);

export interface OssHeadResult {
  contentLength: number;
  contentType: string;
  etag?: string;
  lastModified?: string;
  serverSideEncryption?: string;
  metadata: Record<string, string | undefined>;
}

export interface OssClientPort {
  putObject(input: {
    bucket: string;
    key: string;
    body: Uint8Array;
    headers: Record<string, string>;
  }): Promise<{ etag?: string }>;
  headObject(input: {
    bucket: string;
    key: string;
  }): Promise<OssHeadResult | null>;
  presignGetObject(input: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }): Promise<string>;
  deleteObject(input: { bucket: string; key: string }): Promise<void>;
}

interface AliyunOssConfig {
  region: "cn-beijing";
  bucket: string;
  endpointHost: string;
  bucketAccess: "private";
  blockPublicAccess: true;
  credentialMode: "ram_role_sts";
  serverSideEncryption: "SSE-OSS";
  lifecycle: LifecycleMetadata;
}

export interface AliyunOssEnvironment {
  VISION_STORAGE_PROVIDER?: string;
  VISION_STORAGE_STAGING_READY?: string;
  VISION_OSS_REGION?: string;
  VISION_OSS_BUCKET?: string;
  VISION_OSS_ENDPOINT_HOST?: string;
  VISION_OSS_BUCKET_ACCESS?: string;
  VISION_OSS_BLOCK_PUBLIC_ACCESS?: string;
  VISION_OSS_CREDENTIAL_MODE?: string;
  VISION_OSS_SSE?: string;
  VISION_OSS_PREFIX?: string;
  VISION_OSS_LIFECYCLE_EXPIRATION_DAYS?: string;
  VISION_OSS_ABORT_MULTIPART_UPLOAD_DAYS?: string;
  VISION_STORAGE_GOVERNANCE_APPROVED?: string;
  VISION_STORAGE_GOVERNANCE_ARTIFACT_ID?: string;
  VISION_STORAGE_GOVERNANCE_ARTIFACT_PATH?: string;
  VISION_STORAGE_GOVERNANCE_ARTIFACT_SHA256?: string;
  VISION_OSS_ACCESS_KEY_ID?: string;
  VISION_OSS_ACCESS_KEY_SECRET?: string;
}

export function classifyOssError(error: unknown): ObjectStorageError {
  if (error instanceof ObjectStorageError) return error;
  const value =
    error && typeof error === "object"
      ? (error as { code?: string; status?: number; statusCode?: number })
      : {};
  const code = value.code ?? "";
  const status = value.status ?? value.statusCode;
  if (status === 401 || code === "InvalidAccessKeyId") {
    return new ObjectStorageError(
      "AUTHENTICATION",
      "OSS temporary-role authentication failed.",
      { status, cause: error },
    );
  }
  if (status === 403 || code === "AccessDenied") {
    return new ObjectStorageError("FORBIDDEN", "OSS access was denied.", {
      status,
      cause: error,
    });
  }
  if (status === 404 || code === "NoSuchKey") {
    return new ObjectStorageError("NOT_FOUND", "OSS object was not found.", {
      status,
      cause: error,
    });
  }
  if (status === 409 || code === "FileAlreadyExists") {
    return new ObjectStorageError(
      "CONFLICT",
      "OSS refused to overwrite the existing object.",
      { status, cause: error },
    );
  }
  if (code === "RequestTimeout" || code === "ConnectionTimeoutError") {
    return new ObjectStorageError("TIMEOUT", "OSS request timed out.", {
      retryable: true,
      status,
      cause: error,
    });
  }
  return new ObjectStorageError(
    "UPSTREAM",
    "OSS request failed.",
    { retryable: typeof status === "number" && status >= 500, status, cause: error },
  );
}

function assertConfig(config: AliyunOssConfig): void {
  const expectedHost = `${config.bucket}.oss-cn-beijing.aliyuncs.com`;
  if (
    config.region !== REGION ||
    config.bucketAccess !== "private" ||
    config.blockPublicAccess !== true ||
    config.credentialMode !== "ram_role_sts" ||
    config.serverSideEncryption !== "SSE-OSS" ||
    config.endpointHost !== expectedHost ||
    config.lifecycle.prefix !== PREFIX ||
    config.lifecycle.versioning !== "disabled" ||
    config.lifecycle.expirationDays < 1 ||
    config.lifecycle.abortMultipartUploadDays < 1
  ) {
    throw new ObjectStorageError(
      "CONFIGURATION",
      "OSS staging security configuration is invalid.",
    );
  }
}

function metadataFromHead(
  config: AliyunOssConfig,
  objectKey: string,
  result: OssHeadResult,
): StoredObjectMetadata {
  const sha256 = assertSha256(result.metadata["visionqa-sha256"] ?? "");
  const declaredSize = Number(result.metadata["visionqa-byte-size"]);
  if (
    !Number.isInteger(result.contentLength) ||
    result.contentLength <= 0 ||
    declaredSize !== result.contentLength ||
    result.serverSideEncryption !== "AES256"
  ) {
    throw new ObjectStorageError(
      "INTEGRITY",
      "OSS HEAD metadata failed integrity verification.",
    );
  }
  return {
    provider: "aliyun_oss",
    region: config.region,
    bucket: config.bucket,
    objectKey,
    sha256,
    byteSize: result.contentLength,
    mimeType: result.contentType,
    etag: result.etag,
    encryption: "SSE-OSS",
    retentionUntil: result.metadata["visionqa-retention-until"],
    lastModified: result.lastModified,
  };
}

class AliyunOssStorage implements ObjectStorage {
  readonly provider = "aliyun_oss" as const;
  private readonly config: AliyunOssConfig;
  private readonly client: OssClientPort;
  private readonly audit?: StorageAuditSink;

  constructor(
    config: AliyunOssConfig,
    client: OssClientPort,
    audit?: StorageAuditSink,
  ) {
    assertConfig(config);
    this.config = Object.freeze({ ...config, lifecycle: { ...config.lifecycle } });
    this.client = client;
    this.audit = audit;
  }

  private async record(event: StorageAuditRecord): Promise<void> {
    await this.audit?.record(event);
  }

  private baseAudit(
    operation: StorageAuditRecord["operation"],
    objectKey: string,
  ): Omit<StorageAuditRecord, "outcome" | "occurredAt"> {
    return {
      operation,
      provider: this.provider,
      region: this.config.region,
      bucket: this.config.bucket,
      objectKey,
    };
  }

  async put(input: PutObjectInput): Promise<StoredObjectMetadata> {
    const key = assertScopedObjectKey(input.tenantId, input.objectKey);
    const sha256 = assertSha256(input.sha256);
    if (input.byteSize !== input.body.byteLength || input.byteSize <= 0) {
      throw new ObjectStorageError(
        "INTEGRITY",
        "Object byte size does not match the upload body.",
      );
    }
    try {
      await this.client.putObject({
        bucket: this.config.bucket,
        key,
        body: input.body,
        headers: {
          "content-type": input.mimeType,
          "x-oss-forbid-overwrite": "true",
          "x-oss-server-side-encryption": "AES256",
          "x-oss-meta-visionqa-sha256": sha256,
          "x-oss-meta-visionqa-byte-size": String(input.byteSize),
          ...(input.retentionUntil
            ? { "x-oss-meta-visionqa-retention-until": input.retentionUntil }
            : {}),
        },
      });
      const stored = await this.head({ tenantId: input.tenantId, objectKey: key });
      if (
        !stored ||
        stored.sha256 !== sha256 ||
        stored.byteSize !== input.byteSize ||
        stored.mimeType !== input.mimeType
      ) {
        throw new ObjectStorageError(
          "INTEGRITY",
          "Uploaded OSS object does not match its declared metadata.",
        );
      }
      await this.record({
        ...this.baseAudit("PUT", key),
        outcome: "SUCCESS",
        occurredAt: new Date().toISOString(),
        sha256,
        byteSize: input.byteSize,
      });
      return stored;
    } catch (error) {
      throw classifyOssError(error);
    }
  }

  async head(input: ObjectReference): Promise<StoredObjectMetadata | null> {
    const key = assertScopedObjectKey(input.tenantId, input.objectKey);
    try {
      const result = await this.client.headObject({
        bucket: this.config.bucket,
        key,
      });
      const occurredAt = new Date().toISOString();
      if (!result) {
        await this.record({
          ...this.baseAudit("HEAD", key),
          outcome: "NOT_FOUND",
          occurredAt,
        });
        return null;
      }
      const metadata = metadataFromHead(this.config, key, result);
      await this.record({
        ...this.baseAudit("HEAD", key),
        outcome: "SUCCESS",
        occurredAt,
        sha256: metadata.sha256,
        byteSize: metadata.byteSize,
      });
      return metadata;
    } catch (error) {
      throw classifyOssError(error);
    }
  }

  async presignGet(input: PresignedGetInput): Promise<PresignedGetResult> {
    const key = assertScopedObjectKey(input.tenantId, input.objectKey);
    if (
      !Number.isInteger(input.ttlSeconds) ||
      input.ttlSeconds <= 0 ||
      input.ttlSeconds > MAX_GET_TTL_SECONDS
    ) {
      throw new ObjectStorageError(
        "CONFIGURATION",
        "OSS signed GET TTL must be between 1 and 300 seconds.",
      );
    }
    try {
      const url = await this.client.presignGetObject({
        bucket: this.config.bucket,
        key,
        expiresInSeconds: input.ttlSeconds,
      });
      const parsed = new URL(url);
      const canonicalPath = `/${key
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")}`;
      const hasRoutingQuery = Array.from(parsed.searchParams).some(
        ([name, value]) =>
          ROUTING_QUERY_KEYS.has(name.toLowerCase()) ||
          value.includes(PREFIX),
      );
      if (
        parsed.protocol !== "https:" ||
        parsed.hostname !== this.config.endpointHost ||
        parsed.pathname !== canonicalPath ||
        hasRoutingQuery ||
        parsed.username ||
        parsed.password ||
        parsed.hash
      ) {
        throw new ObjectStorageError(
          "CONFIGURATION",
          "OSS signer returned an unapproved URL.",
        );
      }
      const expiresAt = new Date(
        Date.now() + input.ttlSeconds * 1000,
      ).toISOString();
      await this.record({
        ...this.baseAudit("PRESIGN_GET", key),
        outcome: "SUCCESS",
        occurredAt: new Date().toISOString(),
        expiresAt,
      });
      return { url, expiresAt };
    } catch (error) {
      throw classifyOssError(error);
    }
  }

  async delete(input: ObjectReference): Promise<DeleteObjectResult> {
    const key = assertScopedObjectKey(input.tenantId, input.objectKey);
    try {
      const existing = await this.head(input);
      if (!existing) {
        const audit: StorageAuditRecord = {
          ...this.baseAudit("DELETE", key),
          outcome: "NOT_FOUND",
          occurredAt: new Date().toISOString(),
        };
        await this.record(audit);
        return { deleted: false, audit };
      }
      await this.client.deleteObject({ bucket: this.config.bucket, key });
      const remaining = await this.client.headObject({
        bucket: this.config.bucket,
        key,
      });
      if (remaining) {
        throw new ObjectStorageError(
          "UPSTREAM",
          "OSS delete could not be verified.",
        );
      }
      const audit: StorageAuditRecord = {
        ...this.baseAudit("DELETE", key),
        outcome: "SUCCESS",
        occurredAt: new Date().toISOString(),
        sha256: existing.sha256,
        byteSize: existing.byteSize,
      };
      await this.record(audit);
      return { deleted: true, audit };
    } catch (error) {
      throw classifyOssError(error);
    }
  }

  async lifecycleMetadata(): Promise<LifecycleMetadata> {
    return { ...this.config.lifecycle };
  }
}

export function createAliyunOssStorageFromEnv(
  env: AliyunOssEnvironment,
  client?: OssClientPort,
  audit?: StorageAuditSink,
): AliyunOssStorage {
  if (
    env.VISION_OSS_ACCESS_KEY_ID ||
    env.VISION_OSS_ACCESS_KEY_SECRET
  ) {
    throw new ObjectStorageError(
      "CONFIGURATION",
      "Static OSS AccessKey credentials are forbidden.",
    );
  }
  const bucket = env.VISION_OSS_BUCKET ?? "";
  const expectedEndpoint = `${bucket}.oss-cn-beijing.aliyuncs.com`;
  if (
    env.VISION_STORAGE_PROVIDER !== "aliyun_oss" ||
    env.VISION_STORAGE_STAGING_READY !== "true" ||
    env.VISION_STORAGE_GOVERNANCE_APPROVED !== "true" ||
    env.VISION_STORAGE_GOVERNANCE_ARTIFACT_ID !==
      ALIYUN_OSS_STAGING_GOVERNANCE.artifactId ||
    env.VISION_STORAGE_GOVERNANCE_ARTIFACT_PATH !==
      ALIYUN_OSS_STAGING_GOVERNANCE.artifactPath ||
    env.VISION_STORAGE_GOVERNANCE_ARTIFACT_SHA256 !==
      ALIYUN_OSS_STAGING_GOVERNANCE.artifactSha256 ||
    env.VISION_OSS_REGION !== REGION ||
    !BUCKET_NAME.test(bucket) ||
    env.VISION_OSS_ENDPOINT_HOST !== expectedEndpoint ||
    env.VISION_OSS_BUCKET_ACCESS !== "private" ||
    env.VISION_OSS_BLOCK_PUBLIC_ACCESS !== "true" ||
    env.VISION_OSS_CREDENTIAL_MODE !== "ram_role_sts" ||
    env.VISION_OSS_SSE !== "SSE-OSS" ||
    env.VISION_OSS_PREFIX !== PREFIX ||
    env.VISION_OSS_LIFECYCLE_EXPIRATION_DAYS !==
      String(LIFECYCLE_EXPIRATION_DAYS) ||
    env.VISION_OSS_ABORT_MULTIPART_UPLOAD_DAYS !==
      String(ABORT_MULTIPART_UPLOAD_DAYS) ||
    !client
  ) {
    throw new ObjectStorageError(
      "CONFIGURATION",
      "Aliyun OSS storage is not activated.",
    );
  }
  return new AliyunOssStorage(
    {
      region: env.VISION_OSS_REGION as "cn-beijing",
      bucket,
      endpointHost: expectedEndpoint,
      bucketAccess: "private",
      blockPublicAccess: true,
      credentialMode: "ram_role_sts",
      serverSideEncryption: "SSE-OSS",
      lifecycle: {
        prefix: PREFIX,
        expirationDays: LIFECYCLE_EXPIRATION_DAYS,
        abortMultipartUploadDays: ABORT_MULTIPART_UPLOAD_DAYS,
        versioning: "disabled",
      },
    },
    client,
    audit,
  );
}
