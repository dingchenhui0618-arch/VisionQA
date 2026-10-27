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

test("UI adapter keeps preview results free of implementation jargon", () => {
  const result = toPluginUiResult({
    schema_version: "visual-review-v0.1",
    request_id: "legacy-ui-3",
    decision: "MANUAL_REVIEW",
    summary: "Mock 适配器已收到图片，但没有调用真实 Provider。",
    issues: [],
    repair_plan: { type: "manual_plan", requires_approval: true, operations: [{ action: "connect_authorized_visual_provider" }] },
    verification: { required: true, checks: ["确认已使用真实视觉 Provider", "确认输入产物与当前 revision 一致"] },
    usage: { mode: "mock", provider: "fixture", model: "fixture" },
  });
  assert.equal(result.summary.includes("Mock"), false);
  assert.equal(result.summary.includes("Provider"), false);
  assert.equal(result.issues.every((issue) => !JSON.stringify(issue).includes("Provider")), true);
  assert.equal(result.verification_checks[0], "确认这次结果来自可用的视觉模型");
  assert.equal(result.verification_checks[1], "确认结果对应当前这张图片或当前页面");
});

test("UI adapter translates internal operation identifiers into an actionable next step", () => {
  const result = toPluginUiResult({
    schema_version: "visual-review-v0.1",
    request_id: "legacy-ui-2",
    decision: "MANUAL_REVIEW",
    summary: "当前只能确认输入已收到。",
    issues: [],
    repair_plan: { type: "manual_plan", requires_approval: true, operations: [{ action: "connect_authorized_visual_provider" }] },
    verification: { required: true, checks: ["人工确认"] },
    usage: { mode: "mock", provider: "fixture", model: "fixture" },
  });
  assert.equal(result.next_step, "接入可用的视觉模型后再检查，或先由人工确认这份结果。");
  assert.equal(result.next_step.includes("connect_authorized_visual_provider"), false);
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
