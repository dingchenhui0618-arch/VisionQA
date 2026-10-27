import { z } from "zod";
import {
  codeReviewV01RequestSchema,
  parseCodeReviewV01Request,
  type CodeReviewV01Request,
} from "./review-contract-v0.2.ts";
import {
  hostEvidenceToVisualReviewV02Request,
  type HostEvidenceCapture,
} from "./host-evidence-v0.2.ts";
import type { VisualReviewV02Request } from "./review-contract-v0.2.ts";

/**
 * Structured source evidence supplied by an MCP host.  The adapter receives
 * bounded source/AST/Diff summaries, not a filesystem handle, command
 * execution capability, or a write callback.
 */
export const mcpSourceFileSchema = z.object({
  file: z.string().trim().min(1).max(1000),
  language: z.string().trim().max(80).optional(),
  source: z.string().max(12000),
  ast_summary: z.string().max(6000).optional(),
  diff: z.string().max(12000).optional(),
}).strict();

export const mcpSourceEvidenceSchema = z.object({
  revision_id: z.string().trim().min(1).max(160),
  files: z.array(mcpSourceFileSchema).min(1).max(32),
}).strict();

export type McpSourceEvidence = z.infer<typeof mcpSourceEvidenceSchema>;

export function parseMcpSourceEvidence(input: unknown): McpSourceEvidence {
  return mcpSourceEvidenceSchema.parse(input);
}

function sourceSummary(source: McpSourceEvidence): string {
  return source.files.map((file) => [
    `FILE: ${file.file}`,
    file.language ? `LANGUAGE: ${file.language}` : "",
    `SOURCE:\n${file.source}`,
    file.ast_summary ? `AST:\n${file.ast_summary}` : "",
    file.diff ? `DIFF:\n${file.diff}` : "",
  ].filter(Boolean).join("\n")).join("\n\n").slice(0, 12000);
}

/** Build the shared CodeReview request from the MCP source/AST/Diff envelope. */
export function mcpSourceEvidenceToCodeReviewRequest(
  input: McpSourceEvidence,
  options: { readonly goal?: string; readonly conversation?: NonNullable<CodeReviewV01Request["context"]>["conversation"] } = {},
): CodeReviewV01Request {
  const source = parseMcpSourceEvidence(input);
  return parseCodeReviewV01Request({
    schema_version: "code-review-v0.1",
    request_id: `mcp-code-${source.revision_id}`,
    conversation_id: `mcp-conversation-${source.revision_id}`,
    host: { type: "mcp", adapter_version: "0.2.0" },
    target: source.files.some((file) => file.diff) ? "diff" : "source",
    source_artifacts: source.files.map((file) => ({
      file: file.file,
      language: file.language,
      content_ref: `mcp://source/${encodeURIComponent(file.file)}`,
      diff_ref: file.diff ? `mcp://diff/${encodeURIComponent(file.file)}` : undefined,
      ast_ref: file.ast_summary ? `mcp://ast/${encodeURIComponent(file.file)}` : undefined,
    })),
    intent: {
      goal: options.goal?.trim() || "检查 MCP 宿主提供的源码、AST 和 Diff 证据。",
      platform: "mcp-host",
    },
    profile: { id: "code-quality", version: "0.1.0", kind: "builtin" },
    context: {
      source_summary: sourceSummary(source),
      conversation: options.conversation || [],
      comparison_revision_id: source.revision_id,
    },
    permissions: {
      can_read_source: true,
      can_write_source: false,
      can_call_model: false,
      can_render: false,
      can_run_commands: false,
    },
    operation: "review",
    revision_id: source.revision_id,
  });
}

/** Link the MCP source evidence to a real Chrome/MCP visual capture. */
export function mcpSourceEvidenceToLinkedReviewRequest(
  capture: HostEvidenceCapture,
  source: McpSourceEvidence,
): VisualReviewV02Request {
  const parsed = parseMcpSourceEvidence(source);
  return hostEvidenceToVisualReviewV02Request(capture, {
    linked: true,
    sourceSummary: sourceSummary(parsed),
  });
}

// Keep the exported schema referenced in generated declaration/build checks.
export const mcpCodeReviewRequestSchema = codeReviewV01RequestSchema;
