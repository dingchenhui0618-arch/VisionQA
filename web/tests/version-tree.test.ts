import test from "node:test";
import assert from "node:assert/strict";
import {
  VersionTreeError,
  addOriginalVersion,
  addRepairVersion,
  createInMemoryVersionTreeAdapter,
  createVersionTree,
  recordHumanConfirmation,
  validateVersionTree,
} from "../lib/agent/version-tree.ts";

const T0 = "2026-01-01T00:00:00.000Z";
const tree = () => createVersionTree({ projectId: "project-a", conversationId: "conversation-a", productId: "product-a", activeVersionId: null, versions: [], revision: 0, updatedAt: T0 });
const originalInput = { id: "v0", productId: "product-a", assetId: "asset-a", sourceUrl: "original", outputUrl: "original", instruction: "原始素材", createdAt: T0 };

test("version tree preserves original to repair parent-child lineage", () => {
  const original = addOriginalVersion(tree(), originalInput, T0);
  const repaired = addRepairVersion(original, { id: "v1", productId: "product-a", assetId: "asset-a", parentVersionId: "v0", sourceUrl: "original", outputUrl: "repair-1", instruction: "修正袖口", createdAt: "2026-01-01T00:00:01.000Z" }, "2026-01-01T00:00:01.000Z");
  assert.equal(repaired.activeVersionId, "v1");
  assert.equal(repaired.versions[0].kind, "original");
  assert.equal(repaired.versions[1].kind, "repair");
  assert.equal(repaired.versions[1].parentVersionId, "v0");
  assert.deepEqual(repaired.versions[1].confirmations, []);
});

test("human confirmation is per version and never inherited by a repair", () => {
  const original = addOriginalVersion(tree(), originalInput, T0);
  const approved = recordHumanConfirmation(original, "v0", { id: "review-0", reviewerId: "human-a", decision: "approved", note: "商品信息一致" }, "2026-01-01T00:00:01.000Z");
  const repair = addRepairVersion(approved, { id: "v1", productId: "product-a", assetId: "asset-a", parentVersionId: "v0", sourceUrl: "original", outputUrl: "repair-1", instruction: "修正袖口", createdAt: "2026-01-01T00:00:02.000Z" }, "2026-01-01T00:00:02.000Z");
  assert.equal(repair.versions[0].confirmations[0].decision, "approved");
  assert.deepEqual(repair.versions[1].confirmations, []);
});

test("version tree fails closed on cross-product parent, dangling active version, and malformed lineage", () => {
  const original = addOriginalVersion(tree(), originalInput, T0);
  assert.throws(() => addRepairVersion(original, { id: "foreign", productId: "product-b", assetId: "asset-a", parentVersionId: "v0", sourceUrl: "original", outputUrl: "foreign", instruction: "越界", createdAt: T0 }), (error: unknown) => error instanceof VersionTreeError && error.code === "IDENTITY_MISMATCH");
  assert.throws(() => validateVersionTree({ ...original, activeVersionId: "missing" }), /activeVersionId/);
  assert.throws(() => validateVersionTree({ ...original, versions: [{ ...original.versions[0], kind: "repair", parentVersionId: "missing" }] }), /parent version/);
});

test("version tree rejects multi-node parent cycles", () => {
  const original = addOriginalVersion(tree(), originalInput, T0);
  const one = addRepairVersion(original, { id: "v1", productId: "product-a", assetId: "asset-a", parentVersionId: "v0", sourceUrl: "original", outputUrl: "repair-1", instruction: "first", createdAt: "2026-01-01T00:00:01.000Z" }, "2026-01-01T00:00:01.000Z");
  const two = addRepairVersion(one, { id: "v2", productId: "product-a", assetId: "asset-a", parentVersionId: "v1", sourceUrl: "repair-1", outputUrl: "repair-2", instruction: "second", createdAt: "2026-01-01T00:00:02.000Z" }, "2026-01-01T00:00:02.000Z");
  const cyclic = { ...two, versions: two.versions.map(item => item.id === "v1" ? { ...item, parentVersionId: "v2" } : item) };
  assert.throws(() => validateVersionTree(cyclic), /cycle/);
});

test("in-memory version adapter keeps trees isolated and rejects stale saves", () => {
  const adapter = createInMemoryVersionTreeAdapter(tree());
  const added = adapter.addOriginal("project-a", "conversation-a", originalInput, T0);
  assert.equal(added.activeVersionId, "v0");
  assert.equal(adapter.get("project-a", "conversation-a", "product-b"), null);
  const copy = adapter.get("project-a", "conversation-a", "product-a")!;
  copy.versions[0].outputUrl = "tampered";
  assert.equal(adapter.get("project-a", "conversation-a", "product-a")!.versions[0].outputUrl, "original");
  assert.throws(() => adapter.confirm("project-a", "conversation-a", "product-b", "v0", { id: "review-x", reviewerId: "human", decision: "approved", note: "wrong product" }), /not found/);
  assert.throws(() => adapter.save(added), (error: unknown) => error instanceof VersionTreeError && error.code === "REVISION_CONFLICT");
});
