import assert from "node:assert/strict";
import test from "node:test";

import {
  appendLocalFeedback,
  candidateTraceId,
  fixtureIndexFromSha256,
  LOCAL_EVALUATION_MODE,
  sha256Blob,
  validateLocalCandidate,
  type LocalFeedbackRecord,
} from "../lib/visionqa/local-mvp.ts";
import { applyContextGate } from "../lib/visionqa/context-gate.ts";

test("local candidate validation accepts supported images and rejects unsafe inputs", () => {
  assert.deepEqual(
    validateLocalCandidate({
      name: "candidate.JPG",
      type: "image/jpeg",
      size: 1024,
    }),
    { ok: true },
  );
  assert.equal(
    validateLocalCandidate({
      name: "notes.txt",
      type: "text/plain",
      size: 1024,
    }).ok,
    false,
  );
  assert.equal(
    validateLocalCandidate({
      name: "empty.png",
      type: "image/png",
      size: 0,
    }).ok,
    false,
  );
  assert.equal(
    validateLocalCandidate({
      name: "large.webp",
      type: "image/webp",
      size: 20 * 1024 * 1024 + 1,
    }).ok,
    false,
  );
});

test("local candidate hashing and fixture selection are deterministic", async () => {
  const sha256 = await sha256Blob(new Blob(["visionqa-local-candidate"]));
  assert.equal(
    sha256,
    "88e004175f2fc5a7bd7d163b45e39a7361859aa5cfa97a4cbb9a11d3fc75fb56",
  );
  assert.equal(candidateTraceId(sha256), "local_88e004175f2fc5a7");
  assert.equal(fixtureIndexFromSha256(sha256, 12), 3);
  assert.equal(fixtureIndexFromSha256(sha256, 12), 3);
});

test("local feedback retains traceability and is bounded", () => {
  const record: LocalFeedbackRecord = {
    schemaVersion: "visionqa-local-feedback-v1",
    id: "feedback-1",
    candidateTraceId: "local_dd290f61e5ab9b51",
    candidateSha256:
      "dd290f61e5ab9b51df51ad3f42ef0f3caa67009a5694ea9e92b014bb17925e41",
    candidateName: "candidate.jpg",
    evaluationMode: LOCAL_EVALUATION_MODE,
    fixtureCaseId: "fixture-002",
    originalDecision: "PASS",
    humanDecision: "REVIEW",
    reasonCode: "SEVERITY_WRONG",
    evidenceNote: "人工发现需要复核的材质问题。",
    overallScore: 94,
    commercialTemplateId: "platform-promo",
    commercialFitScore: 97,
    createdAt: "2026-07-30T08:00:00.000Z",
    storage: "local",
  };
  const result = appendLocalFeedback([{ id: "older" }], record, 1);
  assert.deepEqual(result, [record]);
  assert.equal(result[0].evaluationMode, "FIXTURE_REPLAY_NO_MODEL");
});

test("missing submission context forces REVIEW with a null score", () => {
  const result = {
    score_evaluation: {
      status: "SUCCEEDED",
      overall_score: 94,
      score_band: "PASS_CANDIDATE",
      skill_scores: {},
      commercial_assessment: {},
    },
    gate_evaluation: {
      decision: "PASS",
      decision_reason: "fixture",
    },
    action_plan: {
      repair_prompt: null,
      required_human_checks: [],
    },
  } as never;

  const gated = applyContextGate(result, ["SKU/参考声明"]);
  assert.equal(gated.score_evaluation.status, "PARTIAL");
  assert.equal(gated.score_evaluation.overall_score, null);
  assert.equal(gated.score_evaluation.score_band, null);
  assert.equal(gated.gate_evaluation.decision, "REVIEW");
  assert.match(gated.gate_evaluation.decision_reason, /上下文不完整/);
  assert.ok(
    gated.action_plan.required_human_checks.some((item) =>
      item.includes("SKU/参考声明"),
    ),
  );
});

test("missing context never weakens an existing REJECT decision", () => {
  const result = {
    score_evaluation: {
      status: "SUCCEEDED",
      overall_score: 42,
      score_band: "REJECT_REWORK",
      skill_scores: {},
      commercial_assessment: {},
    },
    gate_evaluation: {
      decision: "REJECT",
      decision_reason: "confirmed blocker",
    },
    action_plan: {
      repair_prompt: null,
      required_human_checks: [],
    },
  } as never;

  const gated = applyContextGate(result, ["SKU/参考声明"]);
  assert.equal(gated.score_evaluation.overall_score, null);
  assert.equal(gated.gate_evaluation.decision, "REJECT");
  assert.match(gated.gate_evaluation.decision_reason, /不得因此弱化拒绝结论/);
});
