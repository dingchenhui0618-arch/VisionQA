import assert from "node:assert/strict";
import test from "node:test";
import {
  ALIYUN_OSS_STAGING_GOVERNANCE,
  classifyOssError,
  createAliyunOssStorageFromEnv,
  type OssClientPort,
  type OssHeadResult,
} from "../lib/storage/aliyun-oss.ts";
import { MockObjectStorage } from "../lib/storage/mock-object-storage.ts";
import {
  ObjectStorageError,
  newStorageWrite,
  toStorageRecord,
  type StorageAuditRecord,
} from "../lib/storage/object-storage.ts";
import { issuePrivateImageReference } from "../lib/storage/private-url-service.ts";
import { verifyPrivateImageEnvelope } from "../lib/visionqa/providers/private-image-envelope.ts";

const SHA256 = "a".repeat(64);
const BODY = new Uint8Array([1, 2, 3]);
const KEY = `staging/visionqa/tenant-a/assets/asset-a/${SHA256}.jpg`;
const HMAC_SECRET = "test-only-private-image-hmac-secret";

const validEnv = {
  VISION_STORAGE_PROVIDER: "aliyun_oss",
  VISION_STORAGE_STAGING_READY: "true",
  VISION_STORAGE_GOVERNANCE_APPROVED: "true",
  VISION_STORAGE_GOVERNANCE_ARTIFACT_ID:
    ALIYUN_OSS_STAGING_GOVERNANCE.artifactId,
  VISION_STORAGE_GOVERNANCE_ARTIFACT_PATH:
    ALIYUN_OSS_STAGING_GOVERNANCE.artifactPath,
  VISION_STORAGE_GOVERNANCE_ARTIFACT_SHA256:
    ALIYUN_OSS_STAGING_GOVERNANCE.artifactSha256,
  VISION_OSS_REGION: "cn-beijing",
  VISION_OSS_BUCKET: "visionqa-stg-private",
  VISION_OSS_ENDPOINT_HOST:
    "visionqa-stg-private.oss-cn-beijing.aliyuncs.com",
  VISION_OSS_BUCKET_ACCESS: "private",
  VISION_OSS_BLOCK_PUBLIC_ACCESS: "true",
  VISION_OSS_CREDENTIAL_MODE: "ram_role_sts",
  VISION_OSS_SSE: "SSE-OSS",
  VISION_OSS_PREFIX: "staging/visionqa/",
  VISION_OSS_LIFECYCLE_EXPIRATION_DAYS: "14",
  VISION_OSS_ABORT_MULTIPART_UPLOAD_DAYS: "1",
} as const;

class FakeOssClient implements OssClientPort {
  calls: Array<{ operation: string; input: unknown }> = [];
  objects = new Map<string, OssHeadResult>();
  signedUrlOverride?: string;

  async putObject(input: {
    bucket: string;
    key: string;
    body: Uint8Array;
    headers: Record<string, string>;
  }): Promise<{ etag?: string }> {
    this.calls.push({ operation: "PUT", input });
    if (this.objects.has(input.key)) {
      throw { code: "FileAlreadyExists", status: 409 };
    }
    this.objects.set(input.key, {
      contentLength: input.body.byteLength,
      contentType: input.headers["content-type"],
      etag: "fake-etag",
      serverSideEncryption: input.headers["x-oss-server-side-encryption"],
      metadata: {
        "visionqa-sha256":
          input.headers["x-oss-meta-visionqa-sha256"],
        "visionqa-byte-size":
          input.headers["x-oss-meta-visionqa-byte-size"],
        "visionqa-retention-until":
          input.headers["x-oss-meta-visionqa-retention-until"],
      },
    });
    return { etag: "fake-etag" };
  }

  async headObject(input: {
    bucket: string;
    key: string;
  }): Promise<OssHeadResult | null> {
    this.calls.push({ operation: "HEAD", input });
    return this.objects.get(input.key) ?? null;
  }

  async presignGetObject(input: {
    bucket: string;
    key: string;
    expiresInSeconds: number;
  }): Promise<string> {
    this.calls.push({ operation: "PRESIGN_GET", input });
    return (
      this.signedUrlOverride ??
      `https://${validEnv.VISION_OSS_ENDPOINT_HOST}/${input.key}?OSSAccessKeyId=redacted&Signature=secret`
    );
  }

  async deleteObject(input: {
    bucket: string;
    key: string;
  }): Promise<void> {
    this.calls.push({ operation: "DELETE", input });
    this.objects.delete(input.key);
  }
}

test("default/incomplete governance activation is zero-network and static AK is rejected", () => {
  const client = new FakeOssClient();
  for (const env of [
    {},
    {
      ...validEnv,
      VISION_STORAGE_GOVERNANCE_ARTIFACT_ID: undefined,
    },
    {
      ...validEnv,
      VISION_STORAGE_GOVERNANCE_ARTIFACT_SHA256: "0".repeat(64),
    },
    {
      ...validEnv,
      VISION_OSS_ACCESS_KEY_ID: "must-not-be-used",
      VISION_OSS_ACCESS_KEY_SECRET: "must-not-be-used",
    },
  ]) {
    assert.throws(
      () => createAliyunOssStorageFromEnv(env, client),
      (error: unknown) =>
        error instanceof ObjectStorageError &&
        error.code === "CONFIGURATION" &&
        !error.message.includes("must-not-be-used"),
    );
  }
  assert.equal(client.calls.length, 0);
});

test("OSS rejects config override and 999-day lifecycle before network", () => {
  const client = new FakeOssClient();
  const invalid = [
    { ...validEnv, VISION_OSS_REGION: "cn-shanghai" },
    { ...validEnv, VISION_OSS_BUCKET_ACCESS: "public-read" },
    { ...validEnv, VISION_OSS_BLOCK_PUBLIC_ACCESS: "false" },
    { ...validEnv, VISION_OSS_CREDENTIAL_MODE: "access_key" },
    { ...validEnv, VISION_OSS_ENDPOINT_HOST: "evil.example" },
    { ...validEnv, VISION_OSS_PREFIX: "production/visionqa/" },
    {
      ...validEnv,
      VISION_OSS_LIFECYCLE_EXPIRATION_DAYS: "999",
    },
    {
      ...validEnv,
      VISION_OSS_ABORT_MULTIPART_UPLOAD_DAYS: "999",
    },
  ];
  for (const badEnv of invalid) {
    assert.throws(
      () => createAliyunOssStorageFromEnv(badEnv, client),
      (error: unknown) =>
        error instanceof ObjectStorageError &&
        error.code === "CONFIGURATION",
    );
  }
  assert.equal(client.calls.length, 0);
});

test("put/head/presign/delete enforce OSS security headers and produce URL-free audit", async () => {
  const client = new FakeOssClient();
  const audit: StorageAuditRecord[] = [];
  const storage = createAliyunOssStorageFromEnv(validEnv, client, {
    record(event) {
      audit.push(event);
    },
  });
  const stored = await storage.put({
    tenantId: "tenant-a",
    objectKey: KEY,
    body: BODY,
    sha256: SHA256,
    byteSize: BODY.byteLength,
    mimeType: "image/jpeg",
  });
  assert.equal(stored.provider, "aliyun_oss");
  const putCall = client.calls.find((call) => call.operation === "PUT");
  const putHeaders = (
    putCall!.input as { headers: Record<string, string> }
  ).headers;
  assert.equal(putHeaders["x-oss-forbid-overwrite"], "true");
  assert.equal(putHeaders["x-oss-server-side-encryption"], "AES256");

  const signed = await storage.presignGet({
    tenantId: "tenant-a",
    objectKey: KEY,
    ttlSeconds: 300,
  });
  assert.match(signed.url, /^https:\/\/visionqa-stg-private\./);
  assert.equal(JSON.stringify(audit).includes("Signature=secret"), false);
  assert.equal(JSON.stringify(audit).includes("OSSAccessKeyId"), false);

  const removed = await storage.delete({
    tenantId: "tenant-a",
    objectKey: KEY,
  });
  assert.equal(removed.deleted, true);
  assert.equal(
    await storage.head({ tenantId: "tenant-a", objectKey: KEY }),
    null,
  );
  assert.equal(removed.audit.sha256, SHA256);
  assert.equal(removed.audit.byteSize, BODY.byteLength);
});

test("tenant traversal, cross-tenant keys and TTL above 300 fail before signer", async () => {
  const client = new FakeOssClient();
  const storage = createAliyunOssStorageFromEnv(validEnv, client);
  for (const objectKey of [
    "staging/visionqa/tenant-b/assets/a.jpg",
    "staging/visionqa/tenant-a/../tenant-b/a.jpg",
    "tenant-a/a.jpg",
  ]) {
    await assert.rejects(
      () => storage.head({ tenantId: "tenant-a", objectKey }),
      (error: unknown) =>
        error instanceof ObjectStorageError && error.code === "FORBIDDEN",
    );
  }
  await assert.rejects(
    () =>
      storage.presignGet({
        tenantId: "tenant-a",
        objectKey: KEY,
        ttlSeconds: 301,
      }),
    (error: unknown) =>
      error instanceof ObjectStorageError &&
      error.code === "CONFIGURATION",
  );
  assert.equal(client.calls.length, 0);
});

test("presigned URL path is canonically bound to the requested object key", async () => {
  const client = new FakeOssClient();
  const storage = createAliyunOssStorageFromEnv(validEnv, client);
  const attacks = [
    `https://${validEnv.VISION_OSS_ENDPOINT_HOST}/staging/visionqa/tenant-b/assets/a.jpg?Signature=secret`,
    `https://${validEnv.VISION_OSS_ENDPOINT_HOST}/${KEY}?objectKey=staging%2Fvisionqa%2Ftenant-b%2Fa.jpg&Signature=secret`,
    `https://${validEnv.VISION_OSS_ENDPOINT_HOST}/staging%2Fvisionqa%2Ftenant-a%2Fassets%2Fasset-a%2F${SHA256}.jpg?Signature=secret`,
  ];
  for (const signedUrl of attacks) {
    client.signedUrlOverride = signedUrl;
    await assert.rejects(
      () =>
        storage.presignGet({
          tenantId: "tenant-a",
          objectKey: KEY,
          ttlSeconds: 300,
        }),
      (error: unknown) =>
        error instanceof ObjectStorageError &&
        error.code === "CONFIGURATION" &&
        !error.message.includes(signedUrl),
    );
  }
});

test("post-construction env and lifecycle result mutation cannot widen live config", async () => {
  const mutableEnv = { ...validEnv };
  const client = new FakeOssClient();
  const storage = createAliyunOssStorageFromEnv(mutableEnv, client);
  mutableEnv.VISION_OSS_REGION = "cn-shanghai";
  mutableEnv.VISION_OSS_LIFECYCLE_EXPIRATION_DAYS = "999";
  const lifecycle = await storage.lifecycleMetadata();
  lifecycle.expirationDays = 999;
  assert.deepEqual(await storage.lifecycleMetadata(), {
    prefix: "staging/visionqa/",
    expirationDays: 14,
    abortMultipartUploadDays: 1,
    versioning: "disabled",
  });
});

test("private URL service binds HMAC envelope to trusted HEAD SHA and byte size", async () => {
  const storage = new MockObjectStorage();
  await storage.put({
    tenantId: "tenant-a",
    objectKey: KEY,
    body: BODY,
    sha256: SHA256,
    byteSize: BODY.byteLength,
    mimeType: "image/jpeg",
  });
  const image = await issuePrivateImageReference(storage, {
    tenantId: "tenant-a",
    objectKey: KEY,
    role: "candidate",
    expectedAssetSha256: SHA256,
    expectedByteSize: BODY.byteLength,
    mimeType: "image/jpeg",
    nonce: "storage_test_nonce_123",
    hmacSecret: HMAC_SECRET,
  });
  await verifyPrivateImageEnvelope(image, HMAC_SECRET);
  assert.equal(image.privateEnvelope?.assetSha256, SHA256);
  assert.equal(image.privateEnvelope?.byteSize, BODY.byteLength);

  await assert.rejects(
    () =>
      issuePrivateImageReference(storage, {
        tenantId: "tenant-a",
        objectKey: KEY,
        role: "candidate",
        expectedAssetSha256: "b".repeat(64),
        expectedByteSize: BODY.byteLength,
        mimeType: "image/jpeg",
        nonce: "storage_test_nonce_456",
        hmacSecret: HMAC_SECRET,
      }),
    (error: unknown) =>
      error instanceof ObjectStorageError && error.code === "INTEGRITY",
  );
});

test("legacy r2_key remains readable while every new write is aliyun_oss", () => {
  assert.deepEqual(
    toStorageRecord({
      r2Key: "tenant/legacy/asset.jpg",
    }),
    {
      storageProvider: "cloudflare_r2_legacy",
      objectKey: "tenant/legacy/asset.jpg",
    },
  );
  assert.deepEqual(newStorageWrite(KEY), {
    storageProvider: "aliyun_oss",
    objectKey: KEY,
  });
});

test("OSS errors are classified without exposing provider payloads", () => {
  assert.equal(classifyOssError({ status: 403 }).code, "FORBIDDEN");
  assert.equal(classifyOssError({ code: "NoSuchKey" }).code, "NOT_FOUND");
  assert.equal(classifyOssError({ status: 409 }).code, "CONFLICT");
  assert.equal(
    classifyOssError({ code: "RequestTimeout" }).retryable,
    true,
  );
  assert.equal(classifyOssError({ status: 503 }).retryable, true);
});
