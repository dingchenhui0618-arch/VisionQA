import assert from "node:assert/strict";
import test from "node:test";
import { runGroundedMarketingAgents } from "../lib/visionqa/agents/local-orchestrator.ts";

test("marketing agents ground outputs in supplied facts and review evidence", () => {
  const run = runGroundedMarketingAgents({ product_name: "SKU-001", source_label: "人工输入", evidence_mode: "HUMAN_REVIEW_REQUIRED", audience_segments: ["Z 世代"], scenarios: ["通勤"], purchase_drivers: ["版型"], review_issues: ["腰线位置需复核"], locked_attributes: ["主色", "腰线"], product_expression: null });
  assert.equal(run.execution_mode, "LOCAL_RULES_NO_NETWORK");
  assert.equal(run.status, "NEEDS_INPUT");
  assert.ok(run.output.social_copy.小红书.evidence_refs.length >= 4);
  assert.match(run.output.social_copy.小红书.body, /Z 世代/);
  assert.equal(run.audit.unsupported_claims.length, 0);
  assert.equal(run.audit.human_final_review_required, true);
  assert.equal(run.agents.find((agent) => agent.id === "expression-reviewer")?.status, "BLOCKED");
});

test("marketing agents fail closed when core facts are missing", () => {
  const run = runGroundedMarketingAgents({ product_name: "待确认商品", source_label: "空输入", evidence_mode: "HUMAN_REVIEW_REQUIRED", audience_segments: [], scenarios: [], purchase_drivers: [], review_issues: [], locked_attributes: [], product_expression: null });
  assert.equal(run.status, "NEEDS_INPUT");
  assert.equal(run.agents.find((agent) => agent.id === "marketing-strategist")?.status, "BLOCKED");
  assert.ok(run.unknowns.includes("目标人群未确认"));
});
