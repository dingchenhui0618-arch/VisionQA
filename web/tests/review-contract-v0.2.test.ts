import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCodeReviewV01Request,
  parseCodeReviewV01Response,
  parseVisualReviewV02Request,
} from "../lib/visionqa/review-contract-v0.2.ts";

const profile = { id: "visual-baseline", version: "0.1.0", kind: "builtin" } as const;
const host = { type: "test", adapter_version: "0.2.0" } as const;
const intent = { goal: "确认首屏是否有清晰的视觉层级" } as const;

test("VisualReview v0.2 accepts a visual artifact with evidence context", () => {
  const request = parseVisualReviewV02Request({
    schema_version: "visual-review-v0.2",
    request_id: "visual-v02-request",
    conversation_id: "conversation-1",
    host,
    artifact: {
      type: "web_page",
      role: "primary",
      screenshot_ref: "local://screenshot.png",
      evidence_anchors: [{
        id: "hero",
        kind: "dom_selector",
        selector: "main h1",
        description: "页面主标题",
      }],
    },
    intent,
    profile,
    review_mode: "visual",
    context: { dom_summary: "main h1: VisionQA" },
    permissions: { can_write_source: false },
    operation: "review",
  });

  assert.equal(request.schema_version, "visual-review-v0.2");
  assert.equal(request.artifact.evidence_anchors[0]?.kind, "dom_selector");
});

test("VisualReview v0.2 rejects an inverted source evidence range", () => {
  assert.throws(() => parseVisualReviewV02Request({
    schema_version: "visual-review-v0.2",
    request_id: "visual-v02-invalid",
    conversation_id: "conversation-1",
    host,
    artifact: {
      type: "web_page",
      screenshot_ref: "local://screenshot.png",
      evidence_anchors: [{
        id: "bad-range",
        kind: "source_range",
        file: "src/App.tsx",
        start_line: 20,
        end_line: 10,
        description: "无效范围",
      }],
    },
    intent,
    profile,
    operation: "review",
  }));
});

test("CodeReview v0.1 keeps source context separate from visual artifacts", () => {
  const request = parseCodeReviewV01Request({
    schema_version: "code-review-v0.1",
    request_id: "code-v01-request",
    conversation_id: "conversation-2",
    host,
    target: "diff",
    source_artifacts: [{
      file: "src/components/ReviewPanel.tsx",
      language: "tsx",
      diff_ref: "local://review-panel.diff",
      ast_ref: "local://review-panel.ast.json",
    }],
    intent: { goal: "检查可维护性和无障碍实现" },
    profile: { id: "code-quality", version: "0.1.0", kind: "builtin" },
    permissions: { can_write_source: false },
    operation: "review",
  });

  assert.equal(request.target, "diff");
  assert.equal(request.source_artifacts[0]?.language, "tsx");
});

test("CodeReview response requires evidence and an approval-gated repair plan", () => {
  const response = parseCodeReviewV01Response({
    schema_version: "code-review-v0.1",
    request_id: "code-v01-response",
    decision: "NEEDS_REVISION",
    summary: "发现一个需要修正的边界问题。",
    observations: {
      schema_version: "observation-envelope-v0.1",
      review_mode: "code",
      profile: { id: "code-quality", version: "0.1.0", kind: "builtin" },
      observations: [{
        id: "obs-1",
        dimension: "module_boundaries",
        statement: "组件同时承担数据获取与展示职责。",
        status: "confirmed",
        severity: "medium",
        confidence: 0.9,
        evidence: [{
          id: "source-1",
          kind: "source_range",
          file: "src/components/ReviewPanel.tsx",
          start_line: 12,
          end_line: 34,
          description: "组件内直接发起数据请求",
        }],
        recommendation: "将数据获取移到容器层。",
      }],
    },
    issues: [{
      id: "issue-1",
      category: "module_boundaries",
      severity: "medium",
      confidence: 0.9,
      statement: "组件职责过宽。",
      evidence: [{
        id: "source-1",
        kind: "source_range",
        file: "src/components/ReviewPanel.tsx",
        start_line: 12,
        end_line: 34,
        description: "组件内直接发起数据请求",
      }],
      suggested_fix: "拆出数据容器并保留展示组件。",
    }],
    repair_plan: {
      type: "source_patch",
      requires_approval: true,
      operations: [{ action: "拆分数据获取与展示职责", target: "src/components/ReviewPanel.tsx" }],
    },
    verification: { required: true, checks: ["运行类型检查和组件测试"] },
    usage: { mode: "mock", provider: "fixture", model: "fixture-code-review-v0.1" },
  });

  assert.equal(response.observations.review_mode, "code");
  assert.equal(response.repair_plan.requires_approval, true);
});
