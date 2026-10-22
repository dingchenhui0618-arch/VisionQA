import { readFile, writeFile } from "node:fs/promises";
import { createMockVisualReview, parseVisualReviewRequest, parseVisualReviewResponse } from "../lib/visionqa/visual-review-contract.ts";

const usage = `VisionQA VisualReview CLI v0.1

Commands:
  capabilities                         print adapter capabilities
  validate <request.json>              validate a VisualReview request
  review <request.json> [output.json] run the local Mock Provider
  review --stdin                       read one request JSON object from stdin
`;

async function readInput(args: string[]): Promise<unknown> {
  const path = args[0];
  if (path === "--stdin" || !path) {
    return JSON.parse(await readFile(0, "utf8"));
  }
  return JSON.parse(await readFile(path, "utf8"));
}
async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    process.stdout.write(usage);
    return;
  }
  if (command === "capabilities") {
    process.stdout.write(`${JSON.stringify({
      adapter: "visionqa-local",
      version: "0.1.0",
      mode: "mock",
      operations: ["review", "repair_plan", "verify"],
      writes: false,
      model_calls: false,
      contract: "visual-review-v0.1",
    }, null, 2)}\n`);
    return;
  }
  if (!["validate", "review"].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  const input = parseVisualReviewRequest(await readInput(args));
  if (command === "validate") {
    process.stdout.write(`${JSON.stringify({ valid: true, request_id: input.request_id, schema_version: input.schema_version }, null, 2)}\n`);
    return;
  }
  const result = parseVisualReviewResponse(createMockVisualReview(input));
  const outputPath = args[0] === "--stdin" ? undefined : args[1];
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) await writeFile(outputPath, json, "utf8");
  process.stdout.write(json);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`visionqa-local error: ${message}\n`);
  process.exitCode = 1;
});
