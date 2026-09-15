import { localStateStore } from "../beta/local-state.ts";
import { ModelCallLedger, type ModelCallRecord } from "./model-call-ledger.ts";
import { createRealProviderRuntime, type ProviderExecutor, type ProviderRuntime } from "./provider-runtime.ts";
import { createPostgresPool } from "../../db/pg/index.ts";
import { createMemoryDispatchClaimStore, createPostgresDispatchClaimStore, type DispatchClaimStore } from "./dispatch-claim-store.ts";

type Snapshot = { schema: "visionqa-model-call-ledger-v1"; records: ModelCallRecord[] };

let ledger: ModelCallLedger | null = null;
let dispatchClaims: DispatchClaimStore | null = null;

export function getModelCallLedger(): ModelCallLedger {
  if (ledger) return ledger;
  if (process.env.NODE_ENV === "production") {
    ledger = new ModelCallLedger();
    return ledger;
  }
  const storage = localStateStore("model-call-ledger");
  const snapshot = storage.load() as Snapshot | null;
  if (snapshot && (snapshot.schema !== "visionqa-model-call-ledger-v1" || !Array.isArray(snapshot.records))) {
    throw new Error("Invalid model call ledger snapshot");
  }
  ledger = new ModelCallLedger({
    initial: snapshot?.records ?? [],
    onChange: (records) => storage.save({ schema: "visionqa-model-call-ledger-v1", records }),
  });
  return ledger;
}

function getDispatchClaims(): DispatchClaimStore {
  if (dispatchClaims) return dispatchClaims;
  if (process.env.NODE_ENV !== "production") {
    dispatchClaims = createMemoryDispatchClaimStore();
    return dispatchClaims;
  }
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required for production provider dispatch claims");
  dispatchClaims = createPostgresDispatchClaimStore(createPostgresPool({ connectionString }));
  return dispatchClaims;
}

export function createTrackedRealProvider(input: { tenantId: string; provider: string; model: string; executor: ProviderExecutor }): ProviderRuntime {
  return createRealProviderRuntime({ ...input, ledger: getModelCallLedger(), claims: getDispatchClaims() });
}

export function resetModelCallLedgerForTest(): void {
  ledger = null;
  dispatchClaims = null;
}
