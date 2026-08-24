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

test("server-renders the truthful VisionQA login entry", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>VisionQA · 商品图评审与营销交付工作台<\/title>/i);
  assert.match(html, /从商品事实，到改图复审与营销交付。/);
  assert.match(html, /建立商品基准/);
  assert.match(html, /提交待评审素材/);
  assert.match(html, /质量评审/);
  assert.match(html, /改图并重新复审/);
  assert.match(html, /生成营销交付/);
  assert.match(html, /登录工作台/);
  assert.match(html, /正式账户认证尚未接入/);
  assert.match(html, /进入内部预览工作台/);
  assert.doesNotMatch(html, /真实客户已采用|已付款|自动放行已开启|认证成功/);
});

test("keeps the five-stage review-repair-delivery workflow in the implementation", async () => {
  const workspaceSource = await readFile(new URL("../app/workspace.tsx", import.meta.url), "utf8");
  const baselineSource = await readFile(new URL("../app/workspace-overview.tsx", import.meta.url), "utf8");
  const intakeSource = await readFile(new URL("../app/workspace-intake.tsx", import.meta.url), "utf8");
  const repairSource = await readFile(new URL("../app/workspace-repair.tsx", import.meta.url), "utf8");
  const deliverySource = await readFile(new URL("../app/workspace-growth.tsx", import.meta.url), "utf8");
  assert.match(workspaceSource, /type WorkspaceArea = "overview" \| "baseline" \| "intake" \| "review" \| "repair" \| "delivery"/);
  assert.match(workspaceSource, /项目总览/);
  assert.match(workspaceSource, /当前唯一下一步/);
  assert.match(workspaceSource, /商品基准/);
  assert.match(workspaceSource, /待评审素材/);
  assert.match(workspaceSource, /质量评审/);
  assert.match(workspaceSource, /改图复审/);
  assert.match(workspaceSource, /营销交付/);
  assert.match(baselineSource, /SKU 链接/);
  assert.match(baselineSource, /上传历史产品图或确认稿/);
  assert.match(baselineSource, /profile-sidebar/);
  assert.match(baselineSource, /编辑商品策略与人群画像/);
  assert.match(intakeSource, /商品图/);
  assert.match(intakeSource, /详情页/);
  assert.match(intakeSource, /模特图/);
  assert.match(intakeSource, /营销物料图/);
  assert.match(intakeSource, /抖音商城/);
  assert.match(intakeSource, /确认是 AI 生成图/);
  assert.match(repairSource, /Seedream/);
  assert.match(repairSource, /千问图像编辑/);
  assert.match(repairSource, /GPT Image/);
  assert.match(repairSource, /修改前后对比/);
  assert.match(repairSource, /API 未配置/);
  assert.match(deliverySource, /对标推广博主/);
  assert.match(deliverySource, /平台营销文案/);
  assert.match(deliverySource, /信息流视频大纲/);
  assert.match(deliverySource, /商业片制作参考/);
  assert.match(deliverySource, /痛点分析/);
  assert.match(deliverySource, /逐字稿/);
  assert.match(deliverySource, /delivery-view-nav/);
  assert.match(deliverySource, /生成概览/);
});

test("keeps the batch and evidence workflow behind quality review", async () => {
  const workspaceSource = await readFile(
    new URL("../app/workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(workspaceSource, /aria-label="筛选"/);
  assert.match(workspaceSource, /aria-label="候选图片"/);
  assert.match(workspaceSource, /打开证据详情/);
  assert.match(workspaceSource, /综合评分/);
  assert.match(workspaceSource, /四项质量维度/);
  assert.match(workspaceSource, /商品表达效能/);
  assert.match(workspaceSource, /修复 Prompt/);
  assert.match(workspaceSource, /review-decision-brief/);
  assert.match(workspaceSource, /review-analysis-details/);
  assert.match(workspaceSource, /view === "evidence"/);
  assert.doesNotMatch(workspaceSource, /Your site is taking shape|react-loading-skeleton/);
});

test("keeps the consent gate, review launch, and separate marketing delivery", async () => {
  const workspaceSource = await readFile(
    new URL("../app/workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workspaceSource, /历史参考与 SKU/);
  assert.match(workspaceSource, /客户画像/);
  assert.match(workspaceSource, /评审范围与启动/);
  assert.match(workspaceSource, /type="file"/);
  assert.match(workspaceSource, /候选图与历史参考图才会发送至阿里云百炼/);
  assert.match(workspaceSource, /开始真实批次评分/);
  assert.match(workspaceSource, /应用不保存图片/);
  assert.match(workspaceSource, /最多 10 张/);
  assert.match(workspaceSource, /商品 SKU 链接/);
  assert.match(workspaceSource, /确认 AI 生成/);
  assert.match(workspaceSource, /function DeliveryWorkspace/);
  assert.match(workspaceSource, /下载选中原图 ZIP/);
  assert.match(workspaceSource, /下载评审 CSV/);
  assert.match(workspaceSource, /隐私与授权/);
  assert.doesNotMatch(workspaceSource, /Fixture 演示|Canary|本地确定性回放|待标定/);
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
  const workspaceSource = await readFile(
    new URL("../app/workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workspaceSource, /score >= 90/);
  assert.match(workspaceSource, /score >= 70/);
  assert.match(workspaceSource, /decision === "PASS"/);
  assert.match(workspaceSource, /\? "REWORK"/);
  assert.match(workspaceSource, /: "REGENERATE"/);
  assert.match(workspaceSource, /const hasBlocker = asset\.issues\.some/);
  assert.match(workspaceSource, /hasBlocker[\s\S]*?\? "REJECT"/);
  assert.doesNotMatch(workspaceSource, /全部 128|PASS 84|REVIEW 36|REJECT 8/);
});

test("keeps evidence-led product expression evaluation in the review implementation", async () => {
  const workspaceSource = await readFile(
    new URL("../app/workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workspaceSource, /评估模板/);
  assert.match(workspaceSource, /平台商品表达/);
  assert.match(workspaceSource, /品牌场景表达/);
  assert.match(workspaceSource, /模板相对分/);
  assert.match(workspaceSource, /视觉重心/);
  assert.match(workspaceSource, /原商品一致性/);
  assert.doesNotMatch(workspaceSource, /促销层级/);
});

test("keeps Marketing Delivery Pack v0.2 and Repair Job governed", async () => {
  const growthSource = await readFile(
    new URL("../app/workspace-growth.tsx", import.meta.url),
    "utf8",
  );
  assert.match(growthSource, /marketing-delivery-pack-v0\.2/);
  assert.match(growthSource, /DEMO_ONLY/);
  assert.match(growthSource, /HUMAN_REVIEW_REQUIRED/);
  assert.match(growthSource, /real_creator_candidates: \[\]/);
  assert.match(growthSource, /human_final_review_required: true/);
  assert.match(growthSource, /真实账号候选/);
  assert.match(growthSource, /小红书/);
  assert.match(growthSource, /抖音/);
  assert.match(growthSource, /video_generation_prompts/);
  assert.match(growthSource, /@商品正面参考图/);
  assert.match(growthSource, /折扣/);
  assert.match(growthSource, /pain_point_map/);
  assert.match(growthSource, /verbatim_scripts/);

  const contract = JSON.parse(
    await readFile(
      new URL("../contracts/marketing-delivery-pack-v0.2.schema.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(contract.properties.schema_version.const, "marketing-delivery-pack-v0.2");
  assert.equal(contract.properties.human_final_review_required.const, true);
  assert.deepEqual(contract.properties.evidence_status.enum, ["DEMO_ONLY", "HUMAN_REVIEW_REQUIRED"]);
  assert.equal(contract.properties.video_generation_prompts.maxItems, 2);

  const repairContract = JSON.parse(await readFile(new URL("../contracts/repair-job-v0.1.schema.json", import.meta.url), "utf8"));
  assert.equal(repairContract.properties.schema_version.const, "repair-job-v0.1");
  assert.equal(repairContract.properties.human_final_review_required.const, true);
});

test("exposes the L2 tool loop without pretending the test provider is a model", async () => {
  const source = await readFile(new URL("../app/workspace-growth.tsx", import.meta.url), "utf8");
  assert.match(source, /L2 领域智能体运行时/);
  assert.match(source, /非模型测试 Provider/);
  assert.match(source, /决策 → 工具 → 观察 → 审计 → 停止/);
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
