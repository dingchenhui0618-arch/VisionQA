import { z } from "zod";

// Only sanitized customer-safe messages may be constructed with this error class.
export class IntakeError extends Error {}

export const conversationInput = z.object({
  skuName: z.string().trim().min(1).max(100),
  objective: z.string().trim().min(1).max(2000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(3800),
  }).strict()).max(10).default([]),
}).strict();

// A plan is a proposal, never evidence that an image was inspected or repaired.
export const conversationPlan = z.object({
  decision: z.enum(["READY", "CLARIFY", "UNSUPPORTED"]),
  summary: z.string().trim().min(1).max(600),
  question: z.string().trim().max(300),
  preserve: z.array(z.string().trim().min(1).max(150)).max(8),
  changes: z.array(z.string().trim().min(1).max(150)).max(8),
}).strict().superRefine((plan, ctx) => {
  if (plan.decision === "CLARIFY" && !plan.question) {
    ctx.addIssue({ code: "custom", message: "Clarification requires a question" });
  }
  if (plan.decision === "READY" && (plan.question || !plan.changes.length)) {
    ctx.addIssue({ code: "custom", message: "Ready plan requires a concrete objective and no unanswered question" });
  }
});

export type ConversationInput = z.infer<typeof conversationInput>;
export type ConversationPlan = z.infer<typeof conversationPlan>;
export type TaskView = {
  id: string;
  parentId: string | null;
  objective: string;
  skuName: string;
  status: "STARTING" | "NEEDS_INPUT" | "UNSUPPORTED" | "AWAITING_APPROVAL" | "PROJECT_READY" | "STOPPED" | "SUPERSEDED" | "FAILED";
  projectId: string | null;
  plan: ConversationPlan | null;
  error: string | null;
};
