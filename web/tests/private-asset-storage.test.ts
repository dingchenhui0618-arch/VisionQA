import assert from "node:assert/strict";
import test from "node:test";
import { PrivateAssetStorage, hashBytes } from "../lib/beta/private-asset-storage.ts";
import type { BetaAsset } from "../lib/beta/contracts.ts";
import { ObjectStorageError, type ObjectStorage, type StoredObjectMetadata } from "../lib/storage/object-storage.ts";

const NOW = new Date("2026-09-16T00:00:00.000Z");
const BODY = new Uint8Array([1, 2, 3]);
const SHA = hashBytes(BODY);

function asset(overrides: Partial<BetaAsset> = {}): BetaAsset {
  return {
    id: "ast_1", tenantId: "tenant-a", projectId: "project-1", role: "CANDIDATE",
    fileName: "shirt.png", mimeType: "image/png", byteSize: BODY.byteLength,
    width: 100, height: 100, sha256: null,
    objectKey: "staging/visionqa/tenant-a/ast_1.png", uploadStatus: "PENDING",
    retentionUntil: "2026-09-23T00:00:00.000Z", createdAt: NOW.toISOString(), ...overrides,
  };
}

class FakeStorage implements ObjectStorage {
  readonly provider = "memory" as const;
  readonly calls: string[] = [];
  metadata: StoredObjectMetadata | null = null;
  metadataProvider: StoredObjectMetadata["provider"] = "memory";
  metadataEncryption: StoredObjectMetadata["encryption"] = "SSE-OSS";
  signed = 0;
  async put(input: Parameters<ObjectStorage["put"]>[0]): Promise<StoredObjectMetadata> {
    this.calls.push("put");
    this.metadata = { provider: this.metadataProvider, region: "local", bucket: "fake", objectKey: input.objectKey,
      sha256: input.sha256, byteSize: input.byteSize, mimeType: input.mimeType, encryption: "SSE-OSS",
      retentionUntil: input.retentionUntil };
    this.metadata.encryption = this.metadataEncryption;
    return { ...this.metadata };
  }
  async head(): Promise<StoredObjectMetadata | null> { this.calls.push("head"); return this.metadata && { ...this.metadata }; }
  async presignGet(input: { tenantId: string; objectKey: string; ttlSeconds: number }) {
    this.calls.push("presign"); this.signed = input.ttlSeconds;
    return { url: "https://fake.invalid/signed", expiresAt: new Date(NOW.getTime() + input.ttlSeconds * 1000).toISOString() };
  }
  async delete(): Promise<{ deleted: boolean; audit: never }> { this.calls.push("delete"); return { deleted: true, audit: undefined as never }; }
  async lifecycleMetadata() { return { prefix: "staging/visionqa/" as const, expirationDays: 14, abortMultipartUploadDays: 1, versioning: "disabled" as const }; }
}

const bridge = (storage: FakeStorage, clock = NOW) => new PrivateAssetStorage(storage, () => new Date(clock));

test("PUT validates bytes, then HEADs metadata before returning READY", async () => {
  const storage = new FakeStorage();
  const result = await bridge(storage).put("tenant-a", asset(), BODY);
  assert.equal(result.uploadStatus, "READY");
  assert.equal(result.sha256, SHA);
  assert.deepEqual(storage.calls, ["put", "head"]);
});

test("wrong tenant and invalid bytes fail before signing/storage", async () => {
  const storage = new FakeStorage();
  await assert.rejects(() => bridge(storage).put("tenant-b", asset(), BODY), (e: unknown) => e instanceof ObjectStorageError && e.code === "FORBIDDEN");
  await assert.rejects(() => bridge(storage).put("tenant-a", asset(), new Uint8Array([1])), (e: unknown) => e instanceof ObjectStorageError && e.code === "INTEGRITY");
  assert.deepEqual(storage.calls, []);
});

test("PENDING asset SHA mismatch fails before PUT", async () => {
  const storage = new FakeStorage();
  await assert.rejects(() => bridge(storage).put("tenant-a", asset({ sha256: "b".repeat(64) }), BODY), (e: unknown) => e instanceof ObjectStorageError && e.code === "INTEGRITY");
  assert.deepEqual(storage.calls, []);
});

test("PUT rejects provider or encryption drift from the configured storage", async () => {
  for (const change of ["provider", "encryption"] as const) {
    const storage = new FakeStorage();
    if (change === "provider") storage.metadataProvider = "aliyun_oss";
    else storage.metadataEncryption = "OTHER" as StoredObjectMetadata["encryption"];
    await assert.rejects(() => bridge(storage).put("tenant-a", asset(), BODY), (e: unknown) => e instanceof ObjectStorageError && e.code === "INTEGRITY");
  }
});

test("expired and non-ready assets cannot download or sign", async () => {
  const storage = new FakeStorage();
  await assert.rejects(() => bridge(storage).download("tenant-a", asset({ retentionUntil: "2026-09-15T23:59:59Z" })), /expired/);
  await assert.rejects(() => bridge(storage).download("tenant-a", asset()), /ready/);
  assert.equal(storage.signed, 0);
});

test("download TTL is capped by 300 seconds and retention period", async () => {
  const storage = new FakeStorage();
  const ready = asset({ uploadStatus: "READY", sha256: SHA, retentionUntil: "2026-09-16T00:04:00.000Z" });
  storage.metadata = { provider: "memory", region: "local", bucket: "fake", objectKey: ready.objectKey,
    sha256: SHA, byteSize: ready.byteSize, mimeType: ready.mimeType, encryption: "SSE-OSS",
    retentionUntil: ready.retentionUntil };
  const result = await bridge(storage).download("tenant-a", ready, 300);
  assert.equal(storage.signed, 240);
  assert.equal(result.url, "https://fake.invalid/signed");
  await assert.rejects(() => bridge(storage).download("tenant-a", ready, 301), (e: unknown) => e instanceof ObjectStorageError && e.code === "CONFIGURATION");
});

test("delete is idempotent and delegates to existing storage", async () => {
  const storage = new FakeStorage();
  const result = await bridge(storage).delete("tenant-a", asset());
  assert.equal(result.asset.uploadStatus, "DELETED");
  assert.equal(result.storage.deleted, true);
  assert.deepEqual(storage.calls, ["delete"]);
});
