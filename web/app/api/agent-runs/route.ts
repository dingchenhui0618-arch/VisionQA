import type { MarketingAgentInput } from "../../../lib/visionqa/agents/local-orchestrator";
import { createLocalL2TestProvider, getL2AgentCapability, L2AgentRuntimeError, runL2MarketingAgent } from "../../../lib/visionqa/agents/l2-runtime";
import { createGovernedQwenMarketingProvider, getQwenMarketingReadiness } from "../../../lib/visionqa/agents/qwen-marketing-provider";

const maxBodyBytes = 64 * 1024;

export function GET() {
  const qwen = getQwenMarketingReadiness();
  return Response.json({
    ...getL2AgentCapability(),
    selected_provider: "QWEN_BAILIAN",
    external_model_configured: qwen.api_key_configured,
    external_calls_enabled: qwen.live_ready,
    qwen_provider: qwen,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBodyBytes) return Response.json({ error: "AGENT_INPUT_TOO_LARGE" }, { status: 413 });
  let input: MarketingAgentInput;
  try { input = await request.json() as MarketingAgentInput; } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
  if (!input || typeof input.product_name !== "string" || !Array.isArray(input.audience_segments) || !Array.isArray(input.scenarios) || !Array.isArray(input.purchase_drivers) || !Array.isArray(input.review_issues) || !Array.isArray(input.locked_attributes)) {
    return Response.json({ error: "INVALID_AGENT_INPUT", message: "智能体输入缺少必需的结构化字段。" }, { status: 422 });
  }
  try {
    const qwen = getQwenMarketingReadiness();
    const provider = qwen.live_ready ? createGovernedQwenMarketingProvider() : createLocalL2TestProvider();
    const result = await runL2MarketingAgent(input, provider);
    return Response.json(result, {
      headers: { "Cache-Control": "no-store", "X-VisionQA-Agent-Mode": qwen.live_ready ? "L2_QWEN_STRUCTURED_FACTS_ONLY" : "L2_RUNTIME_TEST_PROVIDER_NO_NETWORK" },
    });
  } catch (error) {
    if (error instanceof L2AgentRuntimeError) {
      return Response.json({ error: error.code, message: error.message }, { status: 422 });
    }
    return Response.json({ error: "AGENT_RUNTIME_FAILED" }, { status: 500 });
  }
}
