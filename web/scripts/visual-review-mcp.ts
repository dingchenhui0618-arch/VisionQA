import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { hostCaptureSchema, parseHostCapture } from "../lib/visionqa/host-adapter-contract.ts";
import {
  hostEvidenceCaptureSchema,
  parseHostEvidenceCapture,
  hostEvidenceToVisualReviewV02Request,
} from "../lib/visionqa/host-evidence-v0.2.ts";
import {
  mcpSourceEvidenceSchema,
  mcpSourceEvidenceToCodeReviewRequest,
  mcpSourceEvidenceToLinkedReviewRequest,
  parseMcpSourceEvidence,
} from "../lib/visionqa/mcp-host-contract.ts";
import { runCodeReviewV01Mock, runVisualReviewV02Mock } from "../lib/visionqa/plugin-runtime.ts";
import {
  createMockVisualReview,
  parseVisualReviewRequest,
  visualReviewRequestSchema,
} from "../lib/visionqa/visual-review-contract.ts";

const capabilities = {
  adapter: "visionqa-local-mcp",
  version: "0.2.0",
  contract: "visual-review-v0.1",
  contracts: ["visual-review-v0.1", "visual-review-v0.2", "code-review-v0.1"],
  mode: "auto",
  writes: false,
  model_calls: "server-side-byok-or-managed",
  provider_protocol: "openai_compatible_chat",
  host_adapters: ["chrome-extension", "mcp"],
  supported_artifacts: ["web_page", "slide", "image", "document_render"],
} as const;

function hostRequestTimeoutMs(): number {
  const configured = Number(process.env.VISIONQA_HOST_REQUEST_TIMEOUT_MS || 60_000);
  return Number.isFinite(configured) ? Math.min(120_000, Math.max(5_000, configured)) : 60_000;
}

function createServer(): McpServer {
  const server = new McpServer({ name: "visionqa-visual-plugin", version: "0.1.0" });
  server.registerTool(
    "review_host_context_v02",
    {
      title: "Review v0.2 host evidence",
      description: "Review a v0.2 Chrome/MCP capture with screenshot, DOM selector geometry, computed-style summary and page revision. This local path is offline Mock only and never writes source.",
      inputSchema: z.object({
        capture: hostEvidenceCaptureSchema,
        provider: z.enum(["mock"]).default("mock"),
      }),
    },
    async (input) => {
      const capture = parseHostEvidenceCapture(input.capture);
      const request = hostEvidenceToVisualReviewV02Request(capture);
      const result = runVisualReviewV02Mock(request);
      const body = {
        ...result,
        host_capture: {
          capture_id: capture.capture_id,
          schema_version: capture.schema_version,
          dom_elements_received: capture.dom.elements.length,
          selected_element_received: Boolean(capture.dom.selected_element),
          page_revision_id: capture.page.revision_id,
        },
      };
      return {
        content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
        structuredContent: body,
      };
    },
  );
  server.registerTool(
    "review_code_context",
    {
      title: "Review MCP source context",
      description: "Review bounded MCP source, AST and Diff evidence with CodeReview v0.1. The fixture path is offline Mock only; no filesystem or command access is implied.",
      inputSchema: z.object({
        source: mcpSourceEvidenceSchema,
        goal: z.string().trim().max(2000).optional(),
      }),
    },
    async (input) => {
      const source = parseMcpSourceEvidence(input.source);
      const request = mcpSourceEvidenceToCodeReviewRequest(source, { goal: input.goal });
      const result = runCodeReviewV01Mock(request);
      const body = { ...result, source_revision_id: source.revision_id };
      return {
        content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
        structuredContent: body,
      };
    },
  );
  server.registerTool(
    "review_linked_context",
    {
      title: "Review linked visual and source context",
      description: "Link v0.2 Chrome/MCP visual evidence to bounded MCP source, AST and Diff evidence. The result is approval-gated and offline Mock only.",
      inputSchema: z.object({
        capture: hostEvidenceCaptureSchema,
        source: mcpSourceEvidenceSchema,
      }),
    },
    async (input) => {
      const capture = parseHostEvidenceCapture(input.capture);
      const source = parseMcpSourceEvidence(input.source);
      const request = mcpSourceEvidenceToLinkedReviewRequest(capture, source);
      const result = runVisualReviewV02Mock(request);
      const body = { ...result, source_revision_id: source.revision_id };
      return {
        content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
        structuredContent: body,
      };
    },
  );
  server.registerTool(
    "get_visual_capabilities",
    {
      title: "Get VisionQA capabilities",
      description: "Return the local VisionQA visual plugin capabilities and safety boundaries.",
      inputSchema: z.object({}),
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(capabilities, null, 2) }],
      structuredContent: capabilities,
    }),
  );
  server.registerTool(
    "review_host_context",
    {
      title: "Review current host context",
      description: "Send a Chrome/MCP host capture containing the current screenshot, DOM summary, and conversation context to the local VisionQA service. The service selects Mock or the single server-side user multimodal API profile.",
      inputSchema: z.object({
        capture: hostCaptureSchema,
        provider: z.enum(["auto", "mock"]).default("auto"),
      }),
    },
    async (input) => {
      const capture = parseHostCapture(input.capture);
      const endpoint = `${process.env.VISIONQA_LOCAL_URL?.trim() || "http://localhost:6300"}/api/visual-review/host`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), hostRequestTimeoutMs());
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", "x-request-id": capture.capture_id },
          body: JSON.stringify({ capture, provider: input.provider }),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw new Error("VisionQA local host review timed out.");
        throw error;
      } finally {
        clearTimeout(timeout);
      }
      const body = await response.json() as unknown;
      if (!response.ok) throw new Error(`VisionQA local host review failed (${response.status}).`);
      return {
        content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
        structuredContent: body as Record<string, unknown>,
      };
    },
  );
  server.registerTool(
    "review_visual",
    {
      title: "Review visual artifact",
      description: "Review a web page, slide, image, or rendered document using the VisualReview Contract. Local v0.1 uses a transparent Mock Provider and never claims real pixel analysis.",
      inputSchema: visualReviewRequestSchema,
    },
    async (input) => {
      const request = parseVisualReviewRequest(input);
      const result = createMockVisualReview(request);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
  server.registerTool(
    "plan_visual_repair",
    {
      title: "Plan visual repair",
      description: "Create a review-shaped repair plan. Any future source or file write must be approved by the host.",
      inputSchema: visualReviewRequestSchema,
    },
    async (input) => {
      const request = parseVisualReviewRequest({ ...input, operation: "repair_plan" });
      const result = createMockVisualReview(request);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
  return server;
}

serveStdio(createServer, { legacy: "serve", onerror: (error) => process.stderr.write(`visionqa-mcp error: ${error.message}\n`) });
