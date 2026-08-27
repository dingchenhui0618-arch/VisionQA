import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

import {
  createQwenImage3Provider,
  getQwenImage3Readiness,
} from "../lib/visionqa/providers/qwen-image-3.ts";

const repoRoot = resolve(import.meta.dirname, "../..");
const webRoot = resolve(import.meta.dirname, "..");
const caseRoot = join(repoRoot, "data", "synthetic_demo_sku_burgundy_trousers_v0.1");
const sourcePath = join(caseRoot, "ai-model-draft-controlled-defect.png");
const referencePath = join(caseRoot, "product-truth-grid.png");
const expectedSourceSha256 = "d57a189c93cb209818eb5af0f9a427e846041cb4618337b1760895e9a72a7c9e";
const runRoot = join(repoRoot, "data", "repair_benchmark_v0.1", "runs", "qwen-image-3-probe-001");

function parseEnv(text: string): Record<string, string> {
  return Object.fromEntries(
    text.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
      }),
  );
}

function mimeFromPath(path: string): "image/png" | "image/jpeg" | "image/webp" {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  throw new Error("Unsupported image type");
}

const env = parseEnv(await readFile(join(webRoot, ".env.local"), "utf8"));
const readiness = getQwenImage3Readiness(env);
if (!readiness.liveReady) {
  throw new Error(`Qwen Image 3 gate blocked: ${readiness.blockers.join(",")}`);
}

const sourceBytes = new Uint8Array(await readFile(sourcePath));
const referenceBytes = new Uint8Array(await readFile(referencePath));
const actualSha256 = createHash("sha256").update(sourceBytes).digest("hex");
if (actualSha256 !== expectedSourceSha256) throw new Error("Controlled source hash mismatch");

const startedAt = new Date().toISOString();
const started = performance.now();
const result = await createQwenImage3Provider(env).edit({
  source: { bytes: sourceBytes, mimeType: mimeFromPath(sourcePath) },
  references: [{ bytes: referenceBytes, mimeType: mimeFromPath(referencePath) }],
  sourceWidth: 1024,
  sourceHeight: 1536,
  prompt: "删除模特裤子左大腿和膝部外侧多出来的两个工装贴袋，把该区域恢复为与右裤腿一致的纯净直筒罗纹裤面。只修复这两个错误贴袋及其边缘，保持酒红色、竖向罗纹、腰头和黑色抽绳、裤型、裤长完全一致。人物身份、脸、头发、身体、姿势、双手、白色T恤、白鞋、背景、镜头、全身构图和画幅必须原样保留。",
  negativePrompt: "禁止裁切或放大裤子；禁止把全身模特图变成商品特写；禁止改变人物、姿势、脸、手脚、背景、T恤、鞋、腰头、抽绳、裤色、罗纹、裤型、裤长或画幅；禁止新增口袋、文字、Logo、水印和促销元素。",
});

await mkdir(runRoot, { recursive: true });
const extension = result.outputMimeType === "image/jpeg" ? "jpg" : result.outputMimeType.split("/")[1];
const outputPath = join(runRoot, `candidate.${extension}`);
await writeFile(outputPath, result.outputBytes);
const receipt = {
  schema_version: "visionqa-qwen3-controlled-probe-v0.1",
  case_id: "SYN-VQA-BURGUNDY-TROUSERS-001",
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  duration_ms: Math.round(performance.now() - started),
  source: { name: basename(sourcePath), sha256: actualSha256, width: 1024, height: 1536 },
  reference: { name: basename(referencePath) },
  provider_id: result.providerId,
  model_snapshot: result.modelSnapshot,
  provider_request_id: result.providerRequestId,
  requested_output_size: result.outputSize,
  reported_usage: {
    image_count: result.imageCount,
    output_width: result.outputWidth,
    output_height: result.outputHeight,
  },
  output: { name: basename(outputPath), mime_type: result.outputMimeType, bytes: result.outputBytes.byteLength },
  retries: 0,
  actual_cost_cny: null,
  cost_note: "阿里云账单尚未形成可核验的单次请求费用，不估算为实际费用。",
  acceptance_status: "NOT_REVIEWED",
};
await writeFile(join(runRoot, "receipt.json"), JSON.stringify(receipt, null, 2), "utf8");
console.log(JSON.stringify({
  ok: true,
  provider_request_id: result.providerRequestId,
  output_path: outputPath,
  output_bytes: result.outputBytes.byteLength,
  output_size: result.outputSize.value,
  duration_ms: receipt.duration_ms,
  retries: 0,
}, null, 2));
