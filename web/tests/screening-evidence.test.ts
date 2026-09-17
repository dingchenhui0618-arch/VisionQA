import test from "node:test";
import assert from "node:assert/strict";
import { mapEvaluationToCustomerScreening } from "../lib/beta/screening.ts";

const observation = (extra: Record<string, unknown> = {}) => ({
  severity: "major", status: "detected", observation: "候选图存在商品细节差异", impact: "影响商品一致性", ...extra,
});
const envelope = (item: Record<string, unknown>) => ({ result: {
  model_evaluation: { status: "SUCCEEDED", observations: [item] },
  gate_evaluation: { decision: "REVIEW", decision_reason: "需处理" },
  action_plan: { repair_prompt: { prompt: "仅修复目标细节" } },
} });

test("strict screening rejects missing evidence and does not emit a repair prompt", () => {
  const result = mapEvaluationToCustomerScreening("candidate-1", envelope(observation()), { requireEvidence: true, referenceImageCount: 1 });
  assert.equal(result.decision, "NEEDS_MANUAL_CHECK");
  assert.equal(result.repairPrompt, null);
});

test("strict screening rejects reversed or invalid image indexes", () => {
  const result = mapEvaluationToCustomerScreening("candidate-1", envelope(observation({ candidateEvidence: "候选左侧一朵花", referenceEvidence: "真值前视一朵花", candidateImageIndex: 2, referenceImageIndex: 1 })), { requireEvidence: true, referenceImageCount: 1 });
  assert.equal(result.decision, "NEEDS_MANUAL_CHECK");
});

test("strict screening accepts explicit added and missing evidence with correct mapping", () => {
  const added = mapEvaluationToCustomerScreening("candidate-1", envelope(observation({ candidateEvidence: "候选图像左侧有额外花朵", referenceEvidence: "真值前视对应位置无该花朵", candidateImageIndex: 1, referenceImageIndex: 2, candidateCount: 2, referenceCount: 1, changeType: "ADDED" })), { requireEvidence: true, referenceImageCount: 1 });
  assert.equal(added.decision, "NEEDS_ATTENTION");
  assert.equal(added.repairPrompt, "仅修复目标细节");
  const missing = mapEvaluationToCustomerScreening("candidate-1", envelope(observation({ candidateEvidence: "候选图像少一枚纽扣", referenceEvidence: "真值图有六枚纽扣", candidateImageIndex: 1, referenceImageIndex: 2, candidateCount: 5, referenceCount: 6, changeType: "MISSING" })), { requireEvidence: true, referenceImageCount: 1 });
  assert.equal(missing.decision, "NEEDS_ATTENTION");
  const twoReferenceViews = mapEvaluationToCustomerScreening("candidate-1", envelope(observation({ candidateEvidence: "候选图有六枚纽扣", referenceEvidence: "第2张真值视图有五枚纽扣", candidateImageIndex: 1, referenceImageIndex: 3, candidateCount: 6, referenceCount: 5, changeType: "ADDED" })), { requireEvidence: true, referenceImageCount: 2 });
  assert.equal(twoReferenceViews.decision, "NEEDS_ATTENTION");
  const wrongDirection = mapEvaluationToCustomerScreening("candidate-1", envelope(observation({ candidateEvidence: "候选图有一枚", referenceEvidence: "真值图有两枚", candidateImageIndex: 1, referenceImageIndex: 2, candidateCount: 1, referenceCount: 2, changeType: "ADDED" })), { requireEvidence: true, referenceImageCount: 1 });
  assert.equal(wrongDirection.decision, "NEEDS_MANUAL_CHECK");
});

test("strict screening rejects suspected, contradictory counts, and invalid reference index", () => {
  for (const extra of [
    { status: "suspected", candidateEvidence: "候选可疑", referenceEvidence: "真值可疑", candidateImageIndex: 1, referenceImageIndex: 2 },
    { candidateEvidence: "候选证据", referenceEvidence: "真值证据", candidateImageIndex: 1, referenceImageIndex: 2, referenceCount: 2 },
    { candidateEvidence: "候选证据", referenceEvidence: "真值证据", candidateImageIndex: 1, referenceImageIndex: 3 },
  ]) {
    const result = mapEvaluationToCustomerScreening("candidate-1", envelope(observation(extra)), { requireEvidence: true, referenceImageCount: 1 });
    assert.equal(result.decision, "NEEDS_MANUAL_CHECK");
    assert.equal(result.repairPrompt, null);
  }
});

test("strict screening treats an empty observation list as unverified", () => {
  const result = mapEvaluationToCustomerScreening("candidate-1", { result: { model_evaluation: { status: "SUCCEEDED", observations: [] }, gate_evaluation: { decision: "PASS", decision_reason: "pass" } } }, { requireEvidence: true, referenceImageCount: 2 });
  assert.equal(result.decision, "NEEDS_MANUAL_CHECK");
});
