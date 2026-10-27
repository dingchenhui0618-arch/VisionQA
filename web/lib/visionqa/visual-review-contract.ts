import { z } from "zod";

export const visualReviewSchemaVersion = "visual-review-v0.1" as const;

export const artifactTypeSchema = z.enum([
  "web_page",
  "slide",
  "image",
  "document_render",
  "unknown",
]);

export const decisionSchema = z.enum([
  "PASS",
  "NEEDS_REVISION",
  "MANUAL_REVIEW",
  "BLOCKED",
  "NEEDS_CONTEXT",
  "NOT_ASSESSABLE",
]);

export const hostSchema = z.object({
  type: z.string().trim().min(1).max(120),
  adapter_version: z.string().trim().min(1).max(80),
}).strict();

export const artifactRefSchema = z.object({
  type: artifactTypeSchema,
  name: z.string().trim().max(240).optional(),
  mime_type: z.string().trim().max(120).optional(),
  screenshot_ref: z.string().trim().max(2000).optional(),
  source_ref: z.string().trim().max(2000).optional(),
  structure_ref: z.string().trim().max(2000).optional(),
  viewport: z.object({
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    device_scale_factor: z.number().positive().optional(),
  }).strict().optional(),
}).strict();

export const intentSchema = z.object({
  goal: z.string().trim().min(1).max(2000),
  audience: z.string().trim().max(500).optional(),
  platform: z.string().trim().max(200).optional(),
  brand_profile: z.string().trim().max(200).optional(),
}).strict();

export const constraintsSchema = z.object({
  must_keep: z.array(z.string().trim().min(1).max(300)).max(32).optional(),
  must_change: z.array(z.string().trim().min(1).max(300)).max(32).optional(),
  style_profile: z.string().trim().max(200).optional(),
  rubric_profile: z.string().trim().max(200).optional(),
}).strict();

export const permissionsSchema = z.object({
  can_read_source: z.boolean().default(false),
  can_write_source: z.boolean().default(false),
  can_call_model: z.boolean().default(true),
  can_render: z.boolean().default(false),
  can_run_commands: z.boolean().default(false),
}).strict();

export const visualReviewRequestSchema = z.object({
  schema_version: z.literal(visualReviewSchemaVersion),
  request_id: z.string().trim().min(1).max(160),
  conversation_id: z.string().trim().min(1).max(160),
  host: hostSchema,
  artifact: artifactRefSchema,
  intent: intentSchema,
  constraints: constraintsSchema.optional(),
  permissions: permissionsSchema.optional(),
  operation: z.enum(["review", "repair_plan", "verify"]),
  revision_id: z.string().trim().max(160).optional(),
}).strict();

export const evidenceSchema = z.object({
  location: z.string().trim().max(300).optional(),
  description: z.string().trim().min(1).max(1000),
  source: z.enum(["pixel", "structure", "context", "comparison"]).default("context"),
}).strict();

export const visualIssueSchema = z.object({
  id: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(120),
  severity: z.enum(["blocker", "high", "medium", "low", "observation"]),
  confidence: z.number().min(0).max(1),
  evidence: z.array(evidenceSchema).min(1).max(8),
  suggested_fix: z.string().trim().min(1).max(1200),
}).strict();

export const repairPlanSchema = z.object({
  type: z.enum(["source_patch", "structured_edit", "image_edit", "manual_plan", "none"]),
  requires_approval: z.literal(true),
  operations: z.array(z.object({
    action: z.string().trim().min(1).max(240),
    target: z.string().trim().max(300).optional(),
    reason: z.string().trim().max(800).optional(),
  }).strict()).max(16),
}).strict();

export const visualReviewResponseSchema = z.object({
  schema_version: z.literal(visualReviewSchemaVersion),
  request_id: z.string().trim().min(1).max(160),
  decision: decisionSchema,
  summary: z.string().trim().min(1).max(2000),
  issues: z.array(visualIssueSchema).max(16),
  repair_plan: repairPlanSchema,
  verification: z.object({
    required: z.boolean(),
    checks: z.array(z.string().trim().min(1).max(300)).max(16),
  }).strict(),
  usage: z.object({
    mode: z.enum(["mock", "byok", "host_managed", "managed"]),
    provider: z.string().trim().min(1).max(120),
    model: z.string().trim().max(200).optional(),
    input_images: z.number().int().nonnegative().optional(),
    estimated_cost_minor_units: z.number().int().nonnegative().optional(),
  }).strict(),
}).strict();

export type ArtifactType = z.infer<typeof artifactTypeSchema>;
export type VisualReviewRequest = z.infer<typeof visualReviewRequestSchema>;
export type VisualReviewResponse = z.infer<typeof visualReviewResponseSchema>;
export type VisualIssue = z.infer<typeof visualIssueSchema>;

export function parseVisualReviewRequest(input: unknown): VisualReviewRequest {
  return visualReviewRequestSchema.parse(input);
}

export function parseVisualReviewResponse(input: unknown): VisualReviewResponse {
  return visualReviewResponseSchema.parse(input);
}

export function createMockVisualReview(input: VisualReviewRequest): VisualReviewResponse {
  const hasArtifact = Boolean(input.artifact.screenshot_ref || input.artifact.source_ref || input.artifact.structure_ref);
  if (!hasArtifact) {
    return visualReviewResponseSchema.parse({
      schema_version: visualReviewSchemaVersion,
      request_id: input.request_id,
      decision: "NEEDS_CONTEXT",
      summary: "还没有收到可检查的视觉产物。请提供截图、图片或可读取的源文件引用。",
      issues: [],
      repair_plan: { type: "none", requires_approval: true, operations: [] },
      verification: { required: false, checks: [] },
      usage: { mode: "mock", provider: "fixture", model: "fixture-visual-review-v0.1", input_images: 0, estimated_cost_minor_units: 0 },
    });
  }

  const typeLabel = input.artifact.type === "web_page" ? "网页" : input.artifact.type === "slide" ? "演示页" : input.artifact.type === "image" ? "图片" : "视觉产物";
  return visualReviewResponseSchema.parse({
    schema_version: visualReviewSchemaVersion,
    request_id: input.request_id,
    decision: "MANUAL_REVIEW",
    summary: `Mock 适配器已接收这份${typeLabel}和任务上下文，但没有调用真实模型，因此不会伪造视觉缺陷结论。下一步请接入宿主 Provider 或人工确认。`,
    issues: [{
      id: "mock-context-001",
      category: "provider",
      severity: "observation",
      confidence: 1,
      evidence: [{ source: "context", description: "当前结果来自 Mock Provider，没有真实像素或结构分析证据。" }],
      suggested_fix: "接入已授权的视觉 Provider 后重新运行评审。",
    }],
    repair_plan: { type: "manual_plan", requires_approval: true, operations: [{ action: "connect_authorized_visual_provider", reason: "Mock 结果不能作为视觉结论。" }] },
    verification: { required: true, checks: ["确认已使用真实视觉 Provider", "确认输入产物与当前 revision 一致", "人工复核最终建议"] },
    usage: { mode: "mock", provider: "fixture", model: "fixture-visual-review-v0.1", input_images: input.artifact.type === "image" ? 1 : 0, estimated_cost_minor_units: 0 },
  });
}
