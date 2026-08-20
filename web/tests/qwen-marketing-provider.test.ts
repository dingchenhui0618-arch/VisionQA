import assert from "node:assert/strict";
import test from "node:test";
import {
  QWEN_MARKETING_ENDPOINT,
  QWEN_MARKETING_MODEL_SNAPSHOT,
  QwenMarketingAgentProvider,
  QwenMarketingProviderError,
  createGovernedQwenMarketingProvider,
  getQwenMarketingReadiness,
} from "../lib/visionqa/agents/qwen-marketing-provider.ts";

const decisionInput = {
  objective: "生成可追溯营销草案",
  observations: [],
  allowedTools: ["read_fact_ledger", "read_product_expression", "generate_grounded_draft", "audit_grounded_draft"] as const,
};

test("Qwen marketing readiness fails closed before key and payment authorization", () => {
  const readiness = getQwenMarketingReadiness({});
  assert.equal(readiness.adapter_ready, true);
  assert.equal(readiness.api_key_configured, false);
  assert.equal(readiness.paid_calls_enabled, false);
  assert.equal(readiness.live_ready, false);
  assert.ok(readiness.blockers.includes("API_KEY_NOT_CONFIGURED"));
  assert.throws(() => createGovernedQwenMarketingProvider({}), (error: unknown) => error instanceof QwenMarketingProviderError && error.code === "CONFIGURATION");
});

test("Qwen provider sends only structured observations with search disabled", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const provider = new QwenMarketingAgentProvider("test-secret", async (url, init) => {
    requestUrl = String(url);
    requestInit = init;
    return new Response(JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ id: "call-1", type: "function", function: { name: "read_fact_ledger", arguments: "{}" } }] } }] }), { status: 200 });
  });
  const decision = await provider.decide(decisionInput);
  assert.equal(decision.type, "tool_call");
  assert.equal(decision.type === "tool_call" ? decision.tool_name : "", "read_fact_ledger");
  assert.equal(requestUrl, QWEN_MARKETING_ENDPOINT);
  const body = JSON.parse(String(requestInit?.body));
  assert.equal(body.model, QWEN_MARKETING_MODEL_SNAPSHOT);
  assert.equal(body.enable_search, false);
  assert.equal(body.parallel_tool_calls, false);
  assert.equal(body.tool_choice, "auto");
  assert.equal(JSON.stringify(body).includes("test-secret"), false);
  assert.match(String(new Headers(requestInit?.headers).get("authorization")), /^Bearer test-secret$/);
});

test("Qwen provider accepts a complete stop and rejects malformed tool arguments", async () => {
  const stopProvider = new QwenMarketingAgentProvider("test-secret", async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "完成" } }] }), { status: 200 }));
  assert.equal((await stopProvider.decide(decisionInput)).type, "final");
  const invalidProvider = new QwenMarketingAgentProvider("test-secret", async () => new Response(JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ function: { name: "read_fact_ledger", arguments: "{" } }] } }] }), { status: 200 }));
  await assert.rejects(() => invalidProvider.decide(decisionInput), (error: unknown) => error instanceof QwenMarketingProviderError && error.code === "INVALID_OUTPUT");
});
