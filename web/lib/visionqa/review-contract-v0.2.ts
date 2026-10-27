import { z } from "zod";
import {
  artifactRefSchema,
  constraintsSchema,
  decisionSchema,
  hostSchema,
  intentSchema,
  permissionsSchema,
  repairPlanSchema,
  visualIssueSchema,
} from "./visual-review-contract.ts";

/**
 * The v0.2 contracts are deliberately additive.  v0.1 remains the wire
 * format used by the existing plugin runtime; consumers can opt into these
 * schemas without having to migrate the legacy e-commerce flow first.
 */
export const visualReviewV02SchemaVersion = "visual-review-v0.2" as const;
export const observationEnvelopeSchemaVersion = "observation-envelope-v0.1" as const;
export const codeReviewSchemaVersion = "code-review-v0.1" as const;
export const reviewProfileSchemaVersion = "review-profile-v0.1" as const;

export const reviewModeSchema = z.enum(["visual", "code", "linked"]);
export const profileKindSchema = z.enum(["builtin", "workspace", "user", "host"]);

export const reviewProfileRefSchema = z.object({
  id: z.string().trim().min(1).max(160),
  version: z.string().trim().min(1).max(80),
  kind: profileKindSchema.default("builtin"),
}).strict();

export const profileDimensionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(240),
  description: z.string().trim().max(1000).optional(),
  weight: z.number().finite().nonnegative().max(100).optional(),
}).strict();

export const reviewProfileDefinitionSchema = z.object({
  schema_version: z.literal(reviewProfileSchemaVersion),
  profile: reviewProfileRefSchema,
  review_mode: reviewModeSchema,
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(2000).optional(),
  dimensions: z.array(profileDimensionSchema).min(1).max(32),
  deterministic_checks: z.array(z.string().trim().min(1).max(240)).max(64).default([]),
  forbidden_inferences: z.array(z.string().trim().min(1).max(300)).max(32).default([]),
  provenance: z.object({
    source: z.string().trim().min(1).max(240),
    updated_at: z.string().trim().max(80).optional(),
  }).strict().optional(),
}).strict();

const rectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
}).strict();

const evidenceAnchorBaseSchema = z.object({
  id: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(1000),
}).strict();

export const evidenceAnchorSchema = z.discriminatedUnion("kind", [
  evidenceAnchorBaseSchema.extend({
    kind: z.literal("pixel_bbox"),
    rect: rectSchema,
    page: z.number().int().positive().optional(),
  }).strict(),
  evidenceAnchorBaseSchema.extend({
    kind: z.literal("dom_selector"),
    selector: z.string().trim().min(1).max(2000),
    rect: rectSchema.optional(),
  }).strict(),
  evidenceAnchorBaseSchema.extend({
    kind: z.literal("source_range"),
    file: z.string().trim().min(1).max(1000),
    start_line: z.number().int().positive(),
    end_line: z.number().int().positive(),
    start_column: z.number().int().positive().optional(),
    end_column: z.number().int().positive().optional(),
  }).strict().refine((value) => value.end_line >= value.start_line, {
    message: "source_range.end_line 必须大于或等于 start_line",
  }),
  evidenceAnchorBaseSchema.extend({
    kind: z.literal("slide_object"),
    object_id: z.string().trim().min(1).max(300),
    page: z.number().int().positive(),
    rect: rectSchema.optional(),
  }).strict(),
  evidenceAnchorBaseSchema.extend({
    kind: z.literal("document_region"),
    page: z.number().int().positive(),
    rect: rectSchema,
  }).strict(),
  evidenceAnchorBaseSchema.extend({
    kind: z.literal("text_range"),
    text: z.string().trim().min(1).max(2000),
    start_offset: z.number().int().nonnegative().optional(),
    end_offset: z.number().int().nonnegative().optional(),
  }).strict().refine((value) => value.end_offset === undefined || value.start_offset === undefined || value.end_offset >= value.start_offset, {
    message: "text_range.end_offset 必须大于或等于 start_offset",
  }),
]);

export const observationSchema = z.object({
  id: z.string().trim().min(1).max(160),
  dimension: z.string().trim().min(1).max(120),
  statement: z.string().trim().min(1).max(2000),
  status: z.enum(["confirmed", "possible", "not_assessable"]),
  severity: z.enum(["blocker", "high", "medium", "low", "observation"]).default("observation"),
  confidence: z.number().min(0).max(1),
  evidence: z.array(evidenceAnchorSchema).min(1).max(16),
  recommendation: z.string().trim().max(1600).optional(),
  profile: reviewProfileRefSchema.optional(),
}).strict();

export const observationEnvelopeSchema = z.object({
  schema_version: z.literal(observationEnvelopeSchemaVersion),
  review_mode: reviewModeSchema,
  profile: reviewProfileRefSchema,
  observations: z.array(observationSchema).max(64),
  generated_at: z.string().trim().max(80).optional(),
}).strict();

const v02ArtifactSchema = artifactRefSchema.extend({
  role: z.enum(["primary", "reference", "supporting"]).default("primary"),
  evidence_anchors: z.array(evidenceAnchorSchema).max(16).default([]),
}).strict();

const v02ContextSchema = z.object({
  conversation: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string().trim().min(1).max(4000),
    created_at: z.string().trim().max(80).optional(),
  }).strict()).max(48).default([]),
  dom_summary: z.string().max(12000).optional(),
  source_summary: z.string().max(12000).optional(),
  comparison_revision_id: z.string().trim().max(160).optional(),
}).strict();

export const visualReviewV02RequestSchema = z.object({
  schema_version: z.literal(visualReviewV02SchemaVersion),
  request_id: z.string().trim().min(1).max(160),
  conversation_id: z.string().trim().min(1).max(160),
  host: hostSchema,
  /** Kept for v0.1 compatibility: this is always the primary artifact. */
  artifact: v02ArtifactSchema,
  artifacts: z.array(v02ArtifactSchema).max(16).optional(),
  intent: intentSchema,
  constraints: constraintsSchema.optional(),
  profile: reviewProfileRefSchema,
  review_mode: z.enum(["visual", "linked"]).default("visual"),
  context: v02ContextSchema.optional(),
  permissions: permissionsSchema.optional(),
  operation: z.enum(["review", "repair_plan", "verify"]),
  revision_id: z.string().trim().max(160).optional(),
  requested_dimensions: z.array(z.string().trim().min(1).max(120)).max(32).optional(),
}).strict();

export const visualReviewV02ResponseSchema = z.object({
  schema_version: z.literal(visualReviewV02SchemaVersion),
  request_id: z.string().trim().min(1).max(160),
  decision: decisionSchema,
  summary: z.string().trim().min(1).max(2000),
  observations: observationEnvelopeSchema,
  issues: z.array(visualIssueSchema.extend({
    evidence_anchors: z.array(evidenceAnchorSchema).max(16).default([]),
  }).strict()).max(32),
  repair_plan: repairPlanSchema,
  verification: z.object({
    required: z.boolean(),
    checks: z.array(z.string().trim().min(1).max(300)).max(24),
  }).strict(),
  usage: z.object({
    mode: z.enum(["mock", "byok", "host_managed", "managed"]),
    provider: z.string().trim().min(1).max(120),
    model: z.string().trim().max(200).optional(),
    input_images: z.number().int().nonnegative().optional(),
    estimated_cost_minor_units: z.number().int().nonnegative().optional(),
    latency_ms: z.number().int().nonnegative().optional(),
  }).strict(),
}).strict();

const sourceArtifactSchema = z.object({
  file: z.string().trim().min(1).max(1000),
  language: z.string().trim().max(80).optional(),
  content_ref: z.string().trim().max(2000).optional(),
  diff_ref: z.string().trim().max(2000).optional(),
  ast_ref: z.string().trim().max(2000).optional(),
}).strict();

export const codeReviewV01RequestSchema = z.object({
  schema_version: z.literal(codeReviewSchemaVersion),
  request_id: z.string().trim().min(1).max(160),
  conversation_id: z.string().trim().min(1).max(160),
  host: hostSchema,
  target: z.enum(["source", "diff", "project"]),
  source_artifacts: z.array(sourceArtifactSchema).min(1).max(128),
  intent: intentSchema,
  constraints: constraintsSchema.optional(),
  profile: reviewProfileRefSchema,
  context: v02ContextSchema.optional(),
  permissions: permissionsSchema.optional(),
  operation: z.enum(["review", "repair_plan", "verify"]),
  revision_id: z.string().trim().max(160).optional(),
}).strict();

export const codeIssueSchema = z.object({
  id: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(120),
  severity: z.enum(["blocker", "high", "medium", "low", "observation"]),
  confidence: z.number().min(0).max(1),
  rule_id: z.string().trim().max(160).optional(),
  statement: z.string().trim().min(1).max(2000),
  evidence: z.array(evidenceAnchorSchema).min(1).max(16),
  suggested_fix: z.string().trim().min(1).max(1600),
}).strict();

export const codeReviewV01ResponseSchema = z.object({
  schema_version: z.literal(codeReviewSchemaVersion),
  request_id: z.string().trim().min(1).max(160),
  decision: decisionSchema,
  summary: z.string().trim().min(1).max(2000),
  observations: observationEnvelopeSchema,
  issues: z.array(codeIssueSchema).max(64),
  repair_plan: repairPlanSchema,
  verification: z.object({
    required: z.boolean(),
    checks: z.array(z.string().trim().min(1).max(300)).max(24),
  }).strict(),
  usage: z.object({
    mode: z.enum(["mock", "byok", "host_managed", "managed"]),
    provider: z.string().trim().min(1).max(120),
    model: z.string().trim().max(200).optional(),
    estimated_cost_minor_units: z.number().int().nonnegative().optional(),
    latency_ms: z.number().int().nonnegative().optional(),
  }).strict(),
}).strict();

export type ReviewMode = z.infer<typeof reviewModeSchema>;
export type ReviewProfileRef = z.infer<typeof reviewProfileRefSchema>;
export type ReviewProfileDefinition = z.infer<typeof reviewProfileDefinitionSchema>;
export type EvidenceAnchor = z.infer<typeof evidenceAnchorSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type ObservationEnvelope = z.infer<typeof observationEnvelopeSchema>;
export type VisualReviewV02Request = z.infer<typeof visualReviewV02RequestSchema>;
export type VisualReviewV02Response = z.infer<typeof visualReviewV02ResponseSchema>;
export type CodeReviewV01Request = z.infer<typeof codeReviewV01RequestSchema>;
export type CodeIssue = z.infer<typeof codeIssueSchema>;
export type CodeReviewV01Response = z.infer<typeof codeReviewV01ResponseSchema>;

export function parseVisualReviewV02Request(input: unknown): VisualReviewV02Request {
  return visualReviewV02RequestSchema.parse(input);
}

export function parseVisualReviewV02Response(input: unknown): VisualReviewV02Response {
  return visualReviewV02ResponseSchema.parse(input);
}

export function parseCodeReviewV01Request(input: unknown): CodeReviewV01Request {
  return codeReviewV01RequestSchema.parse(input);
}

export function parseCodeReviewV01Response(input: unknown): CodeReviewV01Response {
  return codeReviewV01ResponseSchema.parse(input);
}

