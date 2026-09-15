/**
 * Provider-neutral context for one product conversation.
 *
 * This module deliberately contains no React, persistence SDK, provider, or
 * image inspection code.  A context is the smallest unit that may be passed
 * between a mock adapter and a future real provider.
 */

export const PRODUCT_CONTEXT_SCHEMA = "visionqa-product-context-v1" as const;

export type ContextIdentity = {
  projectId: string;
  conversationId: string;
  productId: string;
};

export type ContextEntity = { id: string; name?: string };
export type ProductEntity = ContextEntity & { sku?: string };

export type SkuFactValue = string | number | boolean | null | string[];
export type SkuFacts = Record<string, SkuFactValue>;

export type SelectedAsset = {
  assetId: string;
  role: "truth" | "candidate" | "output";
  versionId?: string;
};

export type TaskState =
  | "intake"
  | "screened"
  | "repair"
  | "review"
  | "delivered"
  | "blocked";

export type ProductContext = {
  schema: typeof PRODUCT_CONTEXT_SCHEMA;
  project: ContextEntity;
  conversation: ContextEntity;
  product: ProductEntity;
  skuFacts: SkuFacts;
  selectedAssets: SelectedAsset[];
  taskState: TaskState;
  compactSummary: string;
  revision: number;
  updatedAt: string;
};

export type ProductContextInput = Omit<ProductContext, "schema" | "revision" | "updatedAt"> & {
  revision?: number;
  updatedAt?: string;
};

/** A patch is intentionally structured; arbitrary object spreading is not allowed. */
export type ProductContextPatch = {
  /** Optional identity assertion. Any supplied part must match the target context. */
  identity?: Partial<ContextIdentity>;
  projectId?: string;
  conversationId?: string;
  productId?: string;
  /** Optimistic concurrency guard. */
  baseRevision?: number;
  set?: {
    project?: Partial<ContextEntity>;
    conversation?: Partial<ContextEntity>;
    product?: Partial<ProductEntity>;
    skuFacts?: SkuFacts;
    selectedAssets?: SelectedAsset[];
    taskState?: TaskState;
    compactSummary?: string;
  };
  addSelectedAssets?: SelectedAsset[];
  removeSelectedAssetIds?: string[];
};

export class ProductContextError extends Error {
  readonly code:
    | "INVALID_CONTEXT"
    | "INVALID_PATCH"
    | "IDENTITY_MISMATCH"
    | "REVISION_CONFLICT"
    | "NOT_FOUND";

  constructor(code: ProductContextError["code"], message: string) {
    super(message);
    this.name = "ProductContextError";
    this.code = code;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, field: string, code: ProductContextError["code"] = "INVALID_CONTEXT"): string => {
  if (typeof value !== "string" || !value.trim() || value.includes("\u0000")) {
    throw new ProductContextError(code, `${field} must be a non-empty string`);
  }
  return value.trim();
};

const optionalText = (value: unknown, field: string, code: ProductContextError["code"] = "INVALID_CONTEXT"): string | undefined => {
  if (value === undefined) return undefined;
  return text(value, field, code);
};

function entity(value: unknown, field: string, allowSku = false): ContextEntity | ProductEntity {
  if (!isRecord(value)) throw new ProductContextError("INVALID_CONTEXT", `${field} must be an object`);
  const result: ContextEntity = { id: text(value.id, `${field}.id`) };
  const name = optionalText(value.name, `${field}.name`);
  if (name !== undefined) result.name = name;
  if (allowSku) {
    const sku = optionalText(value.sku, `${field}.sku`);
    if (sku !== undefined) (result as ProductEntity).sku = sku;
  }
  return result;
}

function skuFacts(value: unknown): SkuFacts {
  if (!isRecord(value)) throw new ProductContextError("INVALID_CONTEXT", "skuFacts must be an object");
  const result: SkuFacts = {};
  for (const [key, fact] of Object.entries(value)) {
    text(key, "skuFacts key");
    if (typeof fact === "string" || typeof fact === "number" || typeof fact === "boolean" || fact === null) {
      result[key] = fact;
    } else if (Array.isArray(fact) && fact.every(item => typeof item === "string")) {
      result[key] = [...fact];
    } else {
      throw new ProductContextError("INVALID_CONTEXT", `skuFacts.${key} has an unsupported value`);
    }
  }
  return result;
}

function assets(value: unknown): SelectedAsset[] {
  if (!Array.isArray(value)) throw new ProductContextError("INVALID_CONTEXT", "selectedAssets must be an array");
  return value.map((item, index) => {
    if (!isRecord(item)) throw new ProductContextError("INVALID_CONTEXT", `selectedAssets[${index}] must be an object`);
    const result: SelectedAsset = {
      assetId: text(item.assetId, `selectedAssets[${index}].assetId`),
      role: item.role as SelectedAsset["role"],
    };
    if (!["truth", "candidate", "output"].includes(result.role)) {
      throw new ProductContextError("INVALID_CONTEXT", `selectedAssets[${index}].role is invalid`);
    }
    const versionId = optionalText(item.versionId, `selectedAssets[${index}].versionId`);
    if (versionId !== undefined) result.versionId = versionId;
    return result;
  });
}

function iso(value: unknown, field: string): string {
  const result = text(value, field);
  const date = new Date(result);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== result) {
    throw new ProductContextError("INVALID_CONTEXT", `${field} must be an ISO timestamp`);
  }
  return result;
}

function revision(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new ProductContextError("INVALID_CONTEXT", "revision must be a non-negative integer");
  }
  return value as number;
}

function identityOf(context: ProductContext): ContextIdentity {
  return { projectId: context.project.id, conversationId: context.conversation.id, productId: context.product.id };
}

export function validateProductContext(value: unknown): ProductContext {
  if (!isRecord(value) || value.schema !== PRODUCT_CONTEXT_SCHEMA) {
    throw new ProductContextError("INVALID_CONTEXT", "context schema is unsupported or missing");
  }
  if (typeof value.taskState !== "string" || !["intake", "screened", "repair", "review", "delivered", "blocked"].includes(value.taskState)) {
    throw new ProductContextError("INVALID_CONTEXT", "taskState is invalid");
  }
  const summary = text(value.compactSummary, "compactSummary");
  const result: ProductContext = {
    schema: PRODUCT_CONTEXT_SCHEMA,
    project: entity(value.project, "project"),
    conversation: entity(value.conversation, "conversation"),
    product: entity(value.product, "product", true) as ProductEntity,
    skuFacts: skuFacts(value.skuFacts),
    selectedAssets: assets(value.selectedAssets),
    taskState: value.taskState as TaskState,
    compactSummary: summary,
    revision: revision(value.revision),
    updatedAt: iso(value.updatedAt, "updatedAt"),
  };
  return structuredClone(result);
}

export function createProductContext(input: ProductContextInput): ProductContext {
  if (!isRecord(input)) throw new ProductContextError("INVALID_CONTEXT", "context input must be an object");
  const now = new Date().toISOString();
  return validateProductContext({ ...input, schema: PRODUCT_CONTEXT_SCHEMA, revision: input.revision ?? 0, updatedAt: input.updatedAt ?? now });
}

function patchIdentity(patch: ProductContextPatch): Partial<ContextIdentity> {
  if (!isRecord(patch)) throw new ProductContextError("INVALID_PATCH", "patch must be an object");
  const identity: Partial<ContextIdentity> = { ...(patch.identity ?? {}) };
  for (const key of ["projectId", "conversationId", "productId"] as const) {
    const direct = patch[key];
    if (direct !== undefined) {
      if (identity[key] !== undefined && identity[key] !== direct) throw new ProductContextError("INVALID_PATCH", `patch identity has conflicting ${key}`);
      identity[key] = direct;
    }
    if (identity[key] !== undefined) text(identity[key], `patch.${key}`, "INVALID_PATCH");
  }
  return identity;
}

function assertIdentity(context: ProductContext, patch: ProductContextPatch): void {
  const actual = identityOf(context);
  for (const [key, expected] of Object.entries(patchIdentity(patch)) as [keyof ContextIdentity, string][]) {
    if (expected !== actual[key]) throw new ProductContextError("IDENTITY_MISMATCH", `patch ${key} does not belong to this product context`);
  }
  if (patch.baseRevision !== undefined && (!Number.isInteger(patch.baseRevision) || patch.baseRevision < 0)) {
    throw new ProductContextError("INVALID_PATCH", "baseRevision must be a non-negative integer");
  }
  if (patch.baseRevision !== undefined && patch.baseRevision !== context.revision) {
    throw new ProductContextError("REVISION_CONFLICT", "context revision changed; reload before applying this patch");
  }
}

export function mergeProductContext(context: ProductContext, patch: ProductContextPatch, now = new Date().toISOString()): ProductContext {
  const current = validateProductContext(context);
  assertIdentity(current, patch);
  if (!isRecord(patch.set ?? {})) throw new ProductContextError("INVALID_PATCH", "patch.set must be an object");
  const set = patch.set ?? {};
  const nextAssets = [...current.selectedAssets];
  const remove = patch.removeSelectedAssetIds ?? [];
  if (!Array.isArray(remove) || remove.some(id => typeof id !== "string" || !id.trim())) throw new ProductContextError("INVALID_PATCH", "removeSelectedAssetIds must contain asset ids");
  const filtered = nextAssets.filter(asset => !remove.includes(asset.assetId));
  if (patch.addSelectedAssets !== undefined) {
    const added = assets(patch.addSelectedAssets);
    const ids = new Set(filtered.map(asset => asset.assetId));
    for (const asset of added) {
      if (ids.has(asset.assetId)) throw new ProductContextError("INVALID_PATCH", `selected asset ${asset.assetId} already exists`);
      ids.add(asset.assetId); filtered.push(asset);
    }
  }
  const next: ProductContext = {
    ...current,
    project: set.project ? entity({ ...current.project, ...set.project }, "project") : current.project,
    conversation: set.conversation ? entity({ ...current.conversation, ...set.conversation }, "conversation") : current.conversation,
    product: set.product ? entity({ ...current.product, ...set.product }, "product", true) as ProductEntity : current.product,
    skuFacts: set.skuFacts === undefined ? current.skuFacts : skuFacts(set.skuFacts),
    selectedAssets: set.selectedAssets === undefined ? filtered : assets(set.selectedAssets),
    taskState: set.taskState === undefined ? current.taskState : set.taskState,
    compactSummary: set.compactSummary === undefined ? current.compactSummary : text(set.compactSummary, "patch.set.compactSummary", "INVALID_PATCH"),
    revision: current.revision + 1,
    updatedAt: iso(now, "updatedAt"),
  };
  // A patch may update descriptive fields, but may never retarget the context.
  if (next.project.id !== current.project.id || next.conversation.id !== current.conversation.id || next.product.id !== current.product.id) {
    throw new ProductContextError("IDENTITY_MISMATCH", "context identity cannot be changed by a patch");
  }
  return validateProductContext(next);
}

export const applyProductContextPatch = mergeProductContext;

export type ProductContextAdapter = {
  get(identity: ContextIdentity): ProductContext | null;
  save(context: ProductContext): ProductContext;
  patch(identity: ContextIdentity, patch: ProductContextPatch, now?: string): ProductContext;
  all(): ProductContext[];
};

const identityKey = (identity: ContextIdentity): string => `${identity.projectId}\u0000${identity.conversationId}\u0000${identity.productId}`;

/** A deterministic, process-local adapter for tests and the mock UI. */
export function createInMemoryProductContextAdapter(initial: ProductContext | ProductContext[] = []): ProductContextAdapter {
  const store = new Map<string, ProductContext>();
  const values = Array.isArray(initial) ? initial : [initial];
  for (const value of values) {
    const context = validateProductContext(value);
    const key = identityKey(identityOf(context));
    if (store.has(key)) throw new ProductContextError("INVALID_CONTEXT", "duplicate product context identity");
    store.set(key, context);
  }
  return {
    get(identity) {
      const projectId = text(identity.projectId, "identity.projectId");
      const conversationId = text(identity.conversationId, "identity.conversationId");
      const productId = text(identity.productId, "identity.productId");
      const found = store.get(identityKey({ projectId, conversationId, productId }));
      return found ? structuredClone(found) : null;
    },
    save(value) {
      const context = validateProductContext(value);
      const key = identityKey(identityOf(context));
      const current = store.get(key);
      if (current && context.revision <= current.revision) throw new ProductContextError("REVISION_CONFLICT", "context revision must increase when saving");
      store.set(key, context);
      return structuredClone(context);
    },
    patch(identity, patch, now) {
      const current = this.get(identity);
      if (!current) throw new ProductContextError("NOT_FOUND", "product context was not found");
      const next = mergeProductContext(current, { ...patch, identity }, now);
      return this.save(next);
    },
    all() {
      return [...store.values()].map(value => structuredClone(value));
    },
  };
}
