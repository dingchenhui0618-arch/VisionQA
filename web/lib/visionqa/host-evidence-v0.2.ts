import { z } from "zod";
import {
  parseVisualReviewV02Request,
  type EvidenceAnchor,
  type VisualReviewV02Request,
} from "./review-contract-v0.2.ts";
import {
  parseVisualReviewRequest,
  type VisualReviewRequest,
  type VisualReviewResponse,
} from "./visual-review-contract.ts";
import {
  parseVisualReviewV02Response,
  type VisualReviewV02Response,
} from "./review-contract-v0.2.ts";
import { hostCaptureSchema } from "./host-adapter-contract.ts";

/**
 * Host evidence v0.2 is additive to the original capture envelope.  It keeps
 * the screenshot and bounded text summary, but also carries the small amount
 * of geometry/style metadata needed to locate a visual observation later.
 * It deliberately does not carry page HTML, secrets, or source-write APIs.
 */
export const hostEvidenceSchemaVersion = "visionqa-host-capture-v0.2" as const;

const rectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
}).strict();

export const computedStyleSummarySchema = z.object({
  display: z.string().trim().max(80).optional(),
  position: z.string().trim().max(80).optional(),
  color: z.string().trim().max(120).optional(),
  background_color: z.string().trim().max(120).optional(),
  font_family: z.string().trim().max(240).optional(),
  font_size: z.string().trim().max(40).optional(),
  font_weight: z.string().trim().max(40).optional(),
  line_height: z.string().trim().max(40).optional(),
  letter_spacing: z.string().trim().max(40).optional(),
  border_radius: z.string().trim().max(80).optional(),
  opacity: z.string().trim().max(40).optional(),
  visibility: z.string().trim().max(40).optional(),
  z_index: z.string().trim().max(40).optional(),
}).strict();

export const hostDomElementEvidenceSchema = z.object({
  id: z.string().trim().min(1).max(160),
  selector: z.string().trim().min(1).max(2000),
  tag: z.string().trim().min(1).max(40),
  role: z.string().trim().max(120).optional(),
  text: z.string().trim().max(300).optional(),
  rect: rectSchema,
  computed_style: computedStyleSummarySchema,
  selected: z.boolean().default(false),
}).strict();

const baseCaptureShape = hostCaptureSchema.omit({ schema_version: true, page: true, dom: true });

export const hostEvidenceCaptureSchema = baseCaptureShape.extend({
  schema_version: z.literal(hostEvidenceSchemaVersion),
  page: hostCaptureSchema.shape.page.extend({
    revision_id: z.string().trim().min(1).max(160),
    revision_source: z.enum(["url-dom-summary", "host-supplied", "unknown"]).default("url-dom-summary"),
  }).strict(),
  dom: hostCaptureSchema.shape.dom.extend({
    elements: z.array(hostDomElementEvidenceSchema).max(64).default([]),
    selected_element: hostDomElementEvidenceSchema.optional(),
  }).strict(),
}).strict();

export type HostEvidenceCapture = z.infer<typeof hostEvidenceCaptureSchema>;
export type HostDomElementEvidence = z.infer<typeof hostDomElementEvidenceSchema>;

export function parseHostEvidenceCapture(input: unknown): HostEvidenceCapture {
  return hostEvidenceCaptureSchema.parse(input);
}

function toDomAnchor(element: HostDomElementEvidence): EvidenceAnchor {
  return {
    id: element.id,
    kind: "dom_selector",
    selector: element.selector,
    rect: element.rect,
    description: `${element.tag}${element.role ? ` role=${element.role}` : ""}${element.text ? `: ${element.text}` : ""}`.slice(0, 1000),
  };
}

/** Convert real Chrome/MCP evidence into the v0.2 visual request envelope. */
export function hostEvidenceToVisualReviewV02Request(
  capture: HostEvidenceCapture,
  options: { readonly linked?: boolean; readonly sourceSummary?: string } = {},
): VisualReviewV02Request {
  const candidate = capture.images.find((image) => image.role === "candidate");
  const anchors = capture.dom.elements.slice(0, 16).map(toDomAnchor);
  const selected = capture.dom.selected_element ? [toDomAnchor(capture.dom.selected_element)] : [];
  const evidenceAnchors = [...selected, ...anchors.filter((anchor) => !selected.some((item) => item.id === anchor.id))].slice(0, 16);
  return parseVisualReviewV02Request({
    schema_version: "visual-review-v0.2",
    request_id: capture.capture_id,
    conversation_id: capture.conversation_id,
    host: { type: capture.host.type, adapter_version: capture.host.adapter_version },
    artifact: {
      type: "web_page",
      role: "primary",
      name: capture.page.title || capture.page.url,
      mime_type: candidate?.mime_type,
      screenshot_ref: candidate ? "host://current-visible-tab" : undefined,
      structure_ref: "host://dom-summary-v0.2",
      viewport: capture.page.viewport,
      evidence_anchors: evidenceAnchors,
    },
    intent: {
      goal: capture.intent.goal,
      audience: capture.intent.audience,
      platform: "chrome-or-mcp-host",
    },
    constraints: capture.intent.must_keep.length ? { must_keep: capture.intent.must_keep } : undefined,
    profile: {
      id: options.linked ? "linked-review" : "visual-baseline",
      version: "0.1.0",
      kind: "builtin",
    },
    review_mode: options.linked ? "linked" : "visual",
    context: {
      conversation: capture.conversation,
      dom_summary: [
        capture.dom.text,
        capture.dom.headings.join(" / "),
        capture.dom.interactive_summary,
        capture.dom.elements.map((element) => `${element.selector} ${JSON.stringify(element.computed_style)}`).join("\n"),
      ].filter(Boolean).join("\n"),
      source_summary: options.sourceSummary,
      comparison_revision_id: capture.page.revision_id,
    },
    permissions: {
      can_read_source: capture.permissions.can_read_source && Boolean(options.sourceSummary),
      can_write_source: false,
      can_call_model: capture.permissions.can_call_model,
      can_render: false,
      can_run_commands: false,
    },
    operation: "review",
    revision_id: capture.page.revision_id,
  });
}

/**
 * Keep the v0.2 Host evidence envelope compatible with the existing real
 * multimodal runtime.  The provider runtime currently speaks the stable v0.1
 * image contract; this adapter carries the v0.2 DOM anchors and revision in
 * the bounded context summary instead of silently dropping them.
 */
export function hostEvidenceToLegacyVisualReviewRequest(
  capture: HostEvidenceCapture,
): VisualReviewRequest {
  const candidate = capture.images.find((image) => image.role === "candidate");
  return parseVisualReviewRequest({
    schema_version: "visual-review-v0.1",
    request_id: capture.capture_id,
    conversation_id: capture.conversation_id,
    host: { type: capture.host.type, adapter_version: capture.host.adapter_version },
    artifact: {
      type: "web_page",
      name: capture.page.title || capture.page.url,
      mime_type: candidate?.mime_type,
      screenshot_ref: candidate ? "host://current-visible-tab" : undefined,
      structure_ref: "host://dom-summary-v0.2",
      viewport: capture.page.viewport,
    },
    intent: {
      goal: capture.intent.goal,
      audience: capture.intent.audience,
      platform: "chrome-or-mcp-host",
    },
    constraints: capture.intent.must_keep.length ? { must_keep: capture.intent.must_keep } : undefined,
    permissions: {
      can_read_source: false,
      can_write_source: false,
      can_call_model: capture.permissions.can_call_model,
      can_render: false,
      can_run_commands: false,
    },
    operation: "review",
    revision_id: capture.page.revision_id,
  });
}

/** Bounded text context sent alongside the screenshot to a real Provider. */
export function hostEvidencePromptContext(capture: HostEvidenceCapture): string {
  const selected = capture.dom.selected_element
    ? `当前选中元素：${capture.dom.selected_element.selector} ${JSON.stringify(capture.dom.selected_element.rect)}`
    : "未提供当前选中元素。";
  const domEvidence = capture.dom.elements
    .slice(0, 24)
    .map((element) => `${element.selector} ${JSON.stringify(element.rect)} ${JSON.stringify(element.computed_style)}`)
    .join("\n");
  const conversation = capture.conversation
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
  return [
    `宿主页面：${capture.page.title || "未提供"} · ${capture.page.url}`,
    `页面 revision：${capture.page.revision_id}`,
    `当前视口：${capture.page.viewport?.width ?? "?"}×${capture.page.viewport?.height ?? "?"} · DPR ${capture.page.viewport?.device_scale_factor ?? "?"}`,
    `DOM 文本摘要：${capture.dom.text || "未提供"}`,
    `页面标题层级：${capture.dom.headings.join(" / ") || "未提供"}`,
    `交互摘要：${capture.dom.interactive_summary || "未提供"}`,
    selected,
    `DOM evidence：\n${domEvidence || "未提供"}`,
    `对话上下文：\n${conversation || "未提供"}`,
  ].join("\n");
}

/**
 * Keep the host adapter on the v0.2 wire contract even while the existing
 * multimodal provider still returns the stable v0.1 response.  This is an
 * additive boundary: provider details remain unchanged, while the host's
 * revision and evidence anchors survive the conversion instead of being
 * dropped by a legacy response.
 */
export function legacyVisualReviewToV02Response(
  request: VisualReviewV02Request,
  legacy: VisualReviewResponse,
): VisualReviewV02Response {
  // A legacy provider only returns free-form evidence text.  It does not say
  // which DOM selector (if any) supports each issue.  Reusing the request's
  // anchors here would make every issue look precisely locatable and could
  // send the user to an unrelated element.  Keep the evidence honest by
  // using text-only anchors until a provider emits an explicit anchor id.
  const fallbackAnchor: EvidenceAnchor = {
    id: "host-context",
    kind: "text_range",
    text: "当前宿主页面视觉证据",
    description: "当前宿主截图与有限 DOM 摘要已随本次 revision 送入评审。",
  };
  const textAnchor = (id: string, description: string): EvidenceAnchor => ({
    id: `${id}-text`,
    kind: "text_range",
    text: description.slice(0, 2000),
    description: description.slice(0, 1000),
  });
  const legacyEvidence = (issue: VisualReviewResponse["issues"][number]): EvidenceAnchor[] =>
    issue.evidence.length
      ? issue.evidence.map((item, index) => textAnchor(`${issue.id}-${index}`, `${item.location ? `${item.location} · ` : ""}${item.description}`)).slice(0, 16)
      : [fallbackAnchor];
  const observations = legacy.issues.length
    ? legacy.issues.map((issue) => ({
        id: `legacy-${issue.id}`,
        dimension: issue.category,
        statement: issue.evidence[0]?.description || issue.suggested_fix,
        status: (legacy.decision === "MANUAL_REVIEW" || issue.severity === "observation" ? "possible" : "confirmed") as "possible" | "confirmed",
        severity: issue.severity,
        confidence: issue.confidence,
        evidence: legacyEvidence(issue),
        recommendation: issue.suggested_fix,
        profile: request.profile,
      }))
    : [{
        id: "legacy-host-context",
        dimension: "provider_evidence",
        statement: legacy.summary,
        status: "possible" as const,
        severity: "observation" as const,
        confidence: 1,
        evidence: [fallbackAnchor],
        recommendation: "人工确认当前 revision 后，再决定是否接受或继续修改。",
        profile: request.profile,
      }];

  return parseVisualReviewV02Response({
    schema_version: "visual-review-v0.2",
    request_id: legacy.request_id,
    revision_id: request.revision_id,
    decision: legacy.decision,
    summary: legacy.summary,
    observations: {
      schema_version: "observation-envelope-v0.1",
      review_mode: request.review_mode,
      profile: request.profile,
      observations,
    },
    issues: legacy.issues.map((issue) => ({
      ...issue,
      // There is no reliable legacy issue -> DOM anchor mapping.  Do not
      // expose a locator button for an arbitrary request anchor.
      evidence_anchors: [],
    })),
    repair_plan: legacy.repair_plan,
    verification: legacy.verification,
    usage: {
      ...legacy.usage,
      mode: legacy.usage.mode,
      provider: legacy.usage.provider,
      model: legacy.usage.model,
      latency_ms: undefined,
    },
  });
}
