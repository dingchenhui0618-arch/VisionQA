export const VISIONQA_PROJECT_SCHEMA_VERSION = "visionqa-project-v0.1" as const;
export const VISIONQA_PROJECT_PAYLOAD_SCHEMA_VERSION =
  "visionqa-workspace-project-payload-v0.1" as const;
export const VISIONQA_PROJECT_ASSET_SCHEMA_VERSION =
  "visionqa-project-asset-v0.1" as const;
export const VISIONQA_PROJECT_EVENT_SCHEMA_VERSION =
  "visionqa-project-event-v0.1" as const;

const PROJECT_DATABASE_NAME = "visionqa-project-store";
const PROJECT_DATABASE_VERSION = 1;
const PROJECTS_STORE = "projects";
const ASSETS_STORE = "assets";
const EVENTS_STORE = "events";

export type VisionQaProjectStage =
  | "overview"
  | "baseline"
  | "intake"
  | "review"
  | "repair"
  | "delivery";

export type VisionQaProjectMaterialCounts = {
  references: number;
  candidates: number;
  completedEvaluations: number;
  humanReviews: number;
};

export type VisionQaProjectRecord<TPayload = unknown> = {
  schemaVersion: typeof VISIONQA_PROJECT_SCHEMA_VERSION;
  projectId: string;
  projectName: string;
  scenario: "fashion_ecommerce_ai_model_image";
  storageMode: "LOCAL_INDEXED_DB";
  revision: number;
  stage: VisionQaProjectStage;
  createdAt: string;
  updatedAt: string;
  payload: TPayload;
  materialCounts: VisionQaProjectMaterialCounts;
};

export type VisionQaProjectAssetRole =
  | "REFERENCE"
  | "CANDIDATE"
  | "REPAIR_OUTPUT"
  | "UPSCALE_OUTPUT";

export type VisionQaProjectAssetRecord = {
  schemaVersion: typeof VISIONQA_PROJECT_ASSET_SCHEMA_VERSION;
  assetId: string;
  projectId: string;
  role: VisionQaProjectAssetRole;
  position: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
  lastModified: number;
  sha256: string | null;
  file: File;
  updatedAt: string;
};

export type VisionQaProjectEventAction =
  | "PROJECT_CREATED"
  | "PROJECT_RESTORED"
  | "STAGE_CHANGED"
  | "MATERIALS_UPDATED"
  | "PROJECT_UPDATED";

export type VisionQaProjectAuditEvent = {
  schemaVersion: typeof VISIONQA_PROJECT_EVENT_SCHEMA_VERSION;
  eventId: string;
  projectId: string;
  sequence: number;
  action: VisionQaProjectEventAction;
  fromRevision: number;
  toRevision: number;
  stage: VisionQaProjectStage;
  summary: string;
  createdAt: string;
  actor: "LOCAL_PREVIEW_USER";
};

export type VisionQaLoadedProject<TPayload> = {
  project: VisionQaProjectRecord<TPayload>;
  assets: VisionQaProjectAssetRecord[];
  events: VisionQaProjectAuditEvent[];
};

type CreateProjectInput<TPayload> = {
  projectId?: string;
  projectName: string;
  stage: VisionQaProjectStage;
  payload: TPayload;
  materialCounts: VisionQaProjectMaterialCounts;
  assets: Omit<VisionQaProjectAssetRecord, "schemaVersion" | "projectId" | "updatedAt">[];
  now?: string;
};

type SaveProjectInput<TPayload> = {
  projectId: string;
  expectedRevision: number;
  projectName: string;
  stage: VisionQaProjectStage;
  payload: TPayload;
  materialCounts: VisionQaProjectMaterialCounts;
  assets: Omit<VisionQaProjectAssetRecord, "schemaVersion" | "projectId" | "updatedAt">[];
  now?: string;
};

export class VisionQaProjectConflictError extends Error {
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(expectedRevision: number, actualRevision: number) {
    super(
      `Project revision conflict: expected ${expectedRevision}, received ${actualRevision}.`,
    );
    this.name = "VisionQaProjectConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export function isVisionQaProjectRecord(
  value: unknown,
): value is VisionQaProjectRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<VisionQaProjectRecord>;
  return (
    record.schemaVersion === VISIONQA_PROJECT_SCHEMA_VERSION &&
    typeof record.projectId === "string" &&
    record.projectId.length > 0 &&
    typeof record.projectName === "string" &&
    record.projectName.length > 0 &&
    record.scenario === "fashion_ecommerce_ai_model_image" &&
    record.storageMode === "LOCAL_INDEXED_DB" &&
    Number.isInteger(record.revision) &&
    (record.revision ?? 0) >= 1 &&
    isProjectStage(record.stage) &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string" &&
    isMaterialCounts(record.materialCounts)
  );
}

export function createProjectRecord<TPayload>(
  input: Omit<CreateProjectInput<TPayload>, "assets">,
): VisionQaProjectRecord<TPayload> {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: VISIONQA_PROJECT_SCHEMA_VERSION,
    projectId: input.projectId ?? crypto.randomUUID(),
    projectName: input.projectName,
    scenario: "fashion_ecommerce_ai_model_image",
    storageMode: "LOCAL_INDEXED_DB",
    revision: 1,
    stage: input.stage,
    createdAt: now,
    updatedAt: now,
    payload: input.payload,
    materialCounts: input.materialCounts,
  };
}

export function inferProjectEventAction(
  previous: Pick<VisionQaProjectRecord, "stage" | "materialCounts">,
  next: Pick<VisionQaProjectRecord, "stage" | "materialCounts">,
): VisionQaProjectEventAction {
  if (previous.stage !== next.stage) return "STAGE_CHANGED";
  if (
    previous.materialCounts.references !== next.materialCounts.references ||
    previous.materialCounts.candidates !== next.materialCounts.candidates ||
    previous.materialCounts.completedEvaluations !==
      next.materialCounts.completedEvaluations ||
    previous.materialCounts.humanReviews !== next.materialCounts.humanReviews
  ) {
    return "MATERIALS_UPDATED";
  }
  return "PROJECT_UPDATED";
}

export function summarizeProjectEvent(
  action: VisionQaProjectEventAction,
  stage: VisionQaProjectStage,
  counts: VisionQaProjectMaterialCounts,
): string {
  if (action === "PROJECT_CREATED") return "建立本机项目并写入初始工作状态。";
  if (action === "PROJECT_RESTORED") return "从本机项目存储恢复工作状态。";
  if (action === "STAGE_CHANGED") return `工作阶段切换为 ${stage}。`;
  if (action === "MATERIALS_UPDATED") {
    return `素材更新：基准 ${counts.references}，候选 ${counts.candidates}，已评审 ${counts.completedEvaluations}。`;
  }
  return "工作台内容已更新。";
}

export async function loadLatestLocalProject<TPayload>(): Promise<
  VisionQaLoadedProject<TPayload> | null
> {
  const database = await openProjectDatabase();
  const transaction = database.transaction(
    [PROJECTS_STORE, ASSETS_STORE, EVENTS_STORE],
    "readonly",
  );
  const projects = await requestResult(
    transaction.objectStore(PROJECTS_STORE).getAll(),
  );
  const validProjects = (projects as unknown[])
    .filter(isVisionQaProjectRecord)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const project = validProjects[0] as VisionQaProjectRecord<TPayload> | undefined;
  if (!project) {
    await transactionDone(transaction);
    database.close();
    return null;
  }
  const assets = (await requestResult(
    transaction
      .objectStore(ASSETS_STORE)
      .index("projectId")
      .getAll(IDBKeyRange.only(project.projectId)),
  )) as VisionQaProjectAssetRecord[];
  const events = (await requestResult(
    transaction
      .objectStore(EVENTS_STORE)
      .index("projectId")
      .getAll(IDBKeyRange.only(project.projectId)),
  )) as VisionQaProjectAuditEvent[];
  await transactionDone(transaction);
  database.close();
  return {
    project,
    assets: assets.sort((left, right) => left.position - right.position),
    events: events.sort((left, right) => left.sequence - right.sequence),
  };
}

export async function createLocalProject<TPayload>(
  input: CreateProjectInput<TPayload>,
): Promise<VisionQaLoadedProject<TPayload>> {
  const project = createProjectRecord(input);
  const event = createAuditEvent({
    project,
    sequence: 1,
    action: "PROJECT_CREATED",
    fromRevision: 0,
    now: project.createdAt,
  });
  const assets = materializeAssets(project.projectId, input.assets, project.updatedAt);
  const database = await openProjectDatabase();
  const transaction = database.transaction(
    [PROJECTS_STORE, ASSETS_STORE, EVENTS_STORE],
    "readwrite",
  );
  transaction.objectStore(PROJECTS_STORE).add(project);
  const assetStore = transaction.objectStore(ASSETS_STORE);
  assets.forEach((asset) => assetStore.add(asset));
  transaction.objectStore(EVENTS_STORE).add(event);
  await transactionDone(transaction);
  database.close();
  return { project, assets, events: [event] };
}

export async function saveLocalProject<TPayload>(
  input: SaveProjectInput<TPayload>,
): Promise<VisionQaLoadedProject<TPayload>> {
  const database = await openProjectDatabase();
  const transaction = database.transaction(
    [PROJECTS_STORE, ASSETS_STORE, EVENTS_STORE],
    "readwrite",
  );
  const projectsStore = transaction.objectStore(PROJECTS_STORE);
  const current = (await requestResult(
    projectsStore.get(input.projectId),
  )) as VisionQaProjectRecord<TPayload> | undefined;
  if (!current || !isVisionQaProjectRecord(current)) {
    transaction.abort();
    database.close();
    throw new Error("Local project is missing or uses an unsupported contract.");
  }
  if (current.revision !== input.expectedRevision) {
    transaction.abort();
    database.close();
    throw new VisionQaProjectConflictError(
      input.expectedRevision,
      current.revision,
    );
  }

  const now = input.now ?? new Date().toISOString();
  const next: VisionQaProjectRecord<TPayload> = {
    ...current,
    projectName: input.projectName,
    revision: current.revision + 1,
    stage: input.stage,
    updatedAt: now,
    payload: input.payload,
    materialCounts: input.materialCounts,
  };
  const existingEvents = (await requestResult(
    transaction
      .objectStore(EVENTS_STORE)
      .index("projectId")
      .getAll(IDBKeyRange.only(current.projectId)),
  )) as VisionQaProjectAuditEvent[];
  const action = inferProjectEventAction(current, next);
  const event = createAuditEvent({
    project: next,
    sequence: nextEventSequence(existingEvents),
    action,
    fromRevision: current.revision,
    now,
  });
  const assets = materializeAssets(current.projectId, input.assets, now);
  await deleteProjectAssets(transaction.objectStore(ASSETS_STORE), current.projectId);
  const assetStore = transaction.objectStore(ASSETS_STORE);
  assets.forEach((asset) => assetStore.put(asset));
  projectsStore.put(next);
  transaction.objectStore(EVENTS_STORE).add(event);
  await transactionDone(transaction);
  database.close();
  return { project: next, assets, events: [...existingEvents, event] };
}

export async function appendProjectRestoreEvent(
  project: VisionQaProjectRecord,
): Promise<VisionQaProjectAuditEvent> {
  const database = await openProjectDatabase();
  const transaction = database.transaction(EVENTS_STORE, "readwrite");
  const eventsStore = transaction.objectStore(EVENTS_STORE);
  const existingEvents = (await requestResult(
    eventsStore.index("projectId").getAll(IDBKeyRange.only(project.projectId)),
  )) as VisionQaProjectAuditEvent[];
  const event = createAuditEvent({
    project,
    sequence: nextEventSequence(existingEvents),
    action: "PROJECT_RESTORED",
    fromRevision: project.revision,
  });
  eventsStore.add(event);
  await transactionDone(transaction);
  database.close();
  return event;
}

function isProjectStage(value: unknown): value is VisionQaProjectStage {
  return (
    value === "overview" ||
    value === "baseline" ||
    value === "intake" ||
    value === "review" ||
    value === "repair" ||
    value === "delivery"
  );
}

function isMaterialCounts(value: unknown): value is VisionQaProjectMaterialCounts {
  if (!value || typeof value !== "object") return false;
  const counts = value as Partial<VisionQaProjectMaterialCounts>;
  return [
    counts.references,
    counts.candidates,
    counts.completedEvaluations,
    counts.humanReviews,
  ].every((count) => Number.isInteger(count) && (count ?? -1) >= 0);
}

function createAuditEvent({
  project,
  sequence,
  action,
  fromRevision,
  now,
}: {
  project: VisionQaProjectRecord;
  sequence: number;
  action: VisionQaProjectEventAction;
  fromRevision: number;
  now?: string;
}): VisionQaProjectAuditEvent {
  return {
    schemaVersion: VISIONQA_PROJECT_EVENT_SCHEMA_VERSION,
    eventId: crypto.randomUUID(),
    projectId: project.projectId,
    sequence,
    action,
    fromRevision,
    toRevision: project.revision,
    stage: project.stage,
    summary: summarizeProjectEvent(action, project.stage, project.materialCounts),
    createdAt: now ?? new Date().toISOString(),
    actor: "LOCAL_PREVIEW_USER",
  };
}

function nextEventSequence(events: VisionQaProjectAuditEvent[]): number {
  return events.reduce((maximum, event) => Math.max(maximum, event.sequence), 0) + 1;
}

function materializeAssets(
  projectId: string,
  assets: Omit<VisionQaProjectAssetRecord, "schemaVersion" | "projectId" | "updatedAt">[],
  updatedAt: string,
): VisionQaProjectAssetRecord[] {
  return assets.map((asset) => ({
    ...asset,
    assetId: `${projectId}:${asset.assetId}`,
    schemaVersion: VISIONQA_PROJECT_ASSET_SCHEMA_VERSION,
    projectId,
    updatedAt,
  }));
}

function openProjectDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECTS_STORE)) {
        const store = database.createObjectStore(PROJECTS_STORE, {
          keyPath: "projectId",
        });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!database.objectStoreNames.contains(ASSETS_STORE)) {
        const store = database.createObjectStore(ASSETS_STORE, {
          keyPath: "assetId",
        });
        store.createIndex("projectId", "projectId", { unique: false });
      }
      if (!database.objectStoreNames.contains(EVENTS_STORE)) {
        const store = database.createObjectStore(EVENTS_STORE, {
          keyPath: "eventId",
        });
        store.createIndex("projectId", "projectId", { unique: false });
        store.createIndex("projectSequence", ["projectId", "sequence"], {
          unique: true,
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function deleteProjectAssets(
  store: IDBObjectStore,
  projectId: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.index("projectId").openKeyCursor(IDBKeyRange.only(projectId));
    request.onerror = () => reject(request.error ?? new Error("Asset cleanup failed."));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
  });
}
