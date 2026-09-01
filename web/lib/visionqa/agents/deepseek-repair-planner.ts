import type { RepairPlannerDecision } from "./recursive-repair.ts";

export const DEEPSEEK_REPAIR_PLANNER_MODEL = "deepseek-v4-flash" as const;
export const DEEPSEEK_REPAIR_PLANNER_SCOPE = "STRUCTURED_REPAIR_FACTS_NO_IMAGES" as const;

type Environment = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export type DeepSeekPlannerReadiness = {
  apiKeyConfigured: boolean;
  providerApproved: boolean;
  paidCallsApproved: boolean;
  dataScopeApproved: boolean;
  modelLocked: boolean;
  liveReady: boolean;
  blockers: string[];
};

export class DeepSeekPlannerError extends Error {
  readonly code: "CONFIGURATION" | "INVALID_INPUT" | "NETWORK" | "INVALID_OUTPUT" | "PROVIDER_REJECTED";

  constructor(code: DeepSeekPlannerError["code"], message: string) {
    super(message);
    this.name = "DeepSeekPlannerError";
    this.code = code;
  }
}

export function getDeepSeekPlannerReadiness(env: Environment): DeepSeekPlannerReadiness {
  const apiKeyConfigured = Boolean((env.VISIONQA_ORCHESTRATOR_DEEPSEEK_API_KEY ?? env.DEEPSEEK_API_KEY)?.trim());
  const providerApproved = env.VISIONQA_ORCHESTRATOR_DEEPSEEK_APPROVED === "true";
  const paidCallsApproved = env.VISIONQA_ORCHESTRATOR_DEEPSEEK_PAID_CALLS_APPROVED === "true";
  const dataScopeApproved = env.VISIONQA_ORCHESTRATOR_DEEPSEEK_DATA_SCOPE === DEEPSEEK_REPAIR_PLANNER_SCOPE;
  const modelLocked = env.VISIONQA_ORCHESTRATOR_DEEPSEEK_MODEL === DEEPSEEK_REPAIR_PLANNER_MODEL;
  const blockers: string[] = [];
  if (!apiKeyConfigured) blockers.push("API_KEY_NOT_CONFIGURED");
  if (!providerApproved) blockers.push("PROVIDER_APPROVAL_REQUIRED");
  if (!paidCallsApproved) blockers.push("PAID_CALL_APPROVAL_REQUIRED");
  if (!dataScopeApproved) blockers.push("DATA_SCOPE_NOT_APPROVED");
  if (!modelLocked) blockers.push("MODEL_NOT_LOCKED");
  return { apiKeyConfigured, providerApproved, paidCallsApproved, dataScopeApproved, modelLocked, liveReady: blockers.length === 0, blockers };
}

export class DeepSeekRepairPlanner {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(apiKey: string, fetchImpl: FetchLike = fetch) {
    if (!apiKey.trim()) throw new DeepSeekPlannerError("CONFIGURATION", "DeepSeek 规划器配置不完整。");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async decide(input: {
    objective: string;
    round: number;
    evidence: Array<{ fingerprint: string; kind: string; summary: string; verifiedBy: string }>;
    allowedRouteIds: readonly string[];
    signal?: AbortSignal;
  }): Promise<RepairPlannerDecision> {
    if (!input.objective.trim() || input.evidence.length > 64 || input.allowedRouteIds.length === 0) {
      throw new DeepSeekPlannerError("INVALID_INPUT", "递归规划输入不完整或超出限制。");
    }
    let response: Response;
    try {
      response = await this.fetchImpl("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: DEEPSEEK_REPAIR_PLANNER_MODEL,
          response_format: { type: "json_object" },
          thinking: { type: "enabled" },
          reasoning_effort: "low",
          max_tokens: 1200,
          messages: [
            {
              role: "system",
              content: "你是服饰商品图修正任务的受控规划器。只根据结构化证据选择白名单路线或停止；不请求图片、不输出隐藏思维链、不虚构证据。输出 JSON：action、route_id、public_summary、strategy_revision、evidence_fingerprints。",
            },
            { role: "user", content: JSON.stringify(input) },
          ],
        }),
        signal: input.signal,
      });
    } catch {
      throw new DeepSeekPlannerError("NETWORK", "DeepSeek 规划请求失败；不会自动重试。");
    }
    if (!response.ok) throw new DeepSeekPlannerError("PROVIDER_REJECTED", "DeepSeek 规划请求被服务端拒绝。");
    const body = asRecord(await response.json().catch(() => null));
    const message = asRecord(asRecord(asArray(body.choices)[0]).message);
    if (typeof message.content !== "string") throw new DeepSeekPlannerError("INVALID_OUTPUT", "DeepSeek 未返回结构化规划结果。");
    const raw = asRecord(parseJson(message.content));
    const action = raw.action;
    if (action !== "ROUTE" && action !== "REFINE" && action !== "STOP" && action !== "ESCALATE") {
      throw new DeepSeekPlannerError("INVALID_OUTPUT", "DeepSeek 返回了未知规划动作。");
    }
    const routeId = typeof raw.route_id === "string" ? raw.route_id : null;
    if (routeId && !input.allowedRouteIds.includes(routeId)) {
      throw new DeepSeekPlannerError("INVALID_OUTPUT", "DeepSeek 选择了白名单外路线。");
    }
    return {
      action,
      routeId,
      publicSummary: typeof raw.public_summary === "string" ? raw.public_summary.slice(0, 180) : "规划已完成。",
      strategyRevision: typeof raw.strategy_revision === "string" ? raw.strategy_revision.slice(0, 800) : null,
      evidenceFingerprints: asArray(raw.evidence_fingerprints).filter((entry): entry is string => typeof entry === "string").slice(0, 32),
    };
  }
}

export function createDeepSeekRepairPlanner(env: Environment, fetchImpl: FetchLike = fetch) {
  const readiness = getDeepSeekPlannerReadiness(env);
  if (!readiness.liveReady) {
    throw new DeepSeekPlannerError("CONFIGURATION", `DeepSeek 规划器尚未获准：${readiness.blockers.join(",")}`);
  }
  return new DeepSeekRepairPlanner(env.VISIONQA_ORCHESTRATOR_DEEPSEEK_API_KEY ?? env.DEEPSEEK_API_KEY ?? "", fetchImpl);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}
