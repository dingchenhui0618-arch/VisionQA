import test from "node:test";
import assert from "node:assert/strict";
import { createVisualTaskWorkflow, taskInput } from "../lib/agent/task-workflow.ts";

test("task input rejects empty or oversized objectives", () => {
  assert.equal(taskInput.safeParse({ objective: " ", skuName: "SKU" }).success, false);
  assert.equal(taskInput.safeParse({ objective: "x".repeat(2001), skuName: "SKU" }).success, false);
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
