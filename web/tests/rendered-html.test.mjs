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

test("server-renders the focused AI model-image repair home page", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /VisionQA · AI 模特图修正与交付/);
  assert.match(html, /定位并修正 AI 模特图中的商品漂移/);
  assert.match(html, /VISION ENGINE · [\s\S]*?CHECKING/);
  assert.match(html, /REPAIR COPILOT/);
  assert.match(html, /HUMAN REVIEW/);
  assert.match(html, /PROJECT/);
  assert.match(html, /LOCAL/);
  assert.doesNotMatch(html, /SCAN 0\.42s|PASS 74%|CONF 0\.84|客观评分/);
});

test("server-renders the truthful VisionQA login entry", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>VisionQA · AI 模特图修正与交付工作台<\/title>/i);
  assert.match(html, /把 AI 模特草图，修成可交付商品图。/);
  assert.match(html, /建立商品真值/);
  assert.match(html, /上传 AI 模特草图/);
  assert.match(html, /定位商品与人体问题/);
  assert.match(html, /修正、复验并输出 4K/);
  assert.match(html, /登录工作台/);
  assert.match(html, /正式账户认证尚未接入/);
  assert.match(html, /进入内部预览工作台/);
  assert.doesNotMatch(html, /真实客户已采用|已付款|自动放行已开启|认证成功/);
});

test("keeps the focused product and model-image repair workflow in the implementation", async () => {
  const workspaceSource = await readFile(new URL("../app/workspace.tsx", import.meta.url), "utf8");
  const baselineSource = await readFile(new URL("../app/workspace-overview.tsx", import.meta.url), "utf8");
  const intakeSource = await readFile(new URL("../app/workspace-intake.tsx", import.meta.url), "utf8");
  const repairSource = await readFile(new URL("../app/workspace-repair.tsx", import.meta.url), "utf8");
  const upscaleSource = await readFile(new URL("../lib/visionqa/upscale.ts", import.meta.url), "utf8");
  const repairProviderRoute = await readFile(new URL("../app/api/repair-jobs/route.ts", import.meta.url), "utf8");
  const repairAgentSource = await readFile(new URL("../lib/visionqa/agents/repair-orchestrator.ts", import.meta.url), "utf8");
  const deliverySource = await readFile(new URL("../app/workspace-growth.tsx", import.meta.url), "utf8");
  assert.match(workspaceSource, /type WorkspaceArea = "overview" \| "baseline" \| "intake" \| "review" \| "repair" \| "delivery"/);
  assert.match(workspaceSource, /项目总览/);
  assert.match(workspaceSource, /当前唯一下一步/);
  assert.match(workspaceSource, /商品真值/);
  assert.match(workspaceSource, /AI 模特草图/);
  assert.match(workspaceSource, /问题诊断/);
  assert.match(workspaceSource, /修正与交付/);
  assert.match(workspaceSource, /const visibleAreas/);
  assert.match(baselineSource, /SKU 链接/);
  assert.match(baselineSource, /确认过的商品事实/);
  assert.match(baselineSource, /上传商品白底图或官方确认稿/);
  assert.match(baselineSource, /profile-sidebar/);
  assert.match(baselineSource, /编辑商品策略与人群画像/);
  assert.match(intakeSource, /商品图与模特图修正/);
  assert.match(intakeSource, /AI 商品图/);
  assert.match(intakeSource, /真人实拍图/);
  assert.match(intakeSource, /具体问题、修正候选与前后对比/);
  assert.doesNotMatch(intakeSource, /可放在同一批次/);
  assert.match(intakeSource, /抖音商城/);
  assert.match(intakeSource, /确认是 AI 生成图/);
  assert.match(repairSource, /Seedream/);
  assert.match(repairSource, /Qwen Image 3\.0 Pro/);
  assert.match(repairSource, /千问 Image Edit Max/);
  assert.match(repairSource, /GPT Image/);
  assert.match(repairSource, /修改前后对比/);
  assert.match(repairSource, /生成 4K 尺寸文件/);
  assert.match(upscaleSource, /AI 细节重建超分/);
  assert.match(repairSource, /未进行 AI 细节重建/);
  assert.match(repairSource, /内部处理记录/);
  assert.match(repairSource, /不冒充六个独立模型已经在线推理/);
  assert.match(workspaceSource, /pendingCandidateAsset/);
  assert.match(workspaceSource, /item\.result \?\? pendingCandidateAsset/);
  assert.match(repairProviderRoute, /REPAIR_PROVIDER_NOT_AUTHORIZED/);
  assert.match(repairProviderRoute, /DATA_TRANSFER_CONSENT_REQUIRED/);
  assert.match(repairAgentSource, /LOCAL_STATE_MACHINE_NO_MODEL/);
  assert.match(repairAgentSource, /independentModelAgentsActive: false/);
  assert.match(deliverySource, /对标推广博主/);
  assert.match(deliverySource, /平台营销文案/);
  assert.match(deliverySource, /信息流视频大纲/);
  assert.match(deliverySource, /商业片制作参考/);
  assert.match(deliverySource, /痛点分析/);
  assert.match(deliverySource, /逐字稿/);
  assert.match(deliverySource, /delivery-view-nav/);
  assert.match(deliverySource, /生成概览/);
});

test("persists the workbench as a versioned local project with an audit trail", async () => {
  const workspaceSource = await readFile(new URL("../app/workspace.tsx", import.meta.url), "utf8");
  const projectStoreSource = await readFile(new URL("../lib/visionqa/project-store.ts", import.meta.url), "utf8");
  const projectSchema = JSON.parse(await readFile(new URL("../contracts/visionqa-project-v0.1.schema.json", import.meta.url), "utf8"));
  assert.match(workspaceSource, /loadLatestLocalProject/);
  assert.match(workspaceSource, /createLocalProject/);
  assert.match(workspaceSource, /saveLocalProject/);
  assert.match(workspaceSource, /本机已保存/);
  assert.match(workspaceSource, /本机项目记录/);
  assert.match(workspaceSource, /不会上传客户图片/);
  assert.match(projectStoreSource, /visionqa-project-v0\.1/);
  assert.match(projectStoreSource, /visionqa-workspace-project-payload-v0\.1/);
  assert.match(projectStoreSource, /LOCAL_INDEXED_DB/);
  assert.match(projectStoreSource, /PROJECTS_STORE = "projects"/);
  assert.match(projectStoreSource, /ASSETS_STORE = "assets"/);
  assert.match(projectStoreSource, /EVENTS_STORE = "events"/);
  assert.match(projectStoreSource, /expectedRevision/);
  assert.equal(projectSchema.properties.schemaVersion.const, "visionqa-project-v0.1");
  assert.equal(projectSchema.properties.storageMode.const, "LOCAL_INDEXED_DB");
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

test("keeps the consent gate and focused model-image diagnosis launch", async () => {
  const workspaceSource = await readFile(
    new URL("../app/workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workspaceSource, /商品真值与 SKU/);
  assert.match(workspaceSource, /客户画像/);
  assert.match(workspaceSource, /分析图片问题/);
  assert.match(workspaceSource, /type="file"/);
  assert.match(workspaceSource, /AI 模特草图与.*商品真值图可发送至阿里云百炼/);
  assert.match(workspaceSource, /开始 AI 问题诊断/);
  assert.match(workspaceSource, /服务端不留存原图/);
  assert.match(workspaceSource, /本机项目会保存工作集/);
  assert.match(workspaceSource, /一次最多 3 张/);
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
  assert.match(workspaceSource, /真实诊断完成前，本区域不会显示示例分数或模拟结论/);
  assert.match(workspaceSource, /setApiAsset\(null\)/);

  const liveRouteSource = await readFile(
    new URL("../app/api/live-evaluate/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(liveRouteSource, /references: referenceInputs/);
  assert.match(liveRouteSource, /parseCustomerProfile/);
  assert.match(liveRouteSource, /历史参考图最多上传/);
  assert.match(liveRouteSource, /商品参考图未进入模型上下文/);
  assert.match(liveRouteSource, /客户确认的 SKU 事实/);
  assert.match(liveRouteSource, /lockedAttributes: customerProfile\.skuFacts/);
  assert.match(liveRouteSource, /review_policy: "HUMAN_REVIEW_REQUIRED"/);
  assert.match(liveRouteSource, /auto_pass_enabled: false/);
  assert.match(liveRouteSource, /ai_model_image_repair/);
  assert.match(liveRouteSource, /缺少价格、优惠、CTA 或商业贴字不是缺陷/);
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

test("keeps evidence-led analysis internal while customer results stay problem-led", async () => {
  const workspaceSource = await readFile(
    new URL("../app/workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workspaceSource, /内部分析、Prompt 与审计细节/);
  assert.match(workspaceSource, /问题与建议/);
  assert.match(workspaceSource, /确认问题并进入修正/);
  assert.match(workspaceSource, /从头体验开衫案例/);
  assert.match(workspaceSource, /查看完整修正结果/);
  assert.match(workspaceSource, /不调用模型 · 不产生费用/);
  assert.match(workspaceSource, /综合评分/);
  assert.match(workspaceSource, /视觉重心/);
  assert.match(workspaceSource, /原商品一致性/);
  assert.match(workspaceSource, /只修正以下用户确认问题/);
  assert.doesNotMatch(workspaceSource, /平台商品表达/);
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
  const repairCaseContract = JSON.parse(await readFile(new URL("../contracts/repair-case-v0.1.schema.json", import.meta.url), "utf8"));
  assert.equal(repairCaseContract.properties.schemaVersion.const, "visionqa-repair-collaboration-v0.1");
  assert.equal(repairCaseContract.properties.independentModelAgentsActive.const, false);
  assert.equal(repairCaseContract.properties.humanFinalReviewRequired.const, true);
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
