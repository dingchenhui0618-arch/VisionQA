import test from "node:test";
import assert from "node:assert/strict";
import {
  ProductContextError,
  createInMemoryProductContextAdapter,
  createProductContext,
  mergeProductContext,
} from "../lib/agent/product-context.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const base = () => createProductContext({
  project: { id: "project-a", name: "VisionQA" },
  conversation: { id: "conversation-a", name: "春季开衫" },
  product: { id: "product-a", name: "灰色针织开衫", sku: "SKU-A" },
  skuFacts: { color: "灰色", sizes: ["S", "M"], buttons: 5 },
  selectedAssets: [{ assetId: "truth-a", role: "truth" }],
  taskState: "intake",
  compactSummary: "待准备参考图与待检查图",
  revision: 0,
  updatedAt: NOW,
});

test("product context has stable identity, revision and structured patch merge", () => {
  const context = base();
  const next = mergeProductContext(context, {
    baseRevision: 0,
    identity: { projectId: "project-a", conversationId: "conversation-a", productId: "product-a" },
    set: { taskState: "screened", compactSummary: "已完成初步筛查" },
    addSelectedAssets: [{ assetId: "candidate-a", role: "candidate" }],
  }, "2026-01-01T00:00:01.000Z");
  assert.equal(next.revision, 1);
  assert.equal(next.updatedAt, "2026-01-01T00:00:01.000Z");
  assert.equal(next.taskState, "screened");
  assert.deepEqual(next.selectedAssets.map(asset => asset.assetId), ["truth-a", "candidate-a"]);
  assert.deepEqual(context.selectedAssets.map(asset => asset.assetId), ["truth-a"]);
});

test("context patch fails closed for another product and stale revision", () => {
  const context = base();
  assert.throws(() => mergeProductContext(context, { identity: { productId: "product-b" } }), (error: unknown) => error instanceof ProductContextError && error.code === "IDENTITY_MISMATCH");
  assert.throws(() => mergeProductContext(context, { baseRevision: 4 }), (error: unknown) => error instanceof ProductContextError && error.code === "REVISION_CONFLICT");
  assert.throws(() => mergeProductContext(context, { set: { compactSummary: "" } }), (error: unknown) => error instanceof ProductContextError && error.code === "INVALID_PATCH");
});

test("in-memory context adapter isolates identities and returns defensive copies", () => {
  const adapter = createInMemoryProductContextAdapter(base());
  const identity = { projectId: "project-a", conversationId: "conversation-a", productId: "product-a" };
  const loaded = adapter.get(identity)!;
  loaded.skuFacts.color = "被篡改";
  assert.equal(adapter.get(identity)!.skuFacts.color, "灰色");
  const next = adapter.patch(identity, { baseRevision: 0, set: { taskState: "repair" } }, "2026-01-01T00:00:02.000Z");
  assert.equal(next.revision, 1);
  assert.equal(adapter.get({ ...identity, productId: "product-b" }), null);
  assert.throws(() => adapter.patch({ ...identity, productId: "product-b" }, { set: { taskState: "blocked" } }), /not found/);
});
