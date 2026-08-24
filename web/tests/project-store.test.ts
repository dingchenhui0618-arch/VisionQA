import assert from "node:assert/strict";
import test from "node:test";
import {
  createProjectRecord,
  inferProjectEventAction,
  isVisionQaProjectRecord,
  summarizeProjectEvent,
  VISIONQA_PROJECT_SCHEMA_VERSION,
  type VisionQaProjectMaterialCounts,
} from "../lib/visionqa/project-store.ts";

const emptyCounts: VisionQaProjectMaterialCounts = {
  references: 0,
  candidates: 0,
  completedEvaluations: 0,
  humanReviews: 0,
};

test("creates a versioned local project with a stable business boundary", () => {
  const project = createProjectRecord({
    projectId: "project-test-1",
    projectName: "测试服饰项目",
    stage: "overview",
    payload: { schemaVersion: "visionqa-workspace-project-payload-v0.1" },
    materialCounts: emptyCounts,
    now: "2026-08-24T00:00:00.000Z",
  });

  assert.equal(project.schemaVersion, VISIONQA_PROJECT_SCHEMA_VERSION);
  assert.equal(project.projectId, "project-test-1");
  assert.equal(project.scenario, "fashion_ecommerce_ai_model_image");
  assert.equal(project.storageMode, "LOCAL_INDEXED_DB");
  assert.equal(project.revision, 1);
  assert.equal(project.createdAt, project.updatedAt);
  assert.equal(isVisionQaProjectRecord(project), true);
});
test("rejects unsupported or incomplete project records", () => {
  assert.equal(
    isVisionQaProjectRecord({
      schemaVersion: VISIONQA_PROJECT_SCHEMA_VERSION,
      projectId: "project-test-1",
      projectName: "测试服饰项目",
      scenario: "fashion_ecommerce_ai_model_image",
      storageMode: "LOCAL_INDEXED_DB",
      revision: 0,
      stage: "overview",
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
      materialCounts: emptyCounts,
    }),
    false,
  );
  assert.equal(
    isVisionQaProjectRecord({
      schemaVersion: "visionqa-project-v9",
      revision: 1,
    }),
    false,
  );
});

test("classifies stage, material, and content revisions for the audit trail", () => {
  assert.equal(
    inferProjectEventAction(
      { stage: "overview", materialCounts: emptyCounts },
      { stage: "baseline", materialCounts: emptyCounts },
    ),
    "STAGE_CHANGED",
  );
  assert.equal(
    inferProjectEventAction(
      { stage: "baseline", materialCounts: emptyCounts },
      {
        stage: "baseline",
        materialCounts: { ...emptyCounts, references: 2 },
      },
    ),
    "MATERIALS_UPDATED",
  );
  assert.equal(
    inferProjectEventAction(
      { stage: "baseline", materialCounts: emptyCounts },
      { stage: "baseline", materialCounts: emptyCounts },
    ),
    "PROJECT_UPDATED",
  );
  assert.match(
    summarizeProjectEvent(
      "MATERIALS_UPDATED",
      "intake",
      { ...emptyCounts, references: 1, candidates: 3 },
    ),
    /基准 1，候选 3/,
  );
});
