import assert from "node:assert/strict";
import test from "node:test";
import {
  addEvolutionEvidence,
  applyPlannerDecision,
  canPromoteSuccessfulExperience,
  createRepairEvolutionEpisode,
  publicEvolutionEvents,
} from "../lib/visionqa/agents/recursive-repair.ts";
import {
  REPAIR_MODEL_REGISTRY,
  selectDeterministicRepairRoutes,
} from "../lib/visionqa/agents/repair-model-registry.ts";
import {
  createDeepSeekRepairPlanner,
  DEEPSEEK_REPAIR_PLANNER_MODEL,
  DEEPSEEK_REPAIR_PLANNER_SCOPE,
  DeepSeekPlannerError,
  getDeepSeekPlannerReadiness,
} from "../lib/visionqa/agents/deepseek-repair-planner.ts";
import { planCustomerRepair } from "../lib/visionqa/agents/repair-planning-service.ts";
import { createBetaServiceForTest } from "../lib/beta/service.ts";

const configuredPlanner = {
  DEEPSEEK_API_KEY: "test-only-secret",
  VISIONQA_ORCHESTRATOR_DEEPSEEK_APPROVED: "true",
  VISIONQA_ORCHESTRATOR_DEEPSEEK_PAID_CALLS_APPROVED: "true",
  VISIONQA_ORCHESTRATOR_DEEPSEEK_DATA_SCOPE: DEEPSEEK_REPAIR_PLANNER_SCOPE,
  VISIONQA_ORCHESTRATOR_DEEPSEEK_MODEL: DEEPSEEK_REPAIR_PLANNER_MODEL,
};

test("recursive repair only advances from known evidence and approved routes", () => {
  const initial = createRepairEvolutionEpisode({ projectId: "project-1", repairAttemptId: "attempt-1", id: "episode-1", now: "2026-09-01T00:00:00.000Z" });
  const withEvidence = addEvolutionEvidence(initial, [{
    fingerprint: "evidence-1",
    kind: "VISIBLE_ISSUE",
    summary: "门襟多出一颗纽扣",
    verifiedBy: "HUMAN",
  }]);
  const routed = applyPlannerDecision(withEvidence, {
    action: "ROUTE",
    routeId: "qwen-image-3-pro-edit",
    publicSummary: "已核对商品真值，准备进行局部修正。",
    strategyRevision: null,
    evidenceFingerprints: ["evidence-1"],
  }, ["qwen-image-3-pro-edit"]);
  assert.equal(routed.status, "READY_TO_EXECUTE");
  assert.equal(routed.selectedRoute, "qwen-image-3-pro-edit");
  assert.deepEqual(publicEvolutionEvents(routed)[0], {
    id: routed.events[0].id,
    role_label: "任务协调",
    status: "ACTION_REQUIRED",
    summary: "已核对商品真值，准备进行局部修正。",
    round: 1,
    created_at: routed.events[0].createdAt,
  });

  const blocked = applyPlannerDecision(withEvidence, {
    action: "ROUTE",
    routeId: "unapproved-model",
    publicSummary: "尝试未知路线",
    strategyRevision: null,
    evidenceFingerprints: ["evidence-1"],
  }, ["qwen-image-3-pro-edit"]);
  assert.equal(blocked.status, "STOPPED");
  assert.equal(blocked.stopReason, "POLICY_BLOCKED");
});

test("recursive repair stops repetition and only promotes human-confirmed customer outcomes", () => {
  let episode = createRepairEvolutionEpisode({ projectId: "project-1", repairAttemptId: "attempt-1" });
  episode = addEvolutionEvidence(episode, [{ fingerprint: "e-1", kind: "FAILURE_CLASS", summary: "非目标区域漂移", verifiedBy: "SYSTEM" }]);
  for (let round = 1; round <= 3; round += 1) {
    episode = applyPlannerDecision(episode, {
      action: "REFINE",
      routeId: null,
      publicSummary: `第 ${round} 轮调整局部修正策略。`,
      strategyRevision: "缩小目标区域并强化非目标锁定",
      evidenceFingerprints: ["e-1"],
    }, ["qwen-image-3-pro-edit"]);
  }
  assert.equal(episode.status, "STOPPED");
  assert.equal(episode.stopReason, "MAX_ROUNDS");
  assert.equal(canPromoteSuccessfulExperience({ gatePassed: true, humanConfirmed: true, customerOutcome: "ACCEPTED", sourceEvidenceFingerprints: ["e-1"] }), true);
  assert.equal(canPromoteSuccessfulExperience({ gatePassed: true, humanConfirmed: false, customerOutcome: "DOWNLOADED", sourceEvidenceFingerprints: ["e-1"] }), false);
  assert.equal(canPromoteSuccessfulExperience({ gatePassed: true, humanConfirmed: true, customerOutcome: "REJECTED", sourceEvidenceFingerprints: ["e-1"] }), false);
});

test("model registry keeps planner away from raw images and prioritizes approved bbox editing", () => {
  const planner = REPAIR_MODEL_REGISTRY.find((entry) => entry.role === "PLANNER");
  assert.equal(planner?.supportsRawImages, false);
  const routes = selectDeterministicRepairRoutes({
    localizedRegionAvailable: true,
    referenceImageCount: 2,
    priority: "QUALITY",
    approvedRouteIds: ["qwen-image-3-pro-edit", "wan-2-7-image-pro-bbox-edit"],
  });
  assert.equal(routes[0].routeId, "wan-2-7-image-pro-bbox-edit");
  assert.ok(routes.every((entry) => entry.role === "IMAGE_EDITOR"));
});

test("DeepSeek planner fails closed until every server-side approval is present", () => {
  const readiness = getDeepSeekPlannerReadiness({ DEEPSEEK_API_KEY: "configured-but-not-approved" });
  assert.equal(readiness.liveReady, false);
  assert.deepEqual(readiness.blockers, [
    "PROVIDER_APPROVAL_REQUIRED",
    "PAID_CALL_APPROVAL_REQUIRED",
    "DATA_SCOPE_NOT_APPROVED",
    "MODEL_NOT_LOCKED",
  ]);
  assert.throws(
    () => createDeepSeekRepairPlanner({}),
    (error: unknown) => error instanceof DeepSeekPlannerError && error.code === "CONFIGURATION",
  );
});

test("DeepSeek planner sends structured facts only, parses JSON, and never leaks its key into the body", async () => {
  let calls = 0;
  const planner = createDeepSeekRepairPlanner(configuredPlanner, async (_url, init) => {
    calls += 1;
    const body = String(init?.body);
    assert.equal(body.includes(configuredPlanner.DEEPSEEK_API_KEY), false);
    assert.equal(body.includes("data:image"), false);
    const parsed = JSON.parse(body);
    assert.equal(parsed.model, DEEPSEEK_REPAIR_PLANNER_MODEL);
    assert.deepEqual(parsed.response_format, { type: "json_object" });
    assert.deepEqual(parsed.thinking, { type: "enabled" });
    assert.equal(parsed.reasoning_effort, "low");
    assert.equal("temperature" in parsed, false);
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        action: "ROUTE",
        route_id: "qwen-image-3-pro-edit",
        public_summary: "商品事实已核对，准备执行局部修正。",
        strategy_revision: null,
        evidence_fingerprints: ["evidence-1"],
      }) } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const decision = await planner.decide({
    objective: "只修正多余纽扣",
    round: 1,
    evidence: [{ fingerprint: "evidence-1", kind: "VISIBLE_ISSUE", summary: "多余纽扣", verifiedBy: "HUMAN" }],
    allowedRouteIds: ["qwen-image-3-pro-edit"],
  });
  assert.equal(calls, 1);
  assert.equal(decision.action, "ROUTE");
  assert.equal(decision.routeId, "qwen-image-3-pro-edit");
});

test("DeepSeek planner normalizes lowercase action enums without relaxing route policy", async () => {
  const planner = createDeepSeekRepairPlanner(configuredPlanner, async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      action: "route",
      route_id: "qwen-image-3-pro-edit",
      public_summary: "执行局部修正。",
      strategy_revision: null,
      evidence_fingerprints: ["issue:1"],
    }) } }],
  }), { status: 200, headers: { "content-type": "application/json" } }));
  const decision = await planner.decide({
    objective: "修正已确认问题",
    round: 1,
    evidence: [{ fingerprint: "issue:1", kind: "CUSTOMER_CORRECTION", summary: "多余装饰", verifiedBy: "HUMAN" }],
    allowedRouteIds: ["qwen-image-3-pro-edit"],
  });
  assert.equal(decision.action, "ROUTE");
  assert.equal(decision.routeId, "qwen-image-3-pro-edit");
});

test("DeepSeek planner rejects a model-selected route outside the server whitelist without retry", async () => {
  let calls = 0;
  const planner = createDeepSeekRepairPlanner(configuredPlanner, async () => {
    calls += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        action: "ROUTE",
        route_id: "invented-route",
        public_summary: "使用新路线",
        strategy_revision: null,
        evidence_fingerprints: ["evidence-1"],
      }) } }],
    }), { status: 200 });
  });
  await assert.rejects(
    () => planner.decide({
      objective: "局部修正",
      round: 1,
      evidence: [{ fingerprint: "evidence-1", kind: "VISIBLE_ISSUE", summary: "错误", verifiedBy: "HUMAN" }],
      allowedRouteIds: ["qwen-image-3-pro-edit"],
    }),
    (error: unknown) => error instanceof DeepSeekPlannerError && error.code === "INVALID_OUTPUT",
  );
  assert.equal(calls, 1);
});

test("customer repair planning uses deterministic fallback when DeepSeek is not approved", async () => {
  let episode = createRepairEvolutionEpisode({ projectId: "project-1", repairAttemptId: "attempt-1" });
  episode = addEvolutionEvidence(episode, [{ fingerprint: "e-1", kind: "VISIBLE_ISSUE", summary: "多余纽扣", verifiedBy: "HUMAN" }]);
  const outcome = await planCustomerRepair({
    episode,
    routing: {
      localizedRegionAvailable: true,
      referenceImageCount: 1,
      priority: "QUALITY",
      approvedRouteIds: ["qwen-image-3-pro-edit"],
    },
    env: {},
  });
  assert.equal(outcome.mode, "DETERMINISTIC_FALLBACK");
  assert.equal(outcome.decision.routeId, "qwen-image-3-pro-edit");
});

test("customer repair planning lets DeepSeek lead only inside the server route whitelist", async () => {
  let episode = createRepairEvolutionEpisode({ projectId: "project-1", repairAttemptId: "attempt-1" });
  episode = addEvolutionEvidence(episode, [{ fingerprint: "e-1", kind: "VISIBLE_ISSUE", summary: "多余纽扣", verifiedBy: "HUMAN" }]);
  let calls = 0;
  const outcome = await planCustomerRepair({
    episode,
    routing: {
      localizedRegionAvailable: true,
      referenceImageCount: 1,
      priority: "QUALITY",
      approvedRouteIds: ["qwen-image-3-pro-edit"],
    },
    env: configuredPlanner,
    authorizeExternalDispatch: () => ({ record() {} }),
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        action: "ROUTE",
        route_id: "qwen-image-3-pro-edit",
        public_summary: "规划器选择高保真局部修正。",
        strategy_revision: null,
        evidence_fingerprints: ["e-1"],
      }) } }] }), { status: 200 });
    },
  });
  assert.equal(calls, 1);
  assert.equal(outcome.mode, "DEEPSEEK_V4_FLASH");
  assert.deepEqual(outcome.allowedRouteIds, ["qwen-image-3-pro-edit"]);
});

test("customer repair planning records one authorized DeepSeek dispatch and falls back after one provider failure", async () => {
  let episode = createRepairEvolutionEpisode({ projectId: "project-1", repairAttemptId: "attempt-1" });
  episode = addEvolutionEvidence(episode, [{ fingerprint: "e-1", kind: "VISIBLE_ISSUE", summary: "多余纽扣", verifiedBy: "HUMAN" }]);
  let calls = 0;
  let records = 0;
  const outcome = await planCustomerRepair({
    episode,
    routing: { localizedRegionAvailable: true, referenceImageCount: 1, priority: "QUALITY", approvedRouteIds: ["qwen-image-3-pro-edit"] },
    env: configuredPlanner,
    authorizeExternalDispatch: () => ({ record() { records += 1; } }),
    fetchImpl: async () => {
      calls += 1;
      return new Response("temporary failure", { status: 503 });
    },
  });
  assert.equal(calls, 1);
  assert.equal(records, 1);
  assert.equal(outcome.mode, "DETERMINISTIC_FALLBACK");
  assert.equal(outcome.plannerFailureCode, "PROVIDER_REJECTED");
  assert.equal(outcome.decision.routeId, "qwen-image-3-pro-edit");
});

test("customer repair service exposes only safe public agent events for its own tenant", async () => {
  const service = createBetaServiceForTest();
  const invite = await service.createInvite({ label: "递归测试客户" });
  const { session } = await service.consumeInvite(invite.token);
  const project = service.createProject(session, "纽扣测试 SKU");
  const bytes = testPngBytes(100, 100);
  const truthIntent = service.createUploadIntent(session, { projectId: project.id, role: "TRUTH", fileName: "truth.png", mimeType: "image/png", byteSize: bytes.byteLength, width: 100, height: 100 });
  const candidateIntent = service.createUploadIntent(session, { projectId: project.id, role: "CANDIDATE", fileName: "candidate.png", mimeType: "image/png", byteSize: bytes.byteLength, width: 100, height: 100 });
  const truth = await service.putAsset(session, truthIntent.id, bytes);
  const candidate = await service.putAsset(session, candidateIntent.id, bytes);
  const batch = service.createScreeningBatch(session, { projectId: project.id, skuName: project.name, truthAssetIds: [truth.id], candidateAssetIds: [candidate.id] });
  const completed = service.completeScreeningBatch(session, batch.id, [{
    assetId: candidate.id,
    decision: "NEEDS_ATTENTION",
    primaryIssue: "纽扣数量不一致",
    visibleEvidence: "候选图多出一颗纽扣",
    repairPrompt: "移除多余纽扣",
    issueRegion: { x: 0.4, y: 0.3, width: 0.2, height: 0.3 },
  }]);
  const attempt = service.beginRepair(session, {
    projectId: project.id,
    screeningItemId: completed.items[0].id,
    issue: "移除多余纽扣",
    issueRegion: { x: 0.4, y: 0.3, width: 0.2, height: 0.3 },
    lockedRegions: [{ x: 0, y: 0, width: 1, height: 0.2 }],
    idempotencyKey: "recursive-service-1",
  });
  const episode = service.latestRepairEvolutionForProject(session, project.id)!;
  service.applyRepairPlannerDecision(session, attempt.id, {
    action: "ROUTE",
    routeId: "qwen-image-3-pro-edit",
    publicSummary: "商品核对完成，准备修正多余纽扣。",
    strategyRevision: null,
    evidenceFingerprints: episode.evidence.map((entry) => entry.fingerprint),
  }, ["qwen-image-3-pro-edit"]);
  const publicEvents = service.publicRepairEvolutionEventsForProject(session, project.id);
  assert.equal(publicEvents.length, 1);
  assert.equal(publicEvents[0].role_label, "任务协调");
  assert.equal(JSON.stringify(publicEvents).includes("internalCode"), false);
  assert.equal(JSON.stringify(publicEvents).includes("qwen-image-3-pro-edit"), false);
});

function testPngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(100);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  return bytes;
}
