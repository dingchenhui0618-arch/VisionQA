import assert from "node:assert/strict";
import test from "node:test";
import {
  runCodeReviewV01Mock,
  runLinkedReviewMock,
  runReviewMock,
  runVisualReviewV02Mock,
} from "../lib/visionqa/plugin-runtime.ts";
import {
  parseCodeReviewV01Request,
  parseVisualReviewV02Request,
} from "../lib/visionqa/review-contract-v0.2.ts";

const host = { type: "fixture-host", adapter_version: "0.2.0" } as const;

function visualRequest(overrides: Record<string, unknown> = {}) {
  return parseVisualReviewV02Request({
    schema_version: "visual-review-v0.2",
    request_id: "fixture-visual-request",
    conversation_id: "fixture-conversation",
    host,
    artifact: {
      type: "web_page",
      role: "primary",
      name: "Fixture page",
      screenshot_ref: "fixture://screenshot",
      structure_ref: "fixture://dom",
      evidence_anchors: [],
    },
    intent: { goal: "检查视觉层级和交互可见性" },
    profile: { id: "visual-baseline", version: "0.1.0", kind: "builtin" },
    review_mode: "visual",
    permissions: { can_write_source: false },
    operation: "review",
    ...overrides,
  });
}

function codeRequest() {
  return parseCodeReviewV01Request({
    schema_version: "code-review-v0.1",
    request_id: "fixture-code-request",
    conversation_id: "fixture-conversation",
    host,
    target: "diff",
    source_artifacts: [{
      file: "src/ReviewPanel.tsx",
      language: "tsx",
      diff_ref: "fixture://review-panel.diff",
    }],
    intent: { goal: "检查可读性、边界和无障碍实现" },
    profile: { id: "code-quality", version: "0.1.0", kind: "builtin" },
    permissions: { can_write_source: false },
    operation: "review",
  });
}

test("VisualReview v0.2 Mock returns a fixture-only, non-assessable result", () => {
  const result = runVisualReviewV02Mock(visualRequest());
  assert.equal(result.contract.schema_version, "visual-review-v0.2");
  assert.equal(result.contract.decision, "NOT_ASSESSABLE");
  assert.equal(result.contract.observations.review_mode, "visual");
  assert.equal(result.contract.usage.mode, "mock");
  assert.equal(result.contract.repair_plan.requires_approval, true);
  assert.ok(result.provider.warnings.includes("MOCK_RUNTIME_NO_PROVIDER_OR_NETWORK_CALL"));
});

test("CodeReview v0.1 Mock keeps source review separate from visual review", () => {
  const result = runCodeReviewV01Mock(codeRequest());
  assert.equal(result.contract.schema_version, "code-review-v0.1");
  assert.equal(result.contract.decision, "NOT_ASSESSABLE");
  assert.equal(result.contract.observations.review_mode, "code");
  assert.equal(result.contract.issues.length, 0);
  assert.equal(result.contract.repair_plan.requires_approval, true);
});

test("Linked Mock requires linked profile/mode and returns an approval-gated plan", () => {
  const request = visualRequest({
    request_id: "fixture-linked-request",
    review_mode: "linked",
    profile: { id: "linked-review", version: "0.1.0", kind: "builtin" },
    artifact: {
      type: "web_page",
      role: "primary",
      screenshot_ref: "fixture://screenshot",
      source_ref: "fixture://source",
      evidence_anchors: [],
    },
  });
  const result = runLinkedReviewMock(request);
  assert.equal(result.contract.observations.review_mode, "linked");
  assert.equal(result.contract.decision, "NOT_ASSESSABLE");
  assert.equal(result.contract.repair_plan.requires_approval, true);
});

test("Unified Mock dispatcher selects Code, Linked, and Visual modes", () => {
  assert.equal(runReviewMock(codeRequest()).contract.schema_version, "code-review-v0.1");
  assert.equal(runReviewMock(visualRequest()).contract.schema_version, "visual-review-v0.2");
  assert.equal(runReviewMock(visualRequest({
    review_mode: "linked",
    profile: { id: "linked-review", version: "0.1.0", kind: "builtin" },
  })).contract.schema_version, "visual-review-v0.2");
});

test("Mock dispatcher rejects a profile/mode mismatch before any provider path", () => {
  assert.throws(() => runReviewMock(visualRequest({
    review_mode: "visual",
    profile: { id: "linked-review", version: "0.1.0", kind: "builtin" },
  })), /与 visual 评审模式不匹配/);
});

