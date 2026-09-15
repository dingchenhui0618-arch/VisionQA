import type { Conversation } from "./mock-contract.ts";
import { createProductContext, type ProductContext } from "./product-context.ts";
import { createVersionTree, type VersionTree } from "./version-tree.ts";

const MOCK_TIME = "1970-01-01T00:00:00.000Z";

/**
 * Projects the browser-only mock state into the same provider-neutral context
 * contract used by the future server-backed agent. It never upgrades mock
 * evidence into a real project, asset or review record.
 */
export function productContextFromMock(conversation: Conversation): ProductContext {
  return createProductContext({
    project: { id: `mock-project:${conversation.id}`, name: conversation.name },
    conversation: { id: conversation.id, name: conversation.name },
    product: { id: `mock-product:${conversation.id}`, name: conversation.name, sku: conversation.name },
    skuFacts: {},
    selectedAssets: conversation.assets.map((asset) => ({ assetId: asset.id, role: asset.role })),
    taskState: conversation.stage === "delivered" ? "delivered" : conversation.stage,
    compactSummary: `${conversation.name}；${conversation.assets.length} 张素材；${conversation.versions.length} 个模拟版本。`,
    revision: conversation.revision,
    updatedAt: MOCK_TIME,
  });
}

export function versionTreeFromMock(conversation: Conversation, assetId: string): VersionTree {
  const asset = conversation.assets.find((entry) => entry.id === assetId);
  if (!asset) throw new Error("Mock asset does not belong to this product conversation");
  const productId = `mock-product:${conversation.id}`;
  const originalId = `mock-original:${asset.id}`;
  const versions = conversation.versions.filter((entry) => entry.assetId === asset.id);
  return createVersionTree({
    projectId: `mock-project:${conversation.id}`,
    conversationId: conversation.id,
    productId,
    activeVersionId: conversation.viewingVersionId && versions.some((entry) => entry.id === conversation.viewingVersionId)
      ? conversation.viewingVersionId : originalId,
    versions: [{
      id: originalId,
      productId,
      assetId: asset.id,
      kind: "original",
      parentVersionId: null,
      sourceUrl: asset.url,
      outputUrl: asset.url,
      instruction: "模拟原图",
      createdAt: MOCK_TIME,
      confirmations: [],
    }, ...versions.map((entry) => ({
      id: entry.id,
      productId,
      assetId: entry.assetId,
      kind: "repair" as const,
      parentVersionId: entry.sourceVersionId ?? originalId,
      sourceUrl: entry.sourceUrl,
      outputUrl: entry.outputUrl,
      instruction: entry.instruction,
      createdAt: MOCK_TIME,
      confirmations: entry.reviewed ? [{
        id: `mock-review:${entry.id}`,
        reviewerId: "mock-user",
        decision: "approved" as const,
        note: "MOCK_ONLY interaction confirmation",
        confirmedAt: MOCK_TIME,
      }] : [],
    }))],
    revision: conversation.revision,
    updatedAt: MOCK_TIME,
  });
}
