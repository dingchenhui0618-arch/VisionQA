import assert from "node:assert/strict";
import test from "node:test";
import {
  createMockVisualReview,
  parseVisualReviewRequest,
  parseVisualReviewResponse,
} from "../lib/visionqa/visual-review-contract.ts";

const baseRequest = {
  schema_version: "visual-review-v0.1",
  request_id: "test-request",
  conversation_id: "test-conversation",
  host: { type: "test", adapter_version: "0.1.0" },
  artifact: { type: "web_page", screenshot_ref: "local://screenshot.png" },
  intent: { goal: "检查官网首屏层级" },
  permissions: { can_write_source: false },
  operation: "review",
} as const;

test("VisualReview request rejects an unsupported schema version", () => {
  assert.throws(() => parseVisualReviewRequest({ ...baseRequest, schema_version: "legacy" }));
});
test("Mock review remains explicit about missing real provider evidence", () => {
  const result = parseVisualReviewResponse(createMockVisualReview(parseVisualReviewRequest(baseRequest)));
  assert.equal(result.decision, "MANUAL_REVIEW");
  assert.equal(result.usage.mode, "mock");
  assert.equal(result.usage.provider, "fixture");
  assert.equal(result.repair_plan.requires_approval, true);
  assert.match(result.summary, /Mock/);
});

test("Missing artifact evidence cannot produce a visual pass", () => {
  const result = createMockVisualReview(parseVisualReviewRequest({
    ...baseRequest,
    artifact: { type: "image" },
  }));
  assert.equal(result.decision, "NEEDS_CONTEXT");
  assert.equal(result.issues.length, 0);
});
