import test from "node:test";
import assert from "node:assert/strict";
import { createVisualTaskWorkflow, preparePersistentVisualTask, taskInput } from "../lib/agent/task-workflow.ts";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

test("real Mastra snapshots resume across processes and replay completed output without side effects", () => {
  mkdirSync(path.resolve("work"), { recursive: true });
  const directory = mkdtempSync(path.resolve("work/mastra-restart-test-"));
  const moduleUrl = new URL("../lib/agent/task-workflow.ts", import.meta.url).href;
  const execute = (action: string, owner = "tenant:user", taskId = "revision-1", objective = "检查商品图") => {
    const script = `import { preparePersistentVisualTask } from ${JSON.stringify(moduleUrl)};
      import { appendFileSync } from 'node:fs';
      const task = await preparePersistentVisualTask(${JSON.stringify({ owner, taskId, objective, skuName: "灰色上衣" })},
        async () => { appendFileSync(${JSON.stringify(path.join(directory, "calls.txt"))}, 'call\\n'); return 'project-1'; },
        ${JSON.stringify(directory)});
      ${action === "prepare" ? "" : `console.log(JSON.stringify(await task.approve(${action === "approve"})));`}`;
    return spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], { encoding: "utf8", timeout: 30000 });
  };
  const first = execute("prepare");
  assert.equal(first.status, 0, first.stderr);
  assert.equal(readdirSync(directory).includes("calls.txt"), false);
  for (let i = 0; i < 2; i++) {
    const next = execute("approve");
    assert.equal(next.status, 0, next.stderr);
    assert.deepEqual(JSON.parse(next.stdout.trim()), { projectId: "project-1", stopped: false });
  }
  assert.equal(readFileSync(path.join(directory, "calls.txt"), "utf8"), "call\n");
  assert.notEqual(execute("approve", "tenant:user", "revision-1", "修改后的计划").status, 0);
  for (const [owner, revision] of [["other:user", "revision-1"], ["tenant:user", "revision-2"]]) {
    assert.equal(execute("prepare", owner, revision).status, 0);
    const stopped = execute("stop", owner, revision);
    assert.equal(stopped.status, 0, stopped.stderr);
    assert.deepEqual(JSON.parse(stopped.stdout.trim()), { projectId: null, stopped: true });
  }
  assert.equal(readFileSync(path.join(directory, "calls.txt"), "utf8"), "call\n");
});

test("task input rejects empty or oversized objectives", () => {
  assert.equal(taskInput.safeParse({ objective: " ", skuName: "SKU" }).success, false);
  assert.equal(taskInput.safeParse({ objective: "x".repeat(2001), skuName: "SKU" }).success, false);
});

test("failed persisted execution is not automatically retried", async () => {
  mkdirSync(path.resolve("work"), { recursive: true });
  const directory = mkdtempSync(path.resolve("work/mastra-failure-test-"));
  const input = { owner: "tenant:user", taskId: "failed-task", skuName: "SKU", objective: "检查" };
  let calls = 0;
  const create = async () => { calls++; throw new Error("simulated interruption"); };
  const task = await preparePersistentVisualTask(input, create, directory);
  await assert.rejects(task.approve(true), /did not complete/);
  await assert.rejects(preparePersistentVisualTask(input, create, directory), /manual recovery/);
  assert.equal(calls, 1);
});
test("Mastra suspends before side effects and executes approved tool", async () => {
  let calls = 0;
  const { workflow: flow } = await createVisualTaskWorkflow(async () => { calls++; return "project-1"; });
  const run = await flow.createRun();
  const paused = await run.start({ inputData: { objective: "检查商品图", skuName: "灰色上衣" } });
  assert.equal(paused.status, "suspended");
  assert.equal(calls, 0);
  const done = await run.resume({ step: "confirm-project", resumeData: { approved: true } });
  assert.equal(done.status, "success");
  if (done.status === "success") assert.deepEqual(done.result, { projectId: "project-1", stopped: false });
  assert.equal(calls, 1);
});
test("rejecting plan completes without a tool call", async () => {
  const { workflow: flow } = await createVisualTaskWorkflow(async () => { throw new Error("must not execute"); });
  const run = await flow.createRun();
  await run.start({ inputData: { objective: "检查", skuName: "SKU" } });
  const result = await run.resume({ step: "confirm-project", resumeData: { approved: false } });
  assert.equal(result.status, "success");
  if (result.status === "success") assert.equal(result.result.stopped, true);
});
