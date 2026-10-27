import assert from "node:assert/strict";
import test from "node:test";
import { toPluginUiResult } from "../lib/visionqa/review-ui-adapter.ts";

test("UI adapter keeps legacy results human-readable and hides provider details", () => {
  const result = toPluginUiResult({
    schema_version: "visual-review-v0.1",
    request_id: "legacy-ui-1",
    decision: "NEEDS_REVISION",
    summary: "首屏层级需要调整。",
    issues: [{
      id: "issue-1",
      category: "hierarchy",
      severity: "high",
      confidence: 0.9,
      evidence: [{ source: "pixel", description: "标题与正文距离过近。" }],
      suggested_fix: "拉开标题与正文的间距。",
    }],
    repair_plan: { type: "manual_plan", requires_approval: true, operations: [{ action: "调整标题间距" }] },
    verification: { required: true, checks: ["确认标题层级"] },
    usage: { mode: "byok", provider: "deepseek", model: "deepseek-flash" },
  });
  assert.equal(result.schema_version, "visionqa-ui-v0.1");
  assert.equal(result.decision_label, "建议修正");
  assert.equal(result.issues[0]?.title, "层级不够清楚");
  assert.equal(result.issues[0]?.priority, "优先处理");
  assert.equal(result.issues[0]?.evidence[0]?.label, "截图证据");
  assert.equal(result.preview_only, false);
});

test("UI adapter exposes v0.2 DOM anchor and revision without exposing contract jargon", () => {
  const result = toPluginUiResult({
    schema_version: "visual-review-v0.2",
    request_id: "host-ui-1",
    revision_id: "rev-7",
    decision: "MANUAL_REVIEW",
    summary: "需要确认当前页面的标题层级。",
    observations: {
      schema_version: "observation-envelope-v0.1",
      review_mode: "visual",
      profile: { id: "visual-baseline", version: "0.1.0", kind: "builtin" },
      observations: [{
        id: "dom-heading",
        dimension: "hierarchy",
        statement: "标题层级需要人工确认。",
        status: "possible",
        severity: "high",
        confidence: 0.7,
        evidence: [{ id: "anchor-1", kind: "dom_selector", selector: "main h1", rect: { x: 10, y: 20, width: 200, height: 40 }, description: "页面主标题" }],
        recommendation: "确认主标题是否为页面唯一主层级。",
      }],
    },
    issues: [],
    repair_plan: { type: "manual_plan", requires_approval: true, operations: [] },
    verification: { required: true, checks: ["重新采集页面"] },
    usage: { mode: "byok", provider: "user", model: "multimodal" },
  });
  assert.equal(result.revision_id, "rev-7");
  assert.equal(result.issues[0]?.title, "层级不够清楚");
  assert.equal(result.issues[0]?.evidence[0]?.selector, "main h1");
  assert.deepEqual(result.issues[0]?.evidence[0]?.rect, { x: 10, y: 20, width: 200, height: 40 });
});
