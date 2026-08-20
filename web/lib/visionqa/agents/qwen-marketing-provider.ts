import {
  L2_ALLOWED_TOOLS,
  type L2AgentProvider,
  type L2ProviderDecision,
  type L2ToolName,
} from "./l2-runtime.ts";

export const QWEN_MARKETING_PROVIDER_ID = "aliyun-bailian-marketing-agent";
export const QWEN_MARKETING_MODEL_SNAPSHOT = "qwen3.7-plus-2026-05-26";
export const QWEN_MARKETING_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
export const QWEN_MARKETING_API_KEY_ENV = "VISION_MARKETING_QWEN_API_KEY";

type MarketingProviderEnvironment = Record<string, string | undefined>;

export type QwenMarketingReadiness = {
  selected: true;
  adapter_ready: true;
  provider_id: typeof QWEN_MARKETING_PROVIDER_ID;
  model_snapshot: typeof QWEN_MARKETING_MODEL_SNAPSHOT;
  api_key_configured: boolean;
  activation_approved: boolean;
  paid_calls_enabled: boolean;
  structured_facts_only: boolean;
  live_ready: boolean;
  blockers: string[];
};

export class QwenMarketingProviderError extends Error {
  readonly code: "CONFIGURATION" | "AUTHENTICATION" | "RATE_LIMITED" | "NETWORK" | "INVALID_OUTPUT" | "PROVIDER_UNAVAILABLE";

  constructor(code: QwenMarketingProviderError["code"], message: string) {
    super(message);
    this.name = "QwenMarketingProviderError";
    this.code = code;
  }
}

export function getQwenMarketingReadiness(env: MarketingProviderEnvironment = process.env): QwenMarketingReadiness {
  const blockers: string[] = [];
  const apiKeyConfigured = Boolean(env[QWEN_MARKETING_API_KEY_ENV]?.trim());
  const activationApproved = env.VISION_MARKETING_QWEN_APPROVED === "true";
  const paidCallsEnabled = env.VISION_MARKETING_PAID_CALLS_ENABLED === "true";
  const structuredFactsOnly = env.VISION_MARKETING_DATA_SCOPE === "STRUCTURED_FACTS_ONLY";
  if (!apiKeyConfigured) blockers.push("API_KEY_NOT_CONFIGURED");
  if (!activationApproved) blockers.push("PROVIDER_ACTIVATION_NOT_APPROVED");
  if (!paidCallsEnabled) blockers.push("PAID_CALLS_NOT_ENABLED");
  if (!structuredFactsOnly) blockers.push("DATA_SCOPE_NOT_APPROVED");
  if (env.VISION_MARKETING_MODEL !== QWEN_MARKETING_MODEL_SNAPSHOT) blockers.push("MODEL_SNAPSHOT_NOT_LOCKED");
  if (env.VISION_MARKETING_MAX_CALLS_PER_RUN !== "6") blockers.push("MAX_CALLS_NOT_LOCKED");
  return {
    selected: true,
    adapter_ready: true,
    provider_id: QWEN_MARKETING_PROVIDER_ID,
    model_snapshot: QWEN_MARKETING_MODEL_SNAPSHOT,
    api_key_configured: apiKeyConfigured,
    activation_approved: activationApproved,
    paid_calls_enabled: paidCallsEnabled,
    structured_facts_only: structuredFactsOnly,
    live_ready: blockers.length === 0,
    blockers,
  };
}

function toolDescription(name: L2ToolName): string {
  const descriptions: Record<L2ToolName, string> = {
    read_fact_ledger: "读取用户确认的商品、人群、场景、关注因素和质量问题事实。生成内容前必须调用。",
    read_product_expression: "读取商品表达效能 Gate、分数和未知项。判断内容是否只能作为待补充草案。",
    generate_grounded_draft: "基于已读取事实生成受控营销草案。不得添加未确认的折扣、库存、销量、材质、功效或评价。",
    audit_grounded_draft: "审计当前草案的无来源声明。结束运行前必须调用。",
  };
  return descriptions[name];
}

function buildTools(allowedTools: readonly L2ToolName[]) {
  return allowedTools.map((name) => ({
    type: "function",
    function: {
      name,
      description: toolDescription(name),
      parameters: { type: "object", additionalProperties: false, properties: {} },
    },
  }));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseDecision(payload: unknown): L2ProviderDecision {
  const root = asRecord(payload);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const choice = asRecord(choices[0]);
  const message = asRecord(choice.message);
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  if (toolCalls.length > 1) throw new QwenMarketingProviderError("INVALID_OUTPUT", "营销智能体每一步只允许调用一个工具。");
  if (toolCalls.length === 1) {
    const fn = asRecord(asRecord(toolCalls[0]).function);
    const toolName = typeof fn.name === "string" ? fn.name : "";
    if (!toolName) throw new QwenMarketingProviderError("INVALID_OUTPUT", "千问工具调用缺少工具名。");
    let args: Record<string, unknown> = {};
    try {
      args = typeof fn.arguments === "string" && fn.arguments.trim() ? asRecord(JSON.parse(fn.arguments)) : {};
    } catch {
      throw new QwenMarketingProviderError("INVALID_OUTPUT", "千问工具参数不是合法 JSON。");
    }
    return { type: "tool_call", tool_name: toolName, arguments: args, reasoning_summary: `千问选择工具：${toolName}` };
  }
  const finishReason = typeof choice.finish_reason === "string" ? choice.finish_reason : "";
  if (finishReason !== "stop") throw new QwenMarketingProviderError("INVALID_OUTPUT", "千问没有返回工具调用或完整停止信号。");
  return { type: "final", reasoning_summary: "千问确认工具循环可以停止，结果进入人工审核。" };
}

export class QwenMarketingAgentProvider implements L2AgentProvider {
  readonly providerId = QWEN_MARKETING_PROVIDER_ID;
  readonly providerKind = "EXTERNAL_MODEL" as const;
  readonly usesExternalNetwork = true;
  readonly usesModelInference = true;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey: string, fetchImpl: typeof fetch = fetch) {
    if (!apiKey.trim()) throw new QwenMarketingProviderError("CONFIGURATION", "千问营销智能体 API Key 未配置。");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async decide(input: Parameters<L2AgentProvider["decide"]>[0]): Promise<L2ProviderDecision> {
    const response = await this.fetchImpl(QWEN_MARKETING_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: QWEN_MARKETING_MODEL_SNAPSHOT,
        messages: [
          {
            role: "system",
            content: [
              "你是 VisionQA 服饰电商营销领域智能体的决策层。",
              "你只能选择提供的工具，不得请求文件系统、终端、联网搜索或发布权限。",
              "事实不足时仍应完成事实读取和审计，但不得把草案升级为可交付结论。",
              "必须先读取事实和商品表达，再生成草案；结束前必须审计。",
              "每次只调用一个工具。所有正式结果由人工终审。",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({ objective: input.objective, observations: input.observations }).slice(0, 24_000),
          },
        ],
        tools: buildTools(input.allowedTools),
        tool_choice: "auto",
        parallel_tool_calls: false,
        enable_search: false,
        enable_thinking: false,
        temperature: 0.2,
        max_tokens: 800,
        stream: false,
      }),
      signal: AbortSignal.timeout(20_000),
    }).catch((error: unknown) => {
      throw new QwenMarketingProviderError("NETWORK", error instanceof Error ? error.message : "千问网络调用失败。");
    });
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403
        ? "AUTHENTICATION"
        : response.status === 429
          ? "RATE_LIMITED"
          : "PROVIDER_UNAVAILABLE";
      throw new QwenMarketingProviderError(code, `千问返回 HTTP ${response.status}。`);
    }
    return parseDecision(await response.json());
  }
}

export function createGovernedQwenMarketingProvider(
  env: MarketingProviderEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
): QwenMarketingAgentProvider {
  const readiness = getQwenMarketingReadiness(env);
  if (!readiness.live_ready) {
    throw new QwenMarketingProviderError("CONFIGURATION", `千问营销 Provider 尚未获准启用：${readiness.blockers.join(", ")}`);
  }
  return new QwenMarketingAgentProvider(env[QWEN_MARKETING_API_KEY_ENV]!, fetchImpl);
}

export function getQwenMarketingToolNames(): readonly L2ToolName[] {
  return L2_ALLOWED_TOOLS;
}
