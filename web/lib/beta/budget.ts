import { CustomerVisibleError } from "./contracts.ts";
import { localStateStore, type StateStore } from "./local-state.ts";

type BudgetMode = "prelaunch" | "beta";
type BudgetState = { calls: number; spentMinor: number };

const states: Record<BudgetMode, BudgetState> = {
  prelaunch: { calls: 0, spentMinor: 0 },
  beta: { calls: 0, spentMinor: 0 },
};
let store: StateStore | undefined;
function initializeLocalBudget() {
  if (store || process.env.VISIONQA_AGENT_LOCAL !== "true" || process.env.NODE_ENV === "production") return;
  const next = localStateStore("budget");
  const saved = next.load() as { version: number; states: typeof states } | null;
  if (saved) {
    if (saved.version !== 1) throw new Error("Invalid local budget snapshot");
    for (const mode of ["prelaunch", "beta"] as const) {
      const value = saved.states?.[mode];
      if (!value || !Number.isInteger(value.calls) || value.calls < 0 || !Number.isInteger(value.spentMinor) || value.spentMinor < 0) throw new Error("Invalid local budget counters");
      states[mode] = { ...value };
    }
  }
  store = next;
}

export function currentBudgetMode(env: Record<string, string | undefined> = process.env): BudgetMode {
  return env.VISIONQA_RELEASE_MODE === "beta" ? "beta" : "prelaunch";
}

export function authorizeModelDispatch(
  estimatedMinor: number,
  env: Record<string, string | undefined> = process.env,
): { mode: BudgetMode; record: () => void } {
  initializeLocalBudget();
  if (!Number.isInteger(estimatedMinor) || estimatedMinor < 0) throw new Error("Invalid budget estimate");
  const mode = currentBudgetMode(env);
  const state = states[mode];
  const maxCalls = mode === "prelaunch" ? 30 : Number.POSITIVE_INFINITY;
  const maxMinor = mode === "prelaunch" ? 3000 : 10000;
  if (state.calls >= maxCalls || state.spentMinor + estimatedMinor > maxMinor) {
    throw new CustomerVisibleError(
      "BUDGET_PAUSED",
      "当前内测模型预算已到安全上限，新的筛查和修图暂时停止。",
      503,
      "已有项目仍可查看和下载；请联系内测管理员确认下一轮预算。",
    );
  }
  let recorded = false;
  // Reserve synchronously, not after the provider has already been called.
  // Ambiguous failures remain counted; these are estimates, not reconciled bills.
  state.calls += 1;
  state.spentMinor += estimatedMinor;
  store?.save({ version: 1, states });
  return {
    mode,
    record() {
      if (recorded) return;
      recorded = true;
    },
  };
}

export function getBudgetState(mode: BudgetMode): Readonly<BudgetState> {
  initializeLocalBudget();
  return { ...states[mode] };
}
