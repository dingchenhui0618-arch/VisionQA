import assert from "node:assert/strict";
import test from "node:test";
import { runRepairCollaboration } from "../lib/visionqa/agents/repair-orchestrator.ts";
import {
  createRepairProviderJob,
  QWEN_IMAGE_EDIT_MODEL_SNAPSHOT,
  QWEN_IMAGE_EDIT_PROVIDER_ID,
  updateRepairProviderJob,
} from "../lib/visionqa/repair-provider-contract.ts";

const baseInput = {
  caseId: "repair-case-1",
  sourceAssetId: 1,
  sourceName: "model-draft.jpg",
  sourceSha256: "a".repeat(64),
  referenceAssetCount: 1,
  diagnosisReady: true,
  issueCount: 2,
  repairPromptReady: true,
  lockedAttributeCount: 5,
  providerJob: null,
  repairOutputAvailable: false,
  humanChecksCompleted: 0,
  upscaleOutputAvailable: false,
};

test("repair collaboration fails closed before product truth", () => {
  const run = runRepairCollaboration({
    ...baseInput,
    referenceAssetCount: 0,
    diagnosisReady: false,
    repairPromptReady: false,
  });
  assert.equal(run.status, "NEEDS_PRODUCT_TRUTH");
  assert.equal(run.executionMode, "LOCAL_STATE_MACHINE_NO_MODEL");
  assert.equal(run.independentModelAgentsActive, false);
  assert.equal(run.agents[0].status, "BLOCKED");
  assert.equal(run.humanFinalReviewRequired, true);
});

test("repair collaboration never fills a missing diagnosis with demo output", () => {
  const run = runRepairCollaboration({
    ...baseInput,
    diagnosisReady: false,
    repairPromptReady: false,
  });
  assert.equal(run.status, "NEEDS_DIAGNOSIS");
  assert.equal(run.agents.find((agent) => agent.id === "repair-planner")?.status, "BLOCKED");
  assert.match(run.nextAction, /不使用示例/);
});

test("repair collaboration reaches delivery only after output and four human checks", () => {
  const created = createRepairProviderJob({
    sourceAssetId: 1,
    sourceSha256: "a".repeat(64),
    providerId: QWEN_IMAGE_EDIT_PROVIDER_ID,
    modelSnapshot: QWEN_IMAGE_EDIT_MODEL_SNAPSHOT,
    status: "READY",
    now: "2026-08-24T00:00:00.000Z",
    jobId: "repair-job-test",
  });
  const succeeded = updateRepairProviderJob(
    created,
    {
      status: "SUCCEEDED",
      outputSource: "QWEN_BAILIAN",
      providerRequestId: "request-1",
      externalNetworkUsed: true,
      modelInferenceUsed: true,
    },
    "2026-08-24T00:01:00.000Z",
  );
  const reviewed = runRepairCollaboration({
    ...baseInput,
    providerJob: succeeded,
    repairOutputAvailable: true,
    humanChecksCompleted: 4,
  });
  assert.equal(reviewed.status, "READY_FOR_DELIVERY");
  assert.equal(reviewed.agents.find((agent) => agent.id === "drift-verifier")?.status, "COMPLETED");

  const delivered = runRepairCollaboration({
    ...baseInput,
    providerJob: succeeded,
    repairOutputAvailable: true,
    humanChecksCompleted: 4,
    upscaleOutputAvailable: true,
  });
  assert.equal(delivered.status, "DELIVERED");
  assert.equal(delivered.agents.at(-1)?.status, "COMPLETED");
  assert.equal(delivered.handoffs.every((handoff) => handoff.ready), true);
});
