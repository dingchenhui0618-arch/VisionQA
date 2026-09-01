import { CustomerVisibleError } from "./contracts.ts";

type BudgetMode = "prelaunch" | "beta";
type BudgetState = { calls: number; spentMinor: number };

const states: Record<BudgetMode, BudgetState> = {
  prelaunch: { calls: 0, spentMinor: 0 },
  beta: { calls: 0, spentMinor: 0 },
};

export function currentBudgetMode(env: Record<string, string | undefined> = process.env): BudgetMode {
  return env.VISIONQA_RELEASE_MODE === "beta" ? "beta" : "prelaunch";
}

export function authorizeModelDispatch(
  estimatedMinor: number,
  env: Record<string, string | undefined> = process.env,
): { mode: BudgetMode; record: () => void } {
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
  return {
    mode,
    record() {
      if (recorded) return;
      recorded = true;
      state.calls += 1;
      state.spentMinor += estimatedMinor;
    },
  };
}

export function getBudgetState(mode: BudgetMode): Readonly<BudgetState> {
  return { ...states[mode] };
}
