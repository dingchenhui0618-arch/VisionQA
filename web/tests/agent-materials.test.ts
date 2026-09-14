import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BetaService } from "../lib/beta/service.ts";
import { fileProblem, materialPayload, selectionProblem, type Material } from "../lib/agent/material-client.ts";
import { lockedOutside, regionProblem } from "../lib/agent/repair-client.ts";

const asset = (id: string, role: Material["role"]): Material => ({ id, role, fileName: `${id}.png`, byteSize: 4, width: 64, height: 64 });
test("repair regions stay in bounds and real outside locks cover the remaining area", () => {
  const region = { x: 0.2, y: 0.3, width: 0.4, height: 0.2 };
  assert.equal(regionProblem(region), null);
  assert.ok(Math.abs(lockedOutside(region).reduce((n, r) => n + r.width * r.height, 0) + region.width * region.height - 1) < 1e-9);
  assert.ok(regionProblem({ ...region, width: 2 }));
  assert.ok(regionProblem({ x: 0, y: 0, width: 1, height: 1 }));
  assert.ok(regionProblem({ ...region, x: NaN }));
});
test("theme, version-bound human review and no filename-based repair stand-ins remain explicit", () => {
  const ui = readFileSync(new URL("../app/agent/workspace.tsx", import.meta.url), "utf8");
  const repair = readFileSync(new URL("../app/agent/repair-panel.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/repair-attempts/route.ts", import.meta.url), "utf8");
  assert.match(ui, /localStorage.setItem\("visionqa-agent-theme"/);
  assert.match(ui, /aria-label="切换黑白主题"/);
  assert.match(repair, /checkedVersion === version.id/);
  assert.match(repair, /!fullyReviewed/);
  assert.match(repair, /source_asset_id: sourceId/);
  assert.equal(route.includes("loadExampleRepair"), false);
  assert.match(route, /getRepairReferenceBatch/);
});
test("multi-round repairs use an explicit historical source, keep original references and charge each accepted output once", async () => {
  const service = new BetaService();
  const { session } = await service.consumeInvite("visionqa-local-beta");
  const p = service.createProject(session, "version fixture");
  const bytes = new Uint8Array([1, 2, 3, 4]); // storage/ledger fixture only, not image quality
  const add = async (role: "TRUTH" | "CANDIDATE") => {
    const a = service.createUploadIntent(session, { projectId: p.id, role, fileName: "fixture.png", mimeType: "image/png", width: 64, height: 64, byteSize: 4 });
    await service.putAsset(session, a.id, bytes); return a.id;
  };
  const truth = await add("TRUTH"), original = await add("CANDIDATE");
  const batch = service.createScreeningBatch(session, { projectId: p.id, skuName: "fixture", truthAssetIds: [truth], candidateAssetIds: [original] });
  const region = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };
  const complete = service.completeScreeningBatch(session, batch.id, [{ assetId: original, decision: "NEEDS_ATTENTION", primaryIssue: "fixture", visibleEvidence: "synthetic", repairPrompt: null, issueRegion: region }]);
  const input = { projectId: p.id, screeningItemId: complete.items[0].id, sourceAssetId: original, issue: "first", issueRegion: region, lockedRegions: lockedOutside(region), idempotencyKey: "first" };
  const first = service.beginRepair(session, input);
  assert.equal(service.beginRepair(session, input).id, first.id);
  assert.throws(() => service.beginRepair(session, { ...input, issue: "different" }), /不一致/);
  assert.throws(() => service.beginRepair(session, { ...input, idempotencyKey: "parallel" }), /进行中/);
  const output = await service.createOutputAsset(session, { projectId: p.id, sourceFileName: "fixture.png", mimeType: "image/png", bytes, width: 64, height: 64 });
  service.captureRepair(session, first.id, output.id);
  service.captureRepair(session, first.id, output.id);
  const nextBatch = service.createScreeningBatch(session, { projectId: p.id, skuName: "new batch", truthAssetIds: [truth], candidateAssetIds: [original] });
  service.failScreeningBatch(session, nextBatch.id);
  const second = service.beginRepair(session, { ...input, issue: "second", sourceAssetId: output.id, idempotencyKey: "second" });
  assert.equal(second.sourceAssetId, output.id);
  assert.equal(service.getRepairReferenceBatch(session, second.id).id, batch.id);
  service.releaseRepair(session, second.id, "fixture failure");
  const unaccepted = await service.createOutputAsset(session, { projectId: p.id, sourceFileName: "fixture.png", mimeType: "image/png", bytes, width: 64, height: 64 });
  assert.throws(() => service.beginRepair(session, { ...input, sourceAssetId: unaccepted.id, idempotencyKey: "invalid" }), /母版/);
  assert.equal(service.listProjectRepairs(session, p.id).length, 2);
  assert.equal(service.getCredits(session).available, 4);
  assert.equal(service.getCredits(session).held, 0);
  assert.equal(service.getCredits(session).captured, 1);
});
test("customer screening never substitutes filename-based fixture diagnoses", () => {
  const route = readFileSync(new URL("../app/api/screening-batches/route.ts", import.meta.url), "utf8");
  assert.equal(route.includes("exampleScreeningResult"), false);
  assert.match(route, /await runLiveEvaluation/);
});
test("material selection explains missing truth, missing candidate and 4/10 limits", () => {
  assert.match(selectionProblem([], [])!, /参考图/);
  assert.match(selectionProblem([asset("t", "TRUTH")], ["t"])!, /待|检查/);
  const valid = [asset("t", "TRUTH"), ...Array.from({ length: 10 }, (_, i) => asset(`c${i}`, "CANDIDATE"))];
  assert.equal(selectionProblem(valid, valid.map(a => a.id)), null);
  const over = [...valid, asset("extra", "CANDIDATE")];
  assert.match(selectionProblem(over, over.map(a => a.id))!, /最多选择 10/);
  const truths = [...valid, ...Array.from({ length: 4 }, (_, i) => asset(`t${i}`, "TRUTH"))];
  assert.match(selectionProblem(truths, truths.map(a => a.id))!, /最多选择 4/);
});
test("upload guidance includes exact file and size; rejects unsupported formats and empty files", () => {
  assert.equal(fileProblem({ name: "a.png", type: "image/png", size: 10 * 1024 * 1024 }), null);
  assert.match(fileProblem({ name: "large.png", type: "image/png", size: 11 * 1024 * 1024 })!, /large.png（11.00 MB）/);
  assert.ok(fileProblem({ name: "empty.png", type: "image/png", size: 0 }));
  assert.ok(fileProblem({ name: "a.svg", type: "image/svg+xml", size: 100 }));
});
test("transport failures never expose raw HTTP or provider text", async () => {
  await assert.rejects(materialPayload(new Response("upstream token secret", { status: 413 })), /请刷新/);
  await assert.rejects(materialPayload(Response.json({ error: { message: "文件过大", next_action: "请压缩" } }, { status: 413 })), /文件过大 请压缩/);
});
test("ready material listing is project scoped, excludes private paths and pending assets; running batches cannot duplicate", async () => {
  const service = new BetaService();
  const { session } = await service.consumeInvite("visionqa-local-beta");
  const other = (await service.consumeInvite("visionqa-local-beta")).session;
  const p = service.createProject(session, "one"), q = service.createProject(session, "two");
  const add = async (projectId: string, role: "TRUTH" | "CANDIDATE", ready = true) => {
    const result = service.createUploadIntent(session, { projectId, role, fileName: "fixture.png", mimeType: "image/png", width: 64, height: 64, byteSize: 4 });
    if (ready) await service.putAsset(session, result.id, new Uint8Array([1, 2, 3, 4]));
    return result.id;
  };
  const truth = await add(p.id, "TRUTH"), candidate = await add(p.id, "CANDIDATE"), foreign = await add(q.id, "CANDIDATE");
  await add(p.id, "TRUTH", false);
  const list = service.listProjectAssets(session, p.id);
  assert.equal(list.length, 2);
  assert.equal(JSON.stringify(list).includes("objectKey"), false);
  assert.throws(() => service.listProjectAssets(other, p.id));
  assert.throws(() => service.createScreeningBatch(session, { projectId: p.id, skuName: "one", truthAssetIds: [truth], candidateAssetIds: [foreign] }), /不属于/);
  const input = { projectId: p.id, skuName: "one", truthAssetIds: [truth], candidateAssetIds: [candidate] };
  const batch = service.createScreeningBatch(session, input);
  assert.throws(() => service.createScreeningBatch(session, input), /正在进行/);
  service.failScreeningBatch(session, batch.id);
  assert.doesNotThrow(() => service.createScreeningBatch(session, input));
  service.deleteProject(session, p.id);
  assert.throws(() => service.listProjectAssets(session, p.id));
});
