import {
  runGroundedMarketingAgents,
  type AgentRuntimeTrace,
  type MarketingAgentInput,
  type MarketingAgentRun,
} from "./local-orchestrator.ts";

export const L2_AGENT_MAX_STEPS = 6;
export const L2_ALLOWED_TOOLS = [
  "read_fact_ledger",
  "read_product_expression",
  "generate_grounded_draft",
  "audit_grounded_draft",
] as const;

export type L2ToolName = typeof L2_ALLOWED_TOOLS[number];
export type L2ProviderDecision =
  | { type: "tool_call"; tool_name: string; arguments: Record<string, unknown>; reasoning_summary: string }
  | { type: "final"; reasoning_summary: string };

export type L2Observation = {
  step: number;
  tool_name: L2ToolName;
  output: Record<string, unknown>;
};

export interface L2AgentProvider {
  readonly providerId: string;
  readonly providerKind: "NON_MODEL_TEST_PROVIDER" | "EXTERNAL_MODEL";
  readonly usesExternalNetwork: boolean;
  readonly usesModelInference: boolean;
  decide(input: {
    objective: string;
    observations: L2Observation[];
    allowedTools: readonly L2ToolName[];
  }): Promise<L2ProviderDecision>;
}

export class L2AgentRuntimeError extends Error {
  readonly code: "UNKNOWN_TOOL" | "MAX_STEPS" | "PROVIDER_ERROR" | "MISSING_DRAFT";

  constructor(code: "UNKNOWN_TOOL" | "MAX_STEPS" | "PROVIDER_ERROR" | "MISSING_DRAFT", message: string) {
    super(message);
    this.name = "L2AgentRuntimeError";
    this.code = code;
  }
}

type RuntimeState = { draft: MarketingAgentRun | null };

function factLedgerSummary(input: MarketingAgentInput) {
  return {
    product_name: input.product_name,
    audience_count: input.audience_segments.length,
    scenario_count: input.scenarios.length,
    purchase_driver_count: input.purchase_drivers.length,
    review_issue_count: input.review_issues.length,
    locked_attribute_count: input.locked_attributes.length,
    evidence_mode: input.evidence_mode,
  };
}

function executeTool(toolName: L2ToolName, input: MarketingAgentInput, state: RuntimeState): Record<string, unknown> {
  if (toolName === "read_fact_ledger") return factLedgerSummary(input);
  if (toolName === "read_product_expression") {
    return input.product_expression
      ? { available: true, gate: input.product_expression.sku_consistency_gate, score: input.product_expression.score, unknowns: input.product_expression.unknowns }
      : { available: false, gate: "NOT_ASSESSABLE", score: null, unknowns: ["缺少商品表达效能结果"] };
  }
  if (toolName === "generate_grounded_draft") {
    state.draft = runGroundedMarketingAgents(input);
    return { generated: true, status: state.draft.status, claim_count: state.draft.claims.length, unknown_count: state.draft.unknowns.length };
  }
  if (!state.draft) throw new L2AgentRuntimeError("MISSING_DRAFT", "审计前必须先生成草案。");
  return {
    audited: true,
    unsupported_claims: state.draft.audit.unsupported_claims,
    human_final_review_required: state.draft.audit.human_final_review_required,
    status: state.draft.status,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new L2AgentRuntimeError("PROVIDER_ERROR", "Provider 决策超时。")), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export async function runL2MarketingAgent(input: MarketingAgentInput, provider: L2AgentProvider): Promise<MarketingAgentRun> {
  const observations: L2Observation[] = [];
  const trace: AgentRuntimeTrace[] = [];
  const state: RuntimeState = { draft: null };
  for (let step = 1; step <= L2_AGENT_MAX_STEPS; step += 1) {
    let decision: L2ProviderDecision;
    try {
      decision = await withTimeout(provider.decide({
        objective: "基于商品事实和评审证据，生成可追溯营销草案并完成事实审计。",
        observations,
        allowedTools: L2_ALLOWED_TOOLS,
      }), 3_000);
    } catch (error) {
      if (error instanceof L2AgentRuntimeError) throw error;
      throw new L2AgentRuntimeError("PROVIDER_ERROR", error instanceof Error ? error.message : "Provider 决策失败。");
    }
    trace.push({ step, kind: "PROVIDER_DECISION", tool_name: decision.type === "tool_call" ? decision.tool_name : null, status: "OK", summary: decision.reasoning_summary });
    if (decision.type === "final") {
      if (!state.draft) throw new L2AgentRuntimeError("MISSING_DRAFT", "Provider 在形成营销草案前结束运行。");
      trace.push({ step, kind: "FINAL", tool_name: null, status: "OK", summary: "运行结束，结果进入人工审核。" });
      return {
        ...state.draft,
        execution_mode: "L2_RUNTIME_TEST_PROVIDER_NO_NETWORK",
        runtime: {
          level: "L2_DOMAIN_AGENT",
          provider_id: provider.providerId,
          provider_kind: provider.providerKind,
          external_network_used: provider.usesExternalNetwork,
          model_inference_used: provider.usesModelInference,
          max_steps: L2_AGENT_MAX_STEPS,
          stop_reason: "PROVIDER_FINAL",
          trace,
        },
      };
    }
    if (!L2_ALLOWED_TOOLS.includes(decision.tool_name as L2ToolName)) {
      throw new L2AgentRuntimeError("UNKNOWN_TOOL", `工具 ${decision.tool_name} 不在 VisionQA 白名单。`);
    }
    const toolName = decision.tool_name as L2ToolName;
    const output = executeTool(toolName, input, state);
    observations.push({ step, tool_name: toolName, output });
    trace.push({ step, kind: "TOOL_RESULT", tool_name: toolName, status: "OK", summary: JSON.stringify(output).slice(0, 240) });
  }
  throw new L2AgentRuntimeError("MAX_STEPS", `超过 ${L2_AGENT_MAX_STEPS} 步停止，未形成可交付结果。`);
}

export function createLocalL2TestProvider(): L2AgentProvider {
  const sequence: L2ProviderDecision[] = [
    { type: "tool_call", tool_name: "read_fact_ledger", arguments: {}, reasoning_summary: "先确认允许使用的商品事实。" },
    { type: "tool_call", tool_name: "read_product_expression", arguments: {}, reasoning_summary: "读取商品表达 Gate 和未知项。" },
    { type: "tool_call", tool_name: "generate_grounded_draft", arguments: {}, reasoning_summary: "使用受控生成工具形成营销草案。" },
    { type: "tool_call", tool_name: "audit_grounded_draft", arguments: {}, reasoning_summary: "在结束前检查无来源声明。" },
    { type: "final", reasoning_summary: "证据审计完成，停止自主循环并交给人工审核。" },
  ];
  let cursor = 0;
  return {
    providerId: "visionqa-local-l2-test-provider",
    providerKind: "NON_MODEL_TEST_PROVIDER",
    usesExternalNetwork: false,
    usesModelInference: false,
    async decide() {
      const decision = sequence[Math.min(cursor, sequence.length - 1)];
      cursor += 1;
      return decision;
    },
  };
}

export type L2AgentCapability = {
  runtime_ready: true;
  current_level: "L2_RUNTIME_SCAFFOLD";
  active_provider: "NON_MODEL_TEST_PROVIDER";
  external_model_configured: false;
  external_calls_enabled: false;
  payment_action_authorized: false;
  api_key_authorized: false;
  local_material_access: "USER_AUTHORIZED_LOCAL_ONLY";
  human_final_review_required: true;
  auto_pass_enabled: false;
};

export function getL2AgentCapability(): L2AgentCapability {
  return {
    runtime_ready: true,
    current_level: "L2_RUNTIME_SCAFFOLD",
    active_provider: "NON_MODEL_TEST_PROVIDER",
    external_model_configured: false,
    external_calls_enabled: false,
    payment_action_authorized: false,
    api_key_authorized: false,
    local_material_access: "USER_AUTHORIZED_LOCAL_ONLY",
    human_final_review_required: true,
    auto_pass_enabled: false,
  };
}
