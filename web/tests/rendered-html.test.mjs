import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/workspace") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders a truthful product home page", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /VisionQA · 服饰电商视觉质量评估/);
  assert.match(html, /结构化评分、修复 Prompt 与人工发布门禁/);
  assert.match(html, /VISION ENGINE · [\s\S]*?CHECKING/);
  assert.match(html, /HUMAN REVIEW/);
  assert.match(html, /AUTO PASS/);
  assert.match(html, /OFF/);
  assert.doesNotMatch(html, /SCAN 0\.42s|PASS 74%|CONF 0\.84|客观评分/);
});

test("server-renders the VisionQA workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>VisionQA · 视觉审核工作台<\/title>/i);
  assert.match(html, /批次审核工作台/);
  assert.match(html, /服饰电商商品图视觉评分、证据审核与优化工作台/);
  assert.match(html, /示例项目/);
  assert.match(html, /model-blue-floral-dress-front\.png/);
  assert.match(html, /人工改判/);
});

test("renders batch-first structure with evidence navigation", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /aria-label="筛选"/);
  assert.match(html, /aria-label="候选图片"/);
  assert.match(html, /打开证据详情/);
  assert.match(html, /综合评分/);
  assert.match(html, /四大 Vision QA Skill/);
  assert.match(html, /商业价值/);
  assert.match(html, /修复 Prompt/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("renders the consent-gated four-step customer workflow", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /建立客户标准并完成一批图片审核/);
  assert.match(html, /type="file"/);
  assert.match(html, /历史参考与客户画像会进入真实模型上下文/);
  assert.match(html, /开始真实批次评分/);
  assert.match(html, /应用不保存图片/);
  assert.match(html, /最多 10 张/);
  assert.match(html, /商品 SKU 链接/);
  assert.match(html, /客户画像/);
  assert.match(html, /AI 来源/);
  assert.match(html, /下载选中原图 ZIP/);
  assert.match(html, /下载评分 CSV/);
  assert.match(html, /隐私与授权/);
  assert.doesNotMatch(html, /Fixture 演示|Canary|本地确定性回放|待标定/);

  const workspaceSource = await readFile(
    new URL("../app/workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workspaceSource, /sha256Blob\(file\)/);
  assert.match(workspaceSource, /LOCAL_EVALUATION_MODE/);
  assert.match(workspaceSource, /LOCAL_FEEDBACK_STORAGE_KEY/);
  assert.match(workspaceSource, /evaluateLiveCandidate/);
  assert.match(workspaceSource, /liveConsent/);
  assert.match(workspaceSource, /referenceFiles/);
  assert.match(workspaceSource, /customerProfile/);
  assert.match(workspaceSource, /batchCandidates/);
  assert.match(workspaceSource, /function BatchWaitingState/);
  assert.match(workspaceSource, /真实评分完成前，本区域不会显示示例分数或模拟结论/);
  assert.match(workspaceSource, /setApiAsset\(null\)/);

  const liveRouteSource = await readFile(
    new URL("../app/api/live-evaluate/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(liveRouteSource, /references: referenceInputs/);
  assert.match(liveRouteSource, /parseCustomerProfile/);
  assert.match(liveRouteSource, /历史参考图最多上传/);
  assert.match(liveRouteSource, /商品参考图未进入模型上下文/);
  assert.match(liveRouteSource, /review_policy: "HUMAN_REVIEW_REQUIRED"/);
  assert.match(liveRouteSource, /auto_pass_enabled: false/);
});

test("keeps score bands consistent while allowing blocker gate overrides", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /全部 12/);
  assert.match(html, /PASS 4/);
  assert.match(html, /REVIEW 4/);
  assert.match(html, /REJECT 4/);
  assert.doesNotMatch(html, /全部 128|PASS 84|REVIEW 36|REJECT 8/);

  const tiles = [
    ...html.matchAll(
      /<button class="asset-tile"[\s\S]*?系统判断 (PASS|REVIEW|REJECT)[\s\S]*?<span class="asset-score mono">(\d+)/g,
    ),
  ];
  assert.equal(tiles.length, 12);
  let highScoreGateOverrides = 0;
  for (const [, decision, rawScore] of tiles) {
    const score = Number(rawScore);
    if (score >= 90) {
      assert.match(decision, /PASS|REJECT/);
      if (decision === "REJECT") highScoreGateOverrides += 1;
    } else if (score >= 70) {
      assert.equal(decision, "REVIEW");
    } else {
      assert.equal(decision, "REJECT");
    }
  }
  assert.equal(highScoreGateOverrides, 1);
});

test("renders template-relative commercial evaluation", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /商业模板/);
  assert.match(html, /天猫 \/ 平台促销主图/);
  assert.match(html, /品牌旗舰主图/);
  assert.match(html, /模板相对分/);
  assert.match(html, /平台促销主图标准/);
  assert.doesNotMatch(html, /商业价值诊断/);
});

test("keeps server audit with an explicit local fallback", async () => {
  const workspaceSource = await readFile(
    new URL("../app/workspace.tsx", import.meta.url),
    "utf8",
  );
  const routeSource = await readFile(
    new URL("../app/api/overrides/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(workspaceSource, /fetch\("\/api\/overrides"/);
  assert.match(workspaceSource, /storage: "server" \| "local"/);
  assert.match(workspaceSource, /D1 未绑定，已降级保存到本浏览器/);
  assert.match(routeSource, /AUDIT_DB_UNAVAILABLE/);
  assert.match(routeSource, /humanOverrides/);
  assert.match(routeSource, /commercialRecalibrationLogs/);
  assert.match(routeSource, /status: "CAPTURED"/);
  assert.match(routeSource, /auditEvents/);
});
