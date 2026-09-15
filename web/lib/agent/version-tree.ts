/** Version lineage and human review state for one product asset. */

export const VERSION_TREE_SCHEMA = "visionqa-version-tree-v1" as const;

export type VersionKind = "original" | "repair";
export type HumanDecision = "approved" | "rejected" | "needs_review";

export type HumanConfirmation = {
  id: string;
  reviewerId: string;
  decision: HumanDecision;
  note: string;
  confirmedAt: string;
};

export type VersionNode = {
  id: string;
  productId: string;
  assetId: string;
  kind: VersionKind;
  parentVersionId: string | null;
  sourceUrl: string;
  outputUrl: string;
  instruction: string;
  createdAt: string;
  confirmations: HumanConfirmation[];
};

export type VersionTree = {
  schema: typeof VERSION_TREE_SCHEMA;
  projectId: string;
  conversationId: string;
  productId: string;
  activeVersionId: string | null;
  versions: VersionNode[];
  revision: number;
  updatedAt: string;
};

export type NewOriginalVersion = Omit<VersionNode, "kind" | "parentVersionId" | "confirmations"> & {
  kind?: "original";
};

export type NewRepairVersion = Omit<VersionNode, "kind" | "confirmations"> & {
  kind?: "repair";
  parentVersionId: string;
};

export class VersionTreeError extends Error {
  readonly code: "INVALID_TREE" | "INVALID_VERSION" | "IDENTITY_MISMATCH" | "NOT_FOUND" | "REVISION_CONFLICT";
  constructor(code: VersionTreeError["code"], message: string) {
    super(message);
    this.name = "VersionTreeError";
    this.code = code;
  }
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim() || value.includes("\u0000")) throw new VersionTreeError("INVALID_TREE", `${field} must be a non-empty string`);
  return value.trim();
};
const nullableText = (value: unknown, field: string): string | null => value === null ? null : text(value, field);
const timestamp = (value: unknown, field: string): string => {
  const result = text(value, field);
  const date = new Date(result);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== result) throw new VersionTreeError("INVALID_TREE", `${field} must be an ISO timestamp`);
  return result;
};
const nonNegativeInt = (value: unknown, field: string): number => {
  if (!Number.isInteger(value) || (value as number) < 0) throw new VersionTreeError("INVALID_TREE", `${field} must be a non-negative integer`);
  return value as number;
};

function confirmation(value: unknown, field: string): HumanConfirmation {
  if (!record(value)) throw new VersionTreeError("INVALID_VERSION", `${field} must be an object`);
  const decision = value.decision;
  if (decision !== "approved" && decision !== "rejected" && decision !== "needs_review") throw new VersionTreeError("INVALID_VERSION", `${field}.decision is invalid`);
  return {
    id: text(value.id, `${field}.id`), reviewerId: text(value.reviewerId, `${field}.reviewerId`),
    decision, note: text(value.note, `${field}.note`), confirmedAt: timestamp(value.confirmedAt, `${field}.confirmedAt`),
  };
}

function version(value: unknown, field: string): VersionNode {
  if (!record(value)) throw new VersionTreeError("INVALID_VERSION", `${field} must be an object`);
  if (value.kind !== "original" && value.kind !== "repair") throw new VersionTreeError("INVALID_VERSION", `${field}.kind is invalid`);
  if (value.kind === "original" && value.parentVersionId !== null) throw new VersionTreeError("INVALID_VERSION", `${field} original must not have a parent`);
  if (value.kind === "repair" && typeof value.parentVersionId !== "string") throw new VersionTreeError("INVALID_VERSION", `${field} repair requires a parent`);
  if (!Array.isArray(value.confirmations)) throw new VersionTreeError("INVALID_VERSION", `${field}.confirmations must be an array`);
  const confirmations = value.confirmations.map((item, index) => confirmation(item, `${field}.confirmations[${index}]`));
  const ids = new Set<string>();
  for (const item of confirmations) {
    if (ids.has(item.id)) throw new VersionTreeError("INVALID_VERSION", `${field} contains duplicate confirmation ids`);
    ids.add(item.id);
  }
  return {
    id: text(value.id, `${field}.id`), productId: text(value.productId, `${field}.productId`), assetId: text(value.assetId, `${field}.assetId`),
    kind: value.kind, parentVersionId: nullableText(value.parentVersionId, `${field}.parentVersionId`),
    sourceUrl: text(value.sourceUrl, `${field}.sourceUrl`), outputUrl: text(value.outputUrl, `${field}.outputUrl`),
    instruction: text(value.instruction, `${field}.instruction`), createdAt: timestamp(value.createdAt, `${field}.createdAt`), confirmations,
  };
}

export function validateVersionTree(value: unknown): VersionTree {
  if (!record(value) || value.schema !== VERSION_TREE_SCHEMA) throw new VersionTreeError("INVALID_TREE", "version tree schema is unsupported or missing");
  if (!Array.isArray(value.versions)) throw new VersionTreeError("INVALID_TREE", "versions must be an array");
  const result: VersionTree = {
    schema: VERSION_TREE_SCHEMA, projectId: text(value.projectId, "projectId"), conversationId: text(value.conversationId, "conversationId"), productId: text(value.productId, "productId"),
    activeVersionId: value.activeVersionId === null ? null : text(value.activeVersionId, "activeVersionId"), versions: value.versions.map((item, index) => version(item, `versions[${index}]`)),
    revision: nonNegativeInt(value.revision, "revision"), updatedAt: timestamp(value.updatedAt, "updatedAt"),
  };
  const ids = new Set<string>();
  for (const item of result.versions) {
    if (ids.has(item.id)) throw new VersionTreeError("INVALID_TREE", `duplicate version id ${item.id}`);
    ids.add(item.id);
    if (item.productId !== result.productId) throw new VersionTreeError("IDENTITY_MISMATCH", "version belongs to another product");
    if (item.kind === "repair") {
      const parent = item.parentVersionId ? result.versions.find(candidate => candidate.id === item.parentVersionId) : undefined;
      if (!parent) throw new VersionTreeError("INVALID_VERSION", `parent version ${item.parentVersionId} does not exist`);
      if (parent.productId !== item.productId || parent.assetId !== item.assetId) throw new VersionTreeError("IDENTITY_MISMATCH", "parent version belongs to another product or asset");
      if (parent.id === item.id) throw new VersionTreeError("INVALID_VERSION", "a version cannot parent itself");
    }
  }
  const byId = new Map(result.versions.map(item => [item.id, item]));
  for (const item of result.versions) {
    const visited = new Set<string>();
    let current: VersionNode | undefined = item;
    while (current?.parentVersionId) {
      if (visited.has(current.id)) throw new VersionTreeError("INVALID_VERSION", "version lineage contains a cycle");
      visited.add(current.id);
      current = byId.get(current.parentVersionId);
    }
  }
  if (result.activeVersionId !== null && !ids.has(result.activeVersionId)) throw new VersionTreeError("INVALID_TREE", "activeVersionId does not exist");
  return structuredClone(result);
}

export function createVersionTree(input: Omit<VersionTree, "schema" | "revision" | "updatedAt"> & { revision?: number; updatedAt?: string }): VersionTree {
  const now = new Date().toISOString();
  return validateVersionTree({ ...input, schema: VERSION_TREE_SCHEMA, revision: input.revision ?? 0, updatedAt: input.updatedAt ?? now });
}

function assertTreeIdentity(tree: VersionTree, productId: string): void {
  if (text(productId, "productId") !== tree.productId) throw new VersionTreeError("IDENTITY_MISMATCH", "version does not belong to this product tree");
}

function nextTree(tree: VersionTree, versions: VersionNode[], activeVersionId: string | null, now: string): VersionTree {
  return validateVersionTree({ ...tree, versions, activeVersionId, revision: tree.revision + 1, updatedAt: timestamp(now, "updatedAt") });
}

export function addOriginalVersion(tree: VersionTree, input: NewOriginalVersion, now = new Date().toISOString()): VersionTree {
  const current = validateVersionTree(tree);
  assertTreeIdentity(current, input.productId);
  if (input.kind !== undefined && input.kind !== "original") throw new VersionTreeError("INVALID_VERSION", "original version kind is invalid");
  if (current.versions.some(item => item.id === input.id)) throw new VersionTreeError("INVALID_VERSION", `duplicate version id ${input.id}`);
  const item = version({ ...input, kind: "original", parentVersionId: null, confirmations: [] }, "original");
  return nextTree(current, [...current.versions, item], item.id, now);
}

export function addRepairVersion(tree: VersionTree, input: NewRepairVersion, now = new Date().toISOString()): VersionTree {
  const current = validateVersionTree(tree);
  assertTreeIdentity(current, input.productId);
  if (input.kind !== undefined && input.kind !== "repair") throw new VersionTreeError("INVALID_VERSION", "repair version kind is invalid");
  if (current.versions.some(item => item.id === input.id)) throw new VersionTreeError("INVALID_VERSION", `duplicate version id ${input.id}`);
  const parent = current.versions.find(item => item.id === input.parentVersionId);
  if (!parent) throw new VersionTreeError("NOT_FOUND", "parent version does not exist in this product tree");
  if (parent.productId !== input.productId || parent.assetId !== input.assetId) throw new VersionTreeError("IDENTITY_MISMATCH", "repair parent is not for this product asset");
  // Always start a repair without approvals. Human confirmation is never inherited.
  const item = version({ ...input, kind: "repair", confirmations: [] }, "repair");
  return nextTree(current, [...current.versions, item], item.id, now);
}

export function setActiveVersion(tree: VersionTree, versionId: string, now = new Date().toISOString()): VersionTree {
  const current = validateVersionTree(tree);
  const item = current.versions.find(candidate => candidate.id === versionId);
  if (!item) throw new VersionTreeError("NOT_FOUND", "version does not exist in this product tree");
  return nextTree(current, current.versions, item.id, now);
}

export function recordHumanConfirmation(tree: VersionTree, versionId: string, input: Omit<HumanConfirmation, "confirmedAt"> & { confirmedAt?: string }, now = new Date().toISOString()): VersionTree {
  const current = validateVersionTree(tree);
  const item = current.versions.find(candidate => candidate.id === versionId);
  if (!item) throw new VersionTreeError("NOT_FOUND", "version does not exist in this product tree");
  const confirmation = version({ ...item, confirmations: [...item.confirmations, { ...input, confirmedAt: input.confirmedAt ?? now }] }, "version").confirmations.at(-1)!;
  if (item.confirmations.some(existing => existing.id === confirmation.id)) throw new VersionTreeError("INVALID_VERSION", `duplicate confirmation id ${confirmation.id}`);
  const versions = current.versions.map(candidate => candidate.id === versionId ? { ...candidate, confirmations: [...candidate.confirmations, confirmation] } : candidate);
  return nextTree(current, versions, current.activeVersionId, now);
}

export type VersionTreeAdapter = {
  get(projectId: string, conversationId: string, productId: string): VersionTree | null;
  save(tree: VersionTree): VersionTree;
  addOriginal(projectId: string, conversationId: string, input: NewOriginalVersion, now?: string): VersionTree;
  addRepair(projectId: string, conversationId: string, input: NewRepairVersion, now?: string): VersionTree;
  confirm(projectId: string, conversationId: string, productId: string, versionId: string, input: Omit<HumanConfirmation, "confirmedAt"> & { confirmedAt?: string }, now?: string): VersionTree;
};

const keyOf = (projectId: string, conversationId: string, productId: string) => `${projectId}\u0000${conversationId}\u0000${productId}`;

export function createInMemoryVersionTreeAdapter(initial: VersionTree | VersionTree[] = []): VersionTreeAdapter {
  const store = new Map<string, VersionTree>();
  for (const item of (Array.isArray(initial) ? initial : [initial])) {
    const tree = validateVersionTree(item);
    const key = keyOf(tree.projectId, tree.conversationId, tree.productId);
    if (store.has(key)) throw new VersionTreeError("INVALID_TREE", "duplicate version tree identity");
    store.set(key, tree);
  }
  const getRequired = (projectId: string, conversationId: string, productId: string): VersionTree => {
    const tree = store.get(keyOf(text(projectId, "projectId"), text(conversationId, "conversationId"), text(productId, "productId")));
    if (!tree) throw new VersionTreeError("NOT_FOUND", "version tree was not found");
    return structuredClone(tree);
  };
  return {
    get(projectId, conversationId, productId) {
      const tree = store.get(keyOf(text(projectId, "projectId"), text(conversationId, "conversationId"), text(productId, "productId")));
      return tree ? structuredClone(tree) : null;
    },
    save(value) {
      const tree = validateVersionTree(value);
      const key = keyOf(tree.projectId, tree.conversationId, tree.productId);
      const current = store.get(key);
      if (current && tree.revision <= current.revision) throw new VersionTreeError("REVISION_CONFLICT", "version tree revision must increase when saving");
      store.set(key, tree);
      return structuredClone(tree);
    },
    addOriginal(projectId, conversationId, input, now) {
      const current = getRequired(projectId, conversationId, input.productId);
      return this.save(addOriginalVersion(current, input, now));
    },
    addRepair(projectId, conversationId, input, now) {
      const current = getRequired(projectId, conversationId, input.productId);
      return this.save(addRepairVersion(current, input, now));
    },
    confirm(projectId, conversationId, productId, versionId, input, now) {
      const current = getRequired(projectId, conversationId, productId);
      if (!current.versions.some(item => item.id === versionId)) throw new VersionTreeError("NOT_FOUND", "version was not found");
      return this.save(recordHumanConfirmation(current, versionId, input, now));
    },
  };
}

export const createMemoryVersionTreeAdapter = createInMemoryVersionTreeAdapter;
