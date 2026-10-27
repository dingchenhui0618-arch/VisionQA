import assert from "node:assert/strict";
import test from "node:test";
import { createVisualHostFixture } from "../lib/visionqa/m2-host-fixtures.ts";
import {
  mcpSourceEvidenceToCodeReviewRequest,
  mcpSourceEvidenceToLinkedReviewRequest,
  parseMcpSourceEvidence,
} from "../lib/visionqa/mcp-host-contract.ts";
import { parseHostEvidenceCapture } from "../lib/visionqa/host-evidence-v0.2.ts";

const source = () => parseMcpSourceEvidence({
  revision_id: "mcp-rev-1",
  files: [{
    file: "src/ReviewPanel.tsx",
    language: "tsx",
    source: "export function ReviewPanel() { return <button>Review</button>; }",
    ast_summary: "jsx: ReviewPanel > button",
    diff: "@@ -1 +1 @@\n+<button>Review</button>",
  }],
});

test("M3 MCP source envelope preserves source, AST, Diff and revision", () => {
  const request = mcpSourceEvidenceToCodeReviewRequest(source(), { goal: "检查组件" });
  assert.equal(request.schema_version, "code-review-v0.1");
  assert.equal(request.host.type, "mcp");
  assert.equal(request.revision_id, "mcp-rev-1");
  assert.equal(request.target, "diff");
  assert.equal(request.source_artifacts[0].ast_ref, "mcp://ast/src%2FReviewPanel.tsx");
  assert.match(request.context?.source_summary || "", /AST:/);
  assert.match(request.context?.source_summary || "", /DIFF:/);
  assert.equal(request.permissions?.can_write_source, false);
});

test("M3 MCP linked converter joins visual capture and source evidence without write permission", () => {
  const base = createVisualHostFixture();
  const capture = parseHostEvidenceCapture({
    ...base,
    schema_version: "visionqa-host-capture-v0.2",
    page: { ...base.page, revision_id: "chrome-rev-1", revision_source: "host-supplied" },
    dom: {
      ...base.dom,
      elements: [{
        id: "hero",
        selector: "main h1",
        tag: "h1",
        text: "Review",
        rect: { x: 10, y: 20, width: 300, height: 60 },
        computed_style: { font_size: "40px" },
        selected: true,
      }],
    },
  });
  const request = mcpSourceEvidenceToLinkedReviewRequest(capture, source());
  assert.equal(request.review_mode, "linked");
  assert.equal(request.profile.id, "linked-review");
  assert.equal(request.context?.comparison_revision_id, "chrome-rev-1");
  assert.equal(request.permissions?.can_write_source, false);
  assert.match(request.context?.source_summary || "", /ReviewPanel/);
});
