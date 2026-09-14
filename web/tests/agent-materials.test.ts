import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BetaService } from "../lib/beta/service.ts";
import { fileProblem, materialPayload, selectionProblem, type Material } from "../lib/agent/material-client.ts";

const asset = (id: string, role: Material["role"]): Material => ({ id, role, fileName: `${id}.png`, byteSize: 4, width: 64, height: 64 });
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
