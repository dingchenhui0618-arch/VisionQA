import { getBetaService, type BetaService } from "./service.ts";

type BackendMethodName =
  | "applyRepairPlannerDecision"
  | "beginRepair"
  | "captureRepair"
  | "cleanupExpiredAssets"
  | "completeScreeningBatch"
  | "consumeInvite"
  | "createInvite"
  | "createOutputAsset"
  | "createProject"
  | "createProjectForConversation"
  | "createScreeningBatch"
  | "createUploadIntent"
  | "deleteProject"
  | "failScreeningBatch"
  | "getBatch"
  | "getCredits"
  | "getProject"
  | "getRepairAttempt"
  | "getRepairEvolution"
  | "getRepairReferenceBatch"
  | "grantCredits"
  | "grantCreditsByInternalActor"
  | "latestBatchForProject"
  | "latestRepairForProject"
  | "ledgerForTenant"
  | "listProjectAssets"
  | "listProjectRepairs"
  | "listProjectScreeningItems"
  | "listProjects"
  | "markRepairRunning"
  | "publicRepairEvolutionEventsForProject"
  | "putAsset"
  | "readAsset"
  | "releaseRepair"
  | "resolveSession";

type AsyncCapable<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Awaited<R> | Promise<Awaited<R>>
    : never;
};

/**
 * One customer-beta authority per process. API callers always await this port,
 * so the in-memory/local implementation can later be replaced atomically by a
 * PostgreSQL-backed implementation without mixing sync Map writes with DB
 * transactions inside one request.
 */
export type BetaBackend = AsyncCapable<Pick<BetaService, BackendMethodName>>;

let override: BetaBackend | null = null;

export function getBetaBackend(): BetaBackend {
  return override ?? getBetaService();
}

export function setBetaBackendForTest(backend: BetaBackend | null): void {
  if (process.env.NODE_ENV === "production") throw new Error("Beta backend overrides are disabled in production");
  override = backend;
}
