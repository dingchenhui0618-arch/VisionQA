import assert from "node:assert/strict";
import test from "node:test";
import { planPresentation } from "../lib/agent/plan-presentation.ts";

test("only awaiting approval allows plan confirmation", () => {
  for (const status of ["STARTING", "NEEDS_INPUT", "UNSUPPORTED", "AWAITING_APPROVAL", "PROJECT_READY", "STOPPED", "SUPERSEDED", "FAILED"] as const) {
    assert.equal(planPresentation({ status, projectId: null }).canApprove, status === "AWAITING_APPROVAL");
  }
});
test("confirmed plan is not delivered imagery", () => {
  const view = planPresentation({ status: "PROJECT_READY", projectId: "p1" });
  assert.equal(view.label, "计划已确认");
  assert.match(view.next, /独立执行与复验/);
  assert.equal(view.canOpenWorkspace, true);
});
test("existing project is reused and missing project cannot open workspace", () => {
  assert.match(planPresentation({ status: "AWAITING_APPROVAL", projectId: "p1" }).next, /已有商品素材/);
  assert.equal(planPresentation({ status: "FAILED", projectId: null }).canOpenWorkspace, false);
  assert.match(planPresentation({ status: "AWAITING_APPROVAL", projectId: null }).next, /建立商品项目/);
});
