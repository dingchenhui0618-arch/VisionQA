import {
  createDeepSeekRepairPlanner,
  DeepSeekPlannerError,
  getDeepSeekPlannerReadiness,
} from "./deepseek-repair-planner.ts";
import {
  selectDeterministicRepairRoutes,
  type RepairRoutingRequest,
} from "./repair-model-registry.ts";
import type {
  RepairEvolutionEpisode,
  RepairPlannerDecision,
} from "./recursive-repair.ts";

type Environment = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export type RepairPlanningOutcome = {
  mode: "DEEPSEEK_V4_FLASH" | "DETERMINISTIC_FALLBACK";
  decision: RepairPlannerDecision;
  allowedRouteIds: string[];
  plannerFailureCode: DeepSeekPlannerError["code"] | null;
};

export async function planCustomerRepair(input: {
  episode: RepairEvolutionEpisode;
  routing: RepairRoutingRequest;
  env: Environment;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
  authorizeExternalDispatch?: () => { record: () => void };
}): Promise<RepairPlanningOutcome> {
  const candidates = selectDeterministicRepairRoutes(input.routing);
  const allowedRouteIds = candidates.map((entry) => entry.routeId);
  if (allowedRouteIds.length === 0) {
    return {
      mode: "DETERMINISTIC_FALLBACK",
      allowedRouteIds,
      plannerFailureCode: null,
      decision: {
        action: "ESCALATE",
        routeId: null,
        publicSummary: "当前没有已获准且适合这项修正的模型路线，请转人工处理。",
        strategyRevision: null,
        evidenceFingerprints: input.episode.evidence.map((entry) => entry.fingerprint),
      },
    };
  }
  if (getDeepSeekPlannerReadiness(input.env).liveReady) {
    if (!input.authorizeExternalDispatch) {
      throw new DeepSeekPlannerError("CONFIGURATION", "DeepSeek 规划调用缺少预算授权器。");
    }
    const budget = input.authorizeExternalDispatch();
    try {
      const planner = createDeepSeekRepairPlanner(input.env, input.fetchImpl);
      return {
        mode: "DEEPSEEK_V4_FLASH",
        allowedRouteIds,
        plannerFailureCode: null,
        decision: await planner.decide({
          objective: "根据商品真值、已确认问题和失败证据，选择一次最合适的修图路线；证据不足时停止或转人工。",
          round: input.episode.round,
          evidence: input.episode.evidence,
          allowedRouteIds,
          signal: input.signal,
        }),
      };
    } catch (error) {
      if (!(error instanceof DeepSeekPlannerError)) throw error;
      return deterministicFallback(candidates[0].routeId, input.episode, allowedRouteIds, error.code);
    } finally {
      budget.record();
    }
  }
  return deterministicFallback(candidates[0].routeId, input.episode, allowedRouteIds, null);
}

function deterministicFallback(
  routeId: string,
  episode: RepairEvolutionEpisode,
  allowedRouteIds: string[],
  plannerFailureCode: DeepSeekPlannerError["code"] | null,
): RepairPlanningOutcome {
  return {
    mode: "DETERMINISTIC_FALLBACK",
    allowedRouteIds,
    plannerFailureCode,
    decision: {
      action: "ROUTE",
      routeId,
      publicSummary: "商品事实和问题区域已确认，准备执行本轮修正。",
      strategyRevision: null,
      evidenceFingerprints: episode.evidence.map((entry) => entry.fingerprint),
    },
  };
}
