import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

const repoRoot = resolve(import.meta.dirname, "../..");
const caseRoot = join(repoRoot, "data", "synthetic_demo_sku_gray_cardigan_v0.1");
const runRoot = join(repoRoot, "data", "repair_benchmark_v0.1", "runs", "cardigan-e2e-001");
const sourcePath = join(caseRoot, "ai-model-draft-controlled-defect.png");
const outputPath = join(runRoot, "repair-candidate.png");

const [sourceBytes, outputBytes] = await Promise.all([
  readFile(sourcePath),
  readFile(outputPath),
]);

const panelWidth = 1200;
const panelHeight = 1800;
const headerHeight = 92;
const label = (text: string) => Buffer.from(`
  <svg width="${panelWidth}" height="${headerHeight}">
    <rect width="100%" height="100%" fill="#f3f3f3"/>
    <text x="44" y="58" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#171717">${text}</text>
  </svg>
`);
const beforePanel = await sharp(sourceBytes)
  .resize(panelWidth, panelHeight, { fit: "contain", background: "#ededed" })
  .png()
  .toBuffer();
const afterPanel = await sharp(outputBytes)
  .resize(panelWidth, panelHeight, { fit: "contain", background: "#ededed" })
  .png()
  .toBuffer();
const comparison = await sharp({
  create: {
    width: panelWidth * 2 + 2,
    height: panelHeight + headerHeight,
    channels: 3,
    background: "#d2d2d2",
  },
})
  .composite([
    { input: label("BEFORE · 右胸多余刺绣"), left: 0, top: 0 },
    { input: label("AFTER · 错误刺绣已移除"), left: panelWidth + 2, top: 0 },
    { input: beforePanel, left: 0, top: headerHeight },
    { input: afterPanel, left: panelWidth + 2, top: headerHeight },
  ])
  .png()
  .toBuffer();
await writeFile(join(runRoot, "before-after-comparison.png"), comparison);

const delivery4k = await sharp(outputBytes)
  .resize(2560, 3840, { fit: "fill", kernel: sharp.kernel.lanczos3 })
  .png({ compressionLevel: 9 })
  .toBuffer();
await writeFile(join(runRoot, "delivery-4k-2560x3840.png"), delivery4k);

const receipt = {
  schema_version: "visionqa-cardigan-delivery-v0.1",
  case_id: "SYN-VQA-GRAY-CARDIGAN-001",
  comparison: {
    name: "before-after-comparison.png",
    width: 2402,
    height: 1892,
    sha256: createHash("sha256").update(comparison).digest("hex"),
  },
  delivery: {
    name: "delivery-4k-2560x3840.png",
    width: 2560,
    height: 3840,
    sha256: createHash("sha256").update(delivery4k).digest("hex"),
    detail_reconstruction: false,
    method: "LOCAL_LANCZOS3_RESAMPLE",
  },
  boundary: "4K 文件只提升像素尺寸，不宣称重建原图不存在的细节；真实交付仍受独立视觉复验与客户授权 Gate 控制。",
};
await writeFile(join(runRoot, "delivery-receipt.json"), JSON.stringify(receipt, null, 2), "utf8");
console.log(JSON.stringify({
  comparison: receipt.comparison,
  delivery: receipt.delivery,
}, null, 2));
