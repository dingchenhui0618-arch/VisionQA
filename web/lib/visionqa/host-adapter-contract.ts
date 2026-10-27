import { z } from "zod";

export const hostCaptureSchemaVersion = "visionqa-host-capture-v0.1" as const;

const hostImageSchema = z.object({
  role: z.enum(["candidate", "reference"]),
  name: z.string().trim().min(1).max(160),
  mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data_url: z.string().regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
}).strict();

const hostMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().trim().min(1).max(4000),
  created_at: z.string().trim().max(80).optional(),
}).strict();

export const hostCaptureSchema = z.object({
  schema_version: z.literal(hostCaptureSchemaVersion),
  capture_id: z.string().trim().min(1).max(160),
  conversation_id: z.string().trim().min(1).max(160),
  host: z.object({
    type: z.enum(["chrome-extension", "mcp", "manual"]),
    adapter_version: z.string().trim().min(1).max(80),
  }).strict(),
  page: z.object({
    url: z.string().url().max(2000),
    title: z.string().trim().max(500),
    viewport: z.object({
      width: z.number().int().positive().max(10000),
      height: z.number().int().positive().max(10000),
      device_scale_factor: z.number().positive().max(8),
    }).strict(),
  }).strict(),
  dom: z.object({
    text: z.string().max(12000),
    headings: z.array(z.string().trim().min(1).max(300)).max(80),
    landmarks: z.array(z.string().trim().min(1).max(200)).max(40),
    interactive_summary: z.string().max(4000),
  }).strict(),
  conversation: z.array(hostMessageSchema).max(24).default([]),
  intent: z.object({
    goal: z.string().trim().min(1).max(2000),
    audience: z.string().trim().max(500).optional(),
    must_keep: z.array(z.string().trim().min(1).max(300)).max(32).default([]),
  }).strict(),
  images: z.array(hostImageSchema).max(5).default([]),
  permissions: z.object({
    can_call_model: z.boolean().default(false),
    can_read_source: z.boolean().default(false),
    can_write_source: z.boolean().default(false),
  }).strict().refine((permissions) => permissions.can_write_source === false, { message: "Host Capture never grants source-write permission." }).default({ can_call_model: false, can_read_source: false, can_write_source: false }),
}).strict();

export type HostCapture = z.infer<typeof hostCaptureSchema>;
export type HostImage = z.infer<typeof hostImageSchema>;

export function parseHostCapture(input: unknown): HostCapture {
  return hostCaptureSchema.parse(input);
}

export function dataUrlBytes(dataUrl: string): Uint8Array {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new Error("宿主图片必须是受支持的 Base64 图片 Data URL。");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function hostCaptureToVisualReviewRequest(capture: HostCapture) {
  const candidate = capture.images.find((image) => image.role === "candidate");
  return {
    schema_version: "visual-review-v0.1" as const,
    request_id: capture.capture_id,
    conversation_id: capture.conversation_id,
    host: { type: capture.host.type, adapter_version: capture.host.adapter_version },
    artifact: {
      type: "web_page" as const,
      name: capture.page.title || capture.page.url,
      mime_type: candidate?.mime_type,
      screenshot_ref: candidate ? "host://current-visible-tab" : undefined,
      structure_ref: "host://dom-summary",
      viewport: capture.page.viewport,
    },
    intent: {
      goal: capture.intent.goal,
      audience: capture.intent.audience,
      platform: "chrome-or-mcp-host",
    },
    constraints: capture.intent.must_keep.length ? { must_keep: capture.intent.must_keep } : undefined,
    permissions: {
      can_read_source: capture.permissions.can_read_source,
      can_write_source: false,
      can_call_model: capture.permissions.can_call_model,
      can_render: false,
      can_run_commands: false,
    },
    operation: "review" as const,
  };
}

export function hostCapturePromptContext(capture: HostCapture): string {
  const messages = capture.conversation.map((message) => `${message.role}: ${message.content}`).join("\n");
  return [
    `页面标题：${capture.page.title || "未提供"}`,
    `页面地址：${capture.page.url}`,
    `DOM 文本摘要：${capture.dom.text || "未提供"}`,
    `页面标题层级：${capture.dom.headings.join(" / ") || "未提供"}`,
    `交互元素摘要：${capture.dom.interactive_summary || "未提供"}`,
    `当前对话：${messages || "未提供"}`,
  ].join("\n");
}
