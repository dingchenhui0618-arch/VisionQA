import assert from "node:assert/strict";
import test from "node:test";
import {
  assertM2HostFixtureShape,
  createCodeHostFixture,
  createCodeMockResponse,
  createCodeReviewFixture,
  createLinkedHostFixture,
  createLinkedMockResponse,
  createLinkedReviewFixture,
  createOfflineMockFlow,
  createVisualHostFixture,
  hostCaptureToVisualReviewV02Request,
} from "../lib/visionqa/m2-host-fixtures.ts";
import {
  parseCodeReviewV01Request,
  parseCodeReviewV01Response,
  parseVisualReviewV02Request,
  parseVisualReviewV02Response,
} from "../lib/visionqa/review-contract-v0.2.ts";

test("Visual fixture upgrades Host Capture into a v0.2 request", () => {
  const host = createVisualHostFixture();
  assert.equal(assertM2HostFixtureShape(host).page.viewport.width, 1440);
  const request = hostCaptureToVisualReviewV02Request(host);
  assert.equal(parseVisualReviewV02Request(request).schema_version, "visual-review-v0.2");
  assert.equal(request.review_mode, "visual");
  assert.equal(request.artifact.evidence_anchors[0]?.kind, "dom_selector");
  assert.equal(request.context?.dom_summary?.includes("主标题"), true);
  assert.equal(request.permissions?.can_write_source, false);
});

test("Visual Mock flow returns v0.2 observations with pixel and DOM evidence", () => {
  const flow = createOfflineMockFlow("visual");
  const response = parseVisualReviewV02Response(flow.response);
  assert.equal(flow.kind, "visual");
  assert.equal(response.observations.review_mode, "visual");
  assert.equal(response.usage.mode, "mock");
  assert.deepEqual(response.issues[0]?.evidence_anchors.map((anchor) => anchor.kind), ["pixel_bbox", "dom_selector"]);
  assert.equal(response.repair_plan.requires_approval, true);
});

test("Code fixture keeps source, AST and diff references in CodeReview", () => {
  const host = createCodeHostFixture();
  const request = createCodeReviewFixture();
  const parsed = parseCodeReviewV01Request(request);
  assert.equal(host.source.ast.selector, "ReviewPanel > button");
  assert.equal(parsed.target, "diff");
  assert.equal(parsed.source_artifacts[0]?.ast_ref, "fixture://ast/review-panel.json");
  assert.equal(parsed.context?.source_summary?.includes("ReviewPanel"), true);
  assert.equal(parsed.permissions?.can_write_source, false);

  const response = parseCodeReviewV01Response(createCodeMockResponse(parsed));
  assert.equal(response.observations.review_mode, "code");
  assert.equal(response.issues[0]?.evidence[0]?.kind, "source_range");
  assert.equal(response.repair_plan.requires_approval, true);
});

test("Linked fixture preserves screenshot, DOM, source and diff evidence", () => {
  const host = createLinkedHostFixture();
  const request = createLinkedReviewFixture();
  const parsed = parseVisualReviewV02Request(request);
  assert.equal(host.capture.images.length, 1);
  assert.equal(parsed.review_mode, "linked");
  assert.equal(parsed.profile.id, "linked-review");
  assert.equal(parsed.permissions?.can_read_source, true);
  assert.equal(parsed.permissions?.can_write_source, false);
  assert.equal(parsed.context?.source_summary?.includes("Diff:"), true);

  const response = parseVisualReviewV02Response(createLinkedMockResponse(parsed));
  assert.equal(response.observations.review_mode, "linked");
  assert.deepEqual(response.issues[0]?.evidence_anchors.map((anchor) => anchor.kind), ["pixel_bbox", "dom_selector", "source_range"]);
  assert.equal(response.repair_plan.type, "source_patch");
});

test("All M2 offline flows are deterministic and never grant source-write permission", () => {
  for (const kind of ["visual", "code", "linked"] as const) {
    const first = createOfflineMockFlow(kind);
    const second = createOfflineMockFlow(kind);
    assert.deepEqual(first.request, second.request);
    assert.deepEqual(first.response, second.response);
    assert.equal(first.request.permissions?.can_write_source, false);
    assert.equal(first.response.usage.mode, "mock");
  }
});

test("A linked visual request can be created explicitly from a Host Capture", () => {
  const request = hostCaptureToVisualReviewV02Request(createVisualHostFixture(), {
    linked: true,
    sourceSummary: "src/components/ReviewPanel.tsx:1",
  });
  assert.equal(request.review_mode, "linked");
  assert.equal(request.profile.id, "linked-review");
  assert.equal(request.context?.source_summary, "src/components/ReviewPanel.tsx:1");
  assert.equal(createLinkedMockResponse(request).observations.review_mode, "linked");
});

