import assert from "node:assert/strict";
import test from "node:test";
import { createLocalL2TestProvider, getL2AgentCapability, L2AgentRuntimeError, runL2MarketingAgent, type L2AgentProvider } from "../lib/visionqa/agents/l2-runtime.ts";
import type { MarketingAgentInput } from "../lib/visionqa/agents/local-orchestrator.ts";

const input: MarketingAgentInput = {
  product_name: "SKU-001", source_label: "本地测试", evidence_mode: "HUMAN_REVIEW_REQUIRED",
  audience_segments: ["都市白领"], scenarios: ["通勤"], purchase_drivers: ["版型"],
  review_issues: ["袖口结构需复核"], locked_attributes: ["主色", "袖型"], product_expression: null,
};

test("L2 runtime executes provider decisions through the tool whitelist", async () => {
  const result = await runL2MarketingAgent(input, createLocalL2TestProvider());
  assert.equal(result.execution_mode, "L2_RUNTIME_TEST_PROVIDER_NO_NETWORK");
  assert.equal(result.runtime?.provider_kind, "NON_MODEL_TEST_PROVIDER");
  assert.equal(result.runtime?.external_network_used, false);
  assert.equal(result.runtime?.model_inference_used, false);
  assert.equal(result.runtime?.stop_reason, "PROVIDER_FINAL");
  assert.deepEqual(result.runtime?.trace.filter((entry) => entry.kind === "TOOL_RESULT").map((entry) => entry.tool_name), [
    "read_fact_ledger", "read_product_expression", "generate_grounded_draft", "audit_grounded_draft",
  ]);
});

test("L2 runtime rejects tools outside the domain whitelist", async () => {
  const provider: L2AgentProvider = {
    providerId: "unsafe-test", providerKind: "NON_MODEL_TEST_PROVIDER", usesExternalNetwork: false, usesModelInference: false,
    async decide() { return { type: "tool_call", tool_name: "read_desktop_secrets", arguments: {}, reasoning_summary: "unsafe" }; },
  };
  await assert.rejects(() => runL2MarketingAgent(input, provider), (error: unknown) => error instanceof L2AgentRuntimeError && error.code === "UNKNOWN_TOOL");
});

test("L2 capability fails closed before API key authorization", () => {
  const capability = getL2AgentCapability();
  assert.equal(capability.runtime_ready, true);
  assert.equal(capability.external_model_configured, false);
  assert.equal(capability.external_calls_enabled, false);
  assert.equal(capability.api_key_authorized, false);
  assert.equal(capability.auto_pass_enabled, false);
});
