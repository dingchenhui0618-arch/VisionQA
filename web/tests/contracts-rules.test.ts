import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  COMMERCIAL_METRIC_WEIGHTS,
  validateEvaluationResultV03,
  type CommercialMetricId,
  type CommercialMetricScore,
  type ObservationV03,
} from "../lib/visionqa/contracts.ts";
import {
  calculateCommercialFit,
  calculateOverallScore,
  composeRepairPrompt,
  decideGate,
  deriveFitLevel,
} from "../lib/visionqa/rules.ts";

function metrics(score: number): Record<CommercialMetricId, CommercialMetricScore> {
  return Object.fromEntries(
    Object.entries(COMMERCIAL_METRIC_WEIGHTS).map(([id, weight]) => [
      id,
      { score, weight, assessability: "FULL", evidence: ["visible"], summary: "test" },
    ]),
  ) as Record<CommercialMetricId, CommercialMetricScore>;
}

const blocker: ObservationV03 = {
  observation_id: "obs-blocker",
  issue_code: "PF-01",
  primary_skill: "MAT",
  severity: "blocker",
  status: "detected",
  observation: "商品颜色与参考图冲突",
  impact: "商品事实错误",
};

test("commercial six-metric weights and fit bands are deterministic", () => {
  assert.deepEqual(calculateCommercialFit(metrics(90), "FULL"), {
    template_fit_score: 90,
    fit_level: "HIGH",
  });
  assert.equal(deriveFitLevel(89.9), "MEDIUM");
  assert.equal(deriveFitLevel(69.9), "LOW");
  assert.deepEqual(calculateCommercialFit(metrics(80), "NOT_APPLICABLE"), {
    template_fit_score: null,
    fit_level: null,
  });
});

test("commercial fit renormalizes metrics that are explicitly not applicable", () => {
  const placementMetrics = metrics(80);
  placementMetrics.product_prominence.score = 90;
  placementMetrics.promotion_hierarchy = {
    score: null,
    weight: COMMERCIAL_METRIC_WEIGHTS.promotion_hierarchy,
    assessability: "NOT_APPLICABLE",
    evidence: [],
    summary: "生活方式图不适用促销层级",
  };
  placementMetrics.information_legibility = {
    score: null,
    weight: COMMERCIAL_METRIC_WEIGHTS.information_legibility,
    assessability: "NOT_APPLICABLE",
    evidence: [],
    summary: "无叠加文案，不适用文字可读性",
  };
  assert.deepEqual(calculateCommercialFit(placementMetrics, "LIMITED"), {
    template_fit_score: 83.8,
    fit_level: "MEDIUM",
  });
});

test("overall score uses fixed four-Skill weights", () => {
  assert.equal(
    calculateOverallScore({
      human_realism: 100,
      photography_realism: 80,
      material_realism: 70,
      commercial_value: 60,
    }),
    76,
  );
  assert.equal(
    calculateOverallScore({
      human_realism: null,
      photography_realism: 80,
      material_realism: 70,
      commercial_value: 60,
    }),
    null,
  );
});

test("confirmed blocker cannot be hidden by a high score", () => {
  assert.equal(decideGate([blocker], 99).decision, "REJECT");
  assert.equal(decideGate([], 99).decision, "PASS");
});

test("repair prompt is complete, source-linked and does not invent product facts", () => {
  const prompt = composeRepairPrompt({
    observations: [blocker],
    lockedAttributes: ["颜色", "版型"],
    commercialGaps: [
      { metric_id: "promotion_hierarchy", action: "降低辅助优惠信息层级" },
    ],
  });
  assert.ok(prompt);
  assert.equal(prompt.strategy, "MANUAL_REVIEW");
  assert.deepEqual(prompt.repair_actions[0].source_observation_ids, ["obs-blocker"]);
  assert.equal(prompt.provenance.generator, "DETERMINISTIC_RULES");
  assert.match(prompt.prompt, /不得引入/);
});

test("runtime validator rejects fit drift and a non-reject blocker", () => {
  const value = {
    schema_version: "0.3.0",
    model_evaluation: { status: "SUCCEEDED", observations: [blocker] },
    score_evaluation: {
      status: "SUCCEEDED",
      calibration_status: "UNCALIBRATED",
      skill_scores: {},
      overall_score: 99,
      score_band: "PASS_CANDIDATE",
      commercial_assessment: {
        template_id: "platform_promotion_main_image",
        template_version: "0.2.0",
        assessment_scope: "test",
        assessability: "FULL",
        metrics: metrics(91),
        template_fit_score: 91,
        fit_level: "MEDIUM",
        commercial_strengths: [],
        relative_gaps: [],
        summary: "test",
      },
    },
    gate_evaluation: { decision: "PASS", decision_reason: "wrong" },
    action_plan: { repair_prompt: null, required_human_checks: [] },
  };
  const result = validateEvaluationResultV03(value);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("fit_level")));
  assert.ok(result.errors.some((error) => error.toLowerCase().includes("blocker")));
});

test("runtime validator accepts the versioned v0.3 example", () => {
  const example = JSON.parse(
    readFileSync(
      path.resolve(process.cwd(), "..", "contracts", "evaluation-result-v0.3.example.json"),
      "utf8",
    ),
  );
  const result = validateEvaluationResultV03(example);
  assert.deepEqual(result, { valid: true, errors: [] });
});
