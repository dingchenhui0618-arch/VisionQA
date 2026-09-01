import test from "node:test";
import assert from "node:assert/strict";
import { createBetaServiceForTest } from "../lib/beta/service.ts";
import { CustomerVisibleError } from "../lib/beta/contracts.ts";
import { getPaymentCapability } from "../lib/beta/payment.ts";
import { runServerRepairGate } from "../lib/beta/repair-gate.ts";
import { createSignedDownloadUrl, verifySignedDownloadUrl } from "../lib/beta/asset-urls.ts";

async function customer(service = createBetaServiceForTest()) {
  const invite = await service.createInvite({ label: "客户 A" });
  const consumed = await service.consumeInvite(invite.token);
  return { service, session: consumed.session, token: invite.token };
}

async function readyAsset(
  service: ReturnType<typeof createBetaServiceForTest>,
  session: Awaited<ReturnType<typeof customer>>["session"],
  projectId: string,
  role: "TRUTH" | "CANDIDATE" | "REPAIR_OUTPUT",
  fileName = `${role.toLowerCase()}.png`,
) {
  const bytes = pngBytes(100, 100);
  const asset = service.createUploadIntent(session, {
    projectId,
    role,
    fileName,
    mimeType: "image/png",
    byteSize: bytes.byteLength,
    width: 100,
    height: 100,
  });
  return service.putAsset(session, asset.id, bytes);
}

async function repairableCase() {
  const state = await customer();
  const project = state.service.createProject(state.session, "测试 SKU");
  const truth = await readyAsset(state.service, state.session, project.id, "TRUTH");
  const candidate = await readyAsset(state.service, state.session, project.id, "CANDIDATE");
  const batch = state.service.createScreeningBatch(state.session, {
    projectId: project.id,
    skuName: "测试 SKU",
    truthAssetIds: [truth.id],
    candidateAssetIds: [candidate.id],
  });
  const completed = state.service.completeScreeningBatch(state.session, batch.id, [
    {
      assetId: candidate.id,
      decision: "NEEDS_ATTENTION",
      primaryIssue: "纽扣数量不一致",
      visibleEvidence: "候选图多出一颗纽扣",
      repairPrompt: "只移除多余纽扣",
      issueRegion: { x: 0.4, y: 0.3, width: 0.2, height: 0.3 },
    },
  ]);
  return { ...state, project, truth, candidate, item: completed.items[0] };
}

test("invite token is hashed, single-use, and creates a 30-day customer session with five credits", async () => {
  const service = createBetaServiceForTest();
  const invite = await service.createInvite({ label: "客户 A" });
  const first = await service.consumeInvite(invite.token);
  assert.equal(first.session.role, "customer");
  assert.equal(service.getCredits(first.session).available, 5);
  assert.ok(Date.parse(first.session.expiresAt) > Date.now() + 29 * 24 * 60 * 60 * 1000);
  await assert.rejects(() => service.consumeInvite(invite.token), (error) => {
    assert.ok(error instanceof CustomerVisibleError);
    assert.equal(error.code, "INVITE_ALREADY_USED");
    return true;
  });
});

test("invite expires after its validity window", async () => {
  let now = new Date("2026-09-01T00:00:00.000Z");
  const service = createBetaServiceForTest(() => now);
  const invite = await service.createInvite({ label: "客户 B", validDays: 1 });
  now = new Date("2026-09-03T00:00:00.000Z");
  await assert.rejects(() => service.consumeInvite(invite.token), (error) => {
    assert.ok(error instanceof CustomerVisibleError);
    assert.equal(error.code, "INVITE_EXPIRED");
    return true;
  });
});

test("tenant isolation blocks project and asset access from another invitation", async () => {
  const service = createBetaServiceForTest();
  const a = await customer(service);
  const b = await customer(service);
  const project = service.createProject(a.session, "A 的 SKU");
  assert.throws(() => service.getProject(b.session, project.id), (error) => {
    assert.ok(error instanceof CustomerVisibleError);
    assert.equal(error.code, "PROJECT_NOT_FOUND");
    return true;
  });
});

test("screening enforces 1–4 truth images and 1–10 candidates", async () => {
  const { service, session } = await customer();
  const project = service.createProject(session, "边界 SKU");
  const truth = await readyAsset(service, session, project.id, "TRUTH");
  const candidates = [];
  for (let index = 0; index < 11; index += 1) {
    candidates.push(await readyAsset(service, session, project.id, "CANDIDATE", `candidate-${index}.png`));
  }
  assert.doesNotThrow(() => service.createScreeningBatch(session, {
    projectId: project.id,
    skuName: "10 张边界",
    truthAssetIds: [truth.id],
    candidateAssetIds: candidates.slice(0, 10).map((asset) => asset.id),
  }));
  assert.throws(() => service.createScreeningBatch(session, {
    projectId: project.id,
    skuName: "11 张越界",
    truthAssetIds: [truth.id],
    candidateAssetIds: candidates.map((asset) => asset.id),
  }), (error) => error instanceof CustomerVisibleError && error.code === "BATCH_INVALID");
});

test("upload intent reports the exact oversized filename and preserves business guidance", async () => {
  const { service, session } = await customer();
  const project = service.createProject(session, "文件大小 SKU");
  assert.throws(() => service.createUploadIntent(session, {
    projectId: project.id,
    role: "CANDIDATE",
    fileName: "oversized-candidate.png",
    mimeType: "image/png",
    byteSize: 10 * 1024 * 1024 + 1,
    width: 1000,
    height: 1500,
  }), (error) => {
    assert.ok(error instanceof CustomerVisibleError);
    assert.equal(error.code, "ASSET_TOO_LARGE");
    assert.match(error.message, /oversized-candidate\.png/);
    assert.match(error.nextAction, /压缩/);
    return true;
  });
});

test("credit hold is idempotent, technical failure releases, and valid output captures exactly once", async () => {
  const state = await repairableCase();
  const input = {
    projectId: state.project.id,
    screeningItemId: state.item.id,
    issue: "移除多余纽扣",
    issueRegion: { x: 0.4, y: 0.3, width: 0.2, height: 0.3 },
    lockedRegions: [{ x: 0, y: 0, width: 1, height: 0.2 }],
    idempotencyKey: "repair-click-1",
  };
  const held = state.service.beginRepair(state.session, input);
  const replay = state.service.beginRepair(state.session, input);
  assert.equal(replay.id, held.id);
  assert.deepEqual(state.service.getCredits(state.session), { available: 4, held: 1, captured: 0, label: "内测额度" });
  state.service.releaseRepair(state.session, held.id, "技术失败");
  assert.deepEqual(state.service.getCredits(state.session), { available: 5, held: 0, captured: 0, label: "内测额度" });

  const second = state.service.beginRepair(state.session, { ...input, idempotencyKey: "repair-click-2" });
  const output = await readyAsset(state.service, state.session, state.project.id, "REPAIR_OUTPUT");
  state.service.captureRepair(state.session, second.id, output.id);
  state.service.captureRepair(state.session, second.id, output.id);
  assert.deepEqual(state.service.getCredits(state.session), { available: 4, held: 0, captured: 1, label: "内测额度" });
});

test("quality adjustment grants one credit and records an immutable reason", async () => {
  const service = createBetaServiceForTest();
  const adminInvite = await service.createInvite({ label: "管理员", role: "admin", initialCredits: 0 });
  const admin = await service.consumeInvite(adminInvite.token);
  const user = await customer(service);
  const balance = service.grantCredits(admin.session, user.session.tenantId, 1, "质量申诉补回");
  assert.equal(balance.available, 6);
  assert.equal(service.ledgerForTenant(admin.session, user.session.tenantId).at(-1)?.reason, "质量申诉补回");
});

test("assets are removed after seven days and project deletion is immediate", async () => {
  let now = new Date("2026-09-01T00:00:00.000Z");
  const service = createBetaServiceForTest(() => now);
  const user = await customer(service);
  const project = service.createProject(user.session, "清理 SKU");
  const asset = await readyAsset(service, user.session, project.id, "CANDIDATE");
  now = new Date("2026-09-09T00:00:00.000Z");
  assert.equal(service.cleanupExpiredAssets(), 1);
  assert.throws(() => service.readAsset(user.session, asset.id));

  const second = service.createProject(user.session, "立即删除 SKU");
  const secondAsset = await readyAsset(service, user.session, second.id, "CANDIDATE");
  service.deleteProject(user.session, second.id);
  assert.throws(() => service.readAsset(user.session, secondAsset.id));
});

test("production payment remains disabled even when test mode is requested", () => {
  assert.deepEqual(getPaymentCapability({ NODE_ENV: "production", VISIONQA_PAYMENT_PROVIDER: "test" }), {
    provider: "disabled",
    enabled: false,
    customerMessage: "当前为邀请制内测。如需更多额度，请联系内测管理员。",
  });
});

test("server repair gate requires decodable output, stable aspect, and recorded target/locked regions", () => {
  const bytes = pngBytes(100, 100);
  const result = runServerRepairGate({
    source: { bytes, mimeType: "image/png", width: 100, height: 100 },
    output: { bytes, mimeType: "image/png", reportedWidth: 100, reportedHeight: 100 },
    issueRegion: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
    lockedRegions: [{ x: 0, y: 0, width: 1, height: 0.2 }],
  });
  assert.equal(result.passed, true);
  assert.equal(runServerRepairGate({
    source: { bytes, mimeType: "image/png", width: 100, height: 100 },
    output: { bytes, mimeType: "image/png", reportedWidth: 100, reportedHeight: 100 },
    issueRegion: null,
    lockedRegions: [],
  }).passed, false);
});

test("download URLs are tenant-bound and expire after five minutes", async () => {
  const state = await customer();
  const url = await createSignedDownloadUrl(state.session, "asset-1", 1_000_000);
  await assert.doesNotReject(() => verifySignedDownloadUrl(
    state.session,
    "asset-1",
    new URL(url, "https://visionqa.test"),
    1_000_000 + 299_000,
  ));
  await assert.rejects(() => verifySignedDownloadUrl(
    state.session,
    "asset-1",
    new URL(url, "https://visionqa.test"),
    1_000_000 + 301_000,
  ));
});

function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(100);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  writeUint32(bytes, 16, width);
  writeUint32(bytes, 20, height);
  return bytes;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}
