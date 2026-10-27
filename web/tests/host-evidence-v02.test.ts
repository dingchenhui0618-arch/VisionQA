import assert from "node:assert/strict";
import test from "node:test";
import {
  hostEvidenceSchemaVersion,
  hostEvidenceToVisualReviewV02Request,
  parseHostEvidenceCapture,
} from "../lib/visionqa/host-evidence-v0.2.ts";

const capture = () => parseHostEvidenceCapture({
  schema_version: hostEvidenceSchemaVersion,
  capture_id: "m3-chrome-capture",
  conversation_id: "m3-conversation",
  host: { type: "chrome-extension", adapter_version: "0.2.0" },
  page: {
    url: "https://example.com/review",
    title: "Review page",
    revision_id: "rev-123",
    revision_source: "url-dom-summary",
    viewport: { width: 1440, height: 900, device_scale_factor: 1 },
  },
  dom: {
    text: "Title Review",
    headings: ["Review"],
    landmarks: ["main"],
    interactive_summary: "按钮：提交",
    elements: [{
      id: "hero-title",
      selector: "main h1",
      tag: "h1",
      text: "Review",
      rect: { x: 96, y: 120, width: 400, height: 72 },
      computed_style: { display: "block", font_size: "48px", line_height: "1.1", color: "rgb(0, 0, 0)" },
      selected: true,
    }],
    selected_element: {
      id: "hero-title",
      selector: "main h1",
      tag: "h1",
      text: "Review",
      rect: { x: 96, y: 120, width: 400, height: 72 },
      computed_style: { display: "block", font_size: "48px", line_height: "1.1", color: "rgb(0, 0, 0)" },
      selected: true,
    },
  },
  conversation: [{ role: "user", content: "检查标题层级" }],
  intent: { goal: "检查当前页面的视觉层级", must_keep: [] },
  images: [{ role: "candidate", name: "visible.png", mime_type: "image/png", data_url: "data:image/png;base64,ZmFrZQ==" }],
  permissions: { can_call_model: false, can_read_source: false, can_write_source: false },
});

test("M3 host evidence parses geometry, style, selected element and revision", () => {
  const value = capture();
  assert.equal(value.page.revision_id, "rev-123");
  assert.equal(value.dom.elements[0].selector, "main h1");
  assert.equal(value.dom.elements[0].rect.width, 400);
  assert.equal(value.dom.elements[0].computed_style.font_size, "48px");
  assert.equal(value.dom.selected_element?.selected, true);
});

test("M3 converter produces v0.2 evidence anchors and keeps source writes off", () => {
  const request = hostEvidenceToVisualReviewV02Request(capture());
  assert.equal(request.schema_version, "visual-review-v0.2");
  assert.equal(request.revision_id, "rev-123");
  assert.equal(request.context?.comparison_revision_id, "rev-123");
  assert.equal(request.artifact.evidence_anchors[0]?.kind, "dom_selector");
  assert.equal(request.artifact.evidence_anchors[0]?.selector, "main h1");
  assert.deepEqual(request.artifact.evidence_anchors[0]?.rect, { x: 96, y: 120, width: 400, height: 72 });
  assert.equal(request.permissions?.can_write_source, false);
});

test("M3 host evidence cannot elevate source-write permission", () => {
  assert.throws(() => parseHostEvidenceCapture({ ...capture(), permissions: { can_call_model: false, can_read_source: true, can_write_source: true } }), /write|permissions/i);
});
