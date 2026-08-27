import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import sharp from "sharp";

import {
  createQwenImage3Provider,
  getQwenImage3Readiness,
} from "../lib/visionqa/providers/qwen-image-3.ts";
import { assessRepairOutputMetrics } from "../lib/visionqa/repair-output-gate.ts";

const repoRoot = resolve(import.meta.dirname, "../..");
const webRoot = resolve(import.meta.dirname, "..");
const caseRoot = join(repoRoot, "data", "synthetic_demo_sku_gray_cardigan_v0.1");
const runRoot = join(repoRoot, "data", "repair_benchmark_v0.1", "runs", "cardigan-e2e-001");
const sourcePath = join(caseRoot, "ai-model-draft-controlled-defect.png");
const referencePath = join(caseRoot, "product-truth-grid.png");
const expectedSourceSha256 = "9354fc8b43a199a2f47101b4574047b4d05c5f81ff13c3d6db4ef343db20124e";

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

async function fingerprint(bytes: Uint8Array) {
  const metadata = await sharp(bytes).metadata();
  const pixels = await sharp(bytes)
    .flatten({ background: "#ffffff" })
    .resize(24, 36, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  return { width: metadata.width ?? 0, height: metadata.height ?? 0, pixels };
}

async function outputGate(source: Uint8Array, output: Uint8Array) {
  const [before, after] = await Promise.all([fingerprint(source), fingerprint(output)]);
  let totalDifference = 0;
  let changedCells = 0;
  const cellCount = before.pixels.length / 3;
  for (let offset = 0; offset < before.pixels.length; offset += 3) {
    const difference = (
      Math.abs(before.pixels[offset] - after.pixels[offset]) +
      Math.abs(before.pixels[offset + 1] - after.pixels[offset + 1]) +
      Math.abs(before.pixels[offset + 2] - after.pixels[offset + 2])
    ) / (255 * 3);
    totalDifference += difference;
    if (difference > 0.22) changedCells += 1;
  }
  const sourceAspect = before.width / before.height;
  const outputAspect = after.width / after.height;
  return assessRepairOutputMetrics({
    sourceWidth: before.width,
    sourceHeight: before.height,
    outputWidth: after.width,
    outputHeight: after.height,
    aspectRatioDrift: Math.abs(sourceAspect - outputAspect) / sourceAspect,
    meanPixelDifference: totalDifference / cellCount,
    changedCellRatio: changedCells / cellCount,
  });
}

const env = parseEnv(await readFile(join(webRoot, ".env.local"), "utf8"));
const readiness = getQwenImage3Readiness(env);
if (!readiness.liveReady) throw new Error(`Qwen Image 3 gate blocked: ${readiness.blockers.join(",")}`);

const sourceBytes = new Uint8Array(await readFile(sourcePath));
const referenceBytes = new Uint8Array(await readFile(referencePath));
const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
if (sourceSha256 !== expectedSourceSha256) throw new Error("Controlled source hash mismatch");

const startedAt = new Date().toISOString();
const started = performance.now();
const result = await createQwenImage3Provider(env).edit({
  source: { bytes: sourceBytes, mimeType: "image/png" },
  references: [{ bytes: referenceBytes, mimeType: "image/png" }],
  sourceWidth: 1024,
  sourceHeight: 1536,
  prompt: "只删除画面左侧、穿着者右胸多出来的那一枚黑色五瓣花复制刺绣，并把该小区域恢复为周围连续一致的暖浅灰细罗纹针织面料。必须保留画面右侧、穿着者左胸原本正确的黑色五瓣花刺绣。保持正中四颗深灰纽扣、圆领、长袖、短款平直下摆、开衫颜色与针织纹理不变。人物身份、脸、发型、表情、姿势、手指、黑色长裤、黑色乐福鞋、背景、光线、镜头、全身构图和2:3画幅必须原样保留。",
  negativePrompt: "禁止删除画面右侧的正确花朵；禁止移动、复制、重画或改变正确花朵；禁止改变人物、脸、手、姿势、纽扣数量、领口、袖长、下摆、针织颜色纹理、长裤、鞋、背景、构图或画幅；禁止裁切、拉近、增加文字、Logo、水印、口袋或其他装饰。",
});
const gate = await outputGate(sourceBytes, result.outputBytes);
await mkdir(runRoot, { recursive: true });
const outputPath = join(runRoot, "repair-candidate.png");
await writeFile(outputPath, result.outputBytes);
const receipt = {
  schema_version: "visionqa-cardigan-repair-run-v0.1",
  case_id: "SYN-VQA-GRAY-CARDIGAN-001",
  diagnosis_disposition: "KNOWN_DEFECT_MISSED_HUMAN_CONFIRMED_ISSUE_USED",
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  duration_ms: Math.round(performance.now() - started),
  source: { name: basename(sourcePath), sha256: sourceSha256, width: 1024, height: 1536 },
  reference: { name: basename(referencePath) },
  provider_id: result.providerId,
  model_snapshot: result.modelSnapshot,
  provider_request_id: result.providerRequestId,
  requested_output_size: result.outputSize,
  output: {
    name: basename(outputPath),
    sha256: createHash("sha256").update(result.outputBytes).digest("hex"),
    mime_type: result.outputMimeType,
    bytes: result.outputBytes.byteLength,
  },
  automatic_gate: gate,
  retries: 0,
  actual_cost_cny: null,
  cost_note: "单次实际费用待阿里云账单形成可核验证据。",
  acceptance_status: "NOT_REVIEWED",
};
await writeFile(join(runRoot, "repair-receipt.json"), JSON.stringify(receipt, null, 2), "utf8");
console.log(JSON.stringify({
  ok: true,
  provider_request_id: result.providerRequestId,
  output_path: outputPath,
  output_size: result.outputSize.value,
  duration_ms: receipt.duration_ms,
  automatic_gate: gate.decision,
  gate_metrics: gate.metrics,
  retries: 0,
}, null, 2));
