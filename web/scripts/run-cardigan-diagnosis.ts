import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

const repoRoot = resolve(import.meta.dirname, "../..");
const caseRoot = join(repoRoot, "data", "synthetic_demo_sku_gray_cardigan_v0.1");
const runRoot = join(repoRoot, "data", "repair_benchmark_v0.1", "runs", "cardigan-e2e-001");
const endpoint = "http://localhost:3141/api/live-evaluate";
const requestId = crypto.randomUUID();

async function prepareLiveUpload(path: string) {
  for (const quality of [82, 72, 62, 52]) {
    const bytes = await sharp(path)
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality, chromaSubsampling: "4:4:4" })
      .toBuffer();
    if (bytes.byteLength <= 900 * 1024) return bytes;
  }
  throw new Error("诊断专用副本无法压缩到受控上传上限。 ");
}

const candidateBytes = await prepareLiveUpload(join(caseRoot, "ai-model-draft-controlled-defect.png"));
const referenceBytes = await prepareLiveUpload(join(caseRoot, "product-truth-grid.png"));
const form = new FormData();
form.set("candidate", new File([candidateBytes], "ai-model-draft-controlled-defect-live.jpg", { type: "image/jpeg" }));
form.append("references", new File([referenceBytes], "product-truth-grid-live.jpg", { type: "image/jpeg" }));
form.set("channel", "内部合成测试");
form.set("placement", "AI模特图");
form.set("referenceStatus", "complete");
form.set("provenanceStatus", "confirmed_ai");
form.set("commercialTemplateId", "model-image-repair");
form.set("customerProfile", JSON.stringify({
  styles: ["简约通勤"],
  priceMin: "199",
  priceMax: "399",
  audiences: ["都市通勤女性"],
  ageRanges: ["25-34"],
  genderProfiles: ["女性"],
  cityTiers: ["一线及新一线"],
  audienceSegments: ["都市白领"],
  scenarios: ["通勤", "日常叠穿"],
  purchaseDrivers: ["版型", "面料质感", "细节一致性"],
  skuLinks: [],
  skuFacts: [
    "暖浅灰细罗纹针织圆领长袖短款开衫",
    "前襟纽扣总数恰好为4颗哑光深灰纽扣",
    "正确刺绣总数恰好为1枚，位于穿着者左胸（画面右侧）",
    "穿着者右胸（画面左侧）无刺绣或装饰",
    "无口袋、无拉链、无品牌文字"
  ],
}));
form.set("consent", "confirmed");

const startedAt = new Date().toISOString();
const started = performance.now();
const response = await fetch(endpoint, {
  method: "POST",
  headers: { "x-request-id": requestId },
  body: form,
});
const body = await response.json().catch(() => null);
const receipt = {
  schema_version: "visionqa-cardigan-diagnosis-run-v0.1",
  case_id: "SYN-VQA-GRAY-CARDIGAN-001",
  request_id: requestId,
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  duration_ms: Math.round(performance.now() - started),
  http_status: response.status,
  success: response.ok,
  retries: 0,
  upload_bytes: {
    candidate: candidateBytes.byteLength,
    reference: referenceBytes.byteLength
  },
  actual_cost_cny: null,
  cost_note: "单次实际费用待阿里云账单形成可核验证据。",
  response: body,
};
await mkdir(runRoot, { recursive: true });
await writeFile(join(runRoot, "diagnosis-response-v3-structured-sku-facts.json"), JSON.stringify(receipt, null, 2), "utf8");
console.log(JSON.stringify({
  ok: response.ok,
  status: response.status,
  request_id: requestId,
  duration_ms: receipt.duration_ms,
  provider_request_id: body?.provider?.providerRequestId ?? null,
  decision: body?.result?.gate_evaluation?.decision ?? null,
  observation_titles: body?.result?.model_evaluation?.observations?.map((item: { title?: string }) => item.title) ?? [],
  repair_prompt_ready: Boolean(body?.result?.action_plan?.repair_prompt?.prompt),
  retries: 0,
}, null, 2));
if (!response.ok) process.exitCode = 1;
