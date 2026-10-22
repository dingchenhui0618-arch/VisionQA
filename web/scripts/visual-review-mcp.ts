import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import {
  createMockVisualReview,
  parseVisualReviewRequest,
  visualReviewRequestSchema,
} from "../lib/visionqa/visual-review-contract.ts";

const capabilities = {
  adapter: "visionqa-local-mcp",
  version: "0.1.0",
  contract: "visual-review-v0.1",
  mode: "mock",
  writes: false,
  model_calls: false,
  supported_artifacts: ["web_page", "slide", "image", "document_render"],
} as const;

function createServer(): McpServer {
  const server = new McpServer({ name: "visionqa-visual-plugin", version: "0.1.0" });
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
