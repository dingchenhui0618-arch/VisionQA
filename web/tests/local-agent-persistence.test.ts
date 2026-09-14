import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { localStateStore } from "../lib/beta/local-state.ts";
import { createPersistentBetaService } from "../lib/beta/service.ts";
import { TaskSessions } from "../lib/agent/task-session.ts";

const directory = () => {
  mkdirSync(path.resolve("work"), { recursive: true });
  return mkdtempSync(path.resolve("work/persistence-test-"));
};
const plan = { decision: "READY" as const, summary: "检查图片", question: "", preserve: ["纽扣"], changes: ["检查图案"] };

test("budget reservations survive process restart and stop at the call limit without network", () => {
  const dir = directory();
  const moduleUrl = new URL("../lib/beta/budget.ts", import.meta.url).href;
  const script = `import {authorizeModelDispatch,getBudgetState} from ${JSON.stringify(moduleUrl)};
    for(let i=0;i<15;i++){const reservation=authorizeModelDispatch(50,{});reservation.record();reservation.record();}
    process.stdout.write(JSON.stringify(getBudgetState('prelaunch')));`;
  const options = { cwd: dir, env: { ...process.env, VISIONQA_AGENT_LOCAL: "true", NODE_ENV: "test" }, encoding: "utf8" as const };
  for (const calls of [15, 30]) {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], options);
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), { calls, spentMinor: calls * 50 });
  }
  const stopped = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `import {authorizeModelDispatch} from ${JSON.stringify(moduleUrl)}; import assert from 'node:assert/strict'; assert.throws(()=>authorizeModelDispatch(50,{}), /安全上限/); assert.throws(()=>authorizeModelDispatch(-1,{}), /Invalid/);`], options);
  assert.equal(stopped.status, 0);
});

test("disk storage restores bytes", () => {
  const dir = directory(); const store = localStateStore("bytes", dir);
  store.save({ image: new Uint8Array([1, 2, 255]) });
  assert.deepEqual(localStateStore("bytes", dir).load(), { image: new Uint8Array([1, 2, 255]) });
  assert.equal(readFileSync(path.join(dir, "bytes.json"), "utf8").includes("base64"), true);
});

test("two independent Node processes restore the same account and project without exposing a raw cookie", () => {
  const dir = directory();
  const moduleUrl = new URL("../lib/beta/service.ts", import.meta.url).href;
  const storeUrl = new URL("../lib/beta/local-state.ts", import.meta.url).href;
  const setup = `import {createPersistentBetaService} from ${JSON.stringify(moduleUrl)}; import {localStateStore} from ${JSON.stringify(storeUrl)}; import {readFileSync} from 'node:fs'; const data=JSON.parse(readFileSync(0,'utf8')); const service=createPersistentBetaService(localStateStore('beta',data.dir));`;
  const first = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", setup + `const login=await service.consumeInvite('visionqa-local-beta'); const project=service.createProjectForConversation(login.session,'test SKU','thread'); process.stdout.write(JSON.stringify({token:login.sessionToken,projectId:project.id}));`], { input: JSON.stringify({ dir }), encoding: "utf8" });
  assert.equal(first.status, 0);
  const saved = JSON.parse(first.stdout);
  const second = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", setup + `const session=await service.resolveSession(data.token); const project=service.createProjectForConversation(session,'test SKU','thread'); process.stdout.write(JSON.stringify({projectId:project.id,count:service.listProjects(session).length}));`], { input: JSON.stringify({ dir, token: saved.token }), encoding: "utf8" });
  assert.equal(second.status, 0);
  assert.deepEqual(JSON.parse(second.stdout), { projectId: saved.projectId, count: 1 });
});

test("invalid snapshots fail closed instead of resetting accounts", () => {
  assert.throws(() => createPersistentBetaService({ load: () => ({ version: 999 }), save: () => { throw new Error("must not overwrite"); } }), /Incompatible/);
  assert.throws(() => new TaskSessions({ load: () => ({ version: 999 }), save: () => { throw new Error("must not overwrite"); } }), /Invalid/);
});

test("account cookie, project identity, wallet and tenant isolation survive service reconstruction", async () => {
  const dir = directory();
  const service = createPersistentBetaService(localStateStore("beta", dir));
  const login = await service.consumeInvite("visionqa-local-beta");
  const project = service.createProjectForConversation(login.session, "灰色开衫", "conversation-a");
  const before = service.getCredits(login.session);
  const restored = createPersistentBetaService(localStateStore("beta", dir));
  const session = await restored.resolveSession(login.sessionToken);
  assert.ok(session);
  assert.equal(session.userId, login.session.userId);
  assert.equal(restored.createProjectForConversation(session, "灰色开衫", "conversation-a").id, project.id);
  assert.equal(restored.listProjects(session).length, 1);
  assert.deepEqual(restored.getCredits(session), before);
  const other = await restored.consumeInvite("visionqa-local-beta");
  assert.throws(() => restored.getProject(other.session, project.id));
  const raw = readFileSync(path.join(dir, "beta.json"), "utf8");
  assert.equal(raw.includes(login.sessionToken), false);
});

test("conversation reload restores a pending plan without model dispatch, approval stays idempotent", async () => {
  const dir = directory(); const store = localStateStore("conversations", dir);
  let models = 0, projects = 0;
  const deps = { plan: async () => { models++; return plan; }, prepare: async () => ({ approve: async (approved: boolean) => { if (approved) projects++; return { projectId: approved ? "project-one" : null, stopped: !approved }; } }) };
  const first = new TaskSessions(store);
  await first.create("tenant:user", { id: "conversation-one", objective: "检查图片", skuName: "开衫" }, deps);
  const second = new TaskSessions(localStateStore("conversations", dir));
  assert.equal(second.list("tenant:user")[0].status, "AWAITING_APPROVAL");
  assert.deepEqual(second.list("tenant:other"), []);
  await second.act("tenant:user", "conversation-one", "approve", deps.prepare);
  const third = new TaskSessions(localStateStore("conversations", dir));
  await third.act("tenant:user", "conversation-one", "approve", deps.prepare);
  assert.equal(third.list("tenant:user")[0].projectId, "project-one");
  assert.equal(models, 1); assert.equal(projects, 1);
});

test("interrupted model work reloads as recoverable failure, never retries automatically", async () => {
  const dir = directory(); const first = new TaskSessions(localStateStore("conversations", dir));
  let finish!: (value: typeof plan) => void;
  const pending = first.create("u", { id: "interrupted-task", objective: "检查", skuName: "开衫" }, {
    plan: () => new Promise(resolve => { finish = resolve; }),
    prepare: async () => ({ approve: async () => ({ projectId: null, stopped: true }) }),
  });
  const restored = new TaskSessions(localStateStore("conversations", dir));
  assert.equal(restored.list("u")[0].status, "FAILED");
  assert.match(restored.list("u")[0].error!, /不会自动/);
  finish(plan); await pending;
});

test("asset bytes and interrupted repair hold survive disk reload; recovery releases exactly once", async () => {
  const dir = directory(); const service = createPersistentBetaService(localStateStore("beta", dir));
  const { session } = await service.consumeInvite("visionqa-local-beta");
  const project = service.createProject(session, "fixture SKU");
  // Synthetic bytes test storage only, not image decoding or visual quality.
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const add = async (role: "TRUTH" | "CANDIDATE") => {
    const asset = service.createUploadIntent(session, { projectId: project.id, role, fileName: "fixture.png", mimeType: "image/png", byteSize: bytes.length, width: 100, height: 100 });
    return service.putAsset(session, asset.id, bytes);
  };
  const truth = await add("TRUTH"), candidate = await add("CANDIDATE");
  const batch = service.createScreeningBatch(session, { projectId: project.id, skuName: "fixture SKU", truthAssetIds: [truth.id], candidateAssetIds: [candidate.id] });
  const completed = service.completeScreeningBatch(session, batch.id, [{ assetId: candidate.id, decision: "NEEDS_ATTENTION", primaryIssue: "fixture issue", visibleEvidence: "fixture only", repairPrompt: "fix", issueRegion: { x: 0, y: 0, width: 0.2, height: 0.2 } }]);
  const attempt = service.beginRepair(session, { projectId: project.id, screeningItemId: completed.items[0].id, issue: "fixture issue", issueRegion: { x: 0, y: 0, width: 0.2, height: 0.2 }, lockedRegions: [{ x: 0.5, y: 0.5, width: 0.2, height: 0.2 }], idempotencyKey: "persistent-attempt" });
  service.markRepairRunning(session, attempt.id);
  assert.equal(service.getCredits(session).held, 1);
  const restored = createPersistentBetaService(localStateStore("beta", dir));
  assert.deepEqual(restored.readAsset(session, truth.id).bytes, bytes);
  assert.equal(restored.getRepairAttempt(session, attempt.id).status, "RELEASED");
  assert.equal(restored.getCredits(session).available, 5);
  assert.equal(restored.getCredits(session).held, 0);
  const again = createPersistentBetaService(localStateStore("beta", dir));
  assert.equal(again.ledgerForTenant(session).filter(entry => entry.type === "RELEASE").length, 1);
  again.deleteProject(session, project.id);
  const deleted = createPersistentBetaService(localStateStore("beta", dir));
  assert.throws(() => deleted.readAsset(session, truth.id));
});
