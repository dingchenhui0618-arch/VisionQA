import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseVisionQaApiError } from "../lib/visionqa/api-error.ts";
import { adaptEvaluationEnvelope } from "../lib/visionqa/ui-adapter.ts";
import type { EvaluationResultV03 } from "../lib/visionqa/contracts.ts";

test("v0.3 API envelope maps to one coherent UI evaluation", async () => {
  const result = JSON.parse(
    await readFile(
      new URL(
        "../../contracts/evaluation-result-v0.3.example.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as EvaluationResultV03;

  const ui = adaptEvaluationEnvelope({
    evaluation_id: "eval-demo-001",
    result_version: 3,
    result,
    overrides: [],
    request_id: "req-demo-001",
  });

  assert.equal(ui.evaluationId, "eval-demo-001");
  assert.equal(ui.resultVersion, 3);
  assert.equal(ui.score, 81);
  assert.equal(ui.decision, "REVIEW");
  assert.equal(ui.skills.length, 4);
  assert.equal(ui.skills[3].label, "商品表达效能");
  assert.equal(ui.commercial.fitScore, 80.9);
  assert.equal(ui.commercial.metrics.length, 6);
  assert.match(ui.repairPrompt || "", /袖口/);
  assert.match(ui.promptProvenance || "", /DETERMINISTIC_RULES/);
});

test("unassessed v0.3 fields remain null instead of becoming demo scores", () => {
  const result = {
    schema_version: "0.3.0",
    model_evaluation: { status: "NOT_RUN", observations: [] },
    score_evaluation: {
      status: "NOT_RUN",
      calibration_status: "UNCALIBRATED",
      skill_scores: {
        human_realism: { score: null, weight: 0.25, assessability: "NOT_ASSESSABLE" },
        photography_realism: { score: null, weight: 0.2, assessability: "NOT_ASSESSABLE" },
        material_realism: { score: null, weight: 0.2, assessability: "NOT_ASSESSABLE" },
        commercial_value: { score: null, weight: 0.35, assessability: "NOT_ASSESSABLE" },
      },
      overall_score: null,
      score_band: null,
      commercial_assessment: {
        template_id: "platform_promotion_main_image",
        template_version: "0.2.0",
        assessment_scope: "输入不可评估",
        assessability: "NOT_ASSESSABLE",
        metrics: {
          product_prominence: { score: null, weight: 0.25, assessability: "NOT_ASSESSABLE", evidence: [], summary: "未评估" },
          selling_point_clarity: { score: null, weight: 0.2, assessability: "NOT_ASSESSABLE", evidence: [], summary: "未评估" },
          promotion_hierarchy: { score: null, weight: 0.2, assessability: "NOT_ASSESSABLE", evidence: [], summary: "未评估" },
          information_legibility: { score: null, weight: 0.15, assessability: "NOT_ASSESSABLE", evidence: [], summary: "未评估" },
          click_motivation: { score: null, weight: 0.1, assessability: "NOT_ASSESSABLE", evidence: [], summary: "未评估" },
          channel_placement_fit: { score: null, weight: 0.1, assessability: "NOT_ASSESSABLE", evidence: [], summary: "未评估" },
        },
        template_fit_score: null,
        fit_level: null,
        commercial_strengths: [],
        relative_gaps: [],
        summary: "不可评估",
      },
    },
    gate_evaluation: { decision: null, decision_reason: "输入不可评估" },
    action_plan: { repair_prompt: null, required_human_checks: [] },
  } as EvaluationResultV03;

  const ui = adaptEvaluationEnvelope({
    evaluation_id: "eval-unassessed",
    result_version: 1,
    result,
    overrides: [],
    request_id: "req-unassessed",
  });

  assert.equal(ui.score, null);
  assert.equal(ui.decision, null);
  assert.equal(ui.commercial.fitScore, null);
  assert.equal(ui.repairPrompt, null);
  assert.ok(ui.skills.every((skill) => skill.score === null));
});

test("known live issue codes are rendered with Chinese business labels", async () => {
  const result = JSON.parse(
    await readFile(
      new URL(
        "../../contracts/evaluation-result-v0.3.example.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as EvaluationResultV03;
  result.model_evaluation.observations[0].issue_code = "no_promotion_overlay";

  const ui = adaptEvaluationEnvelope({
    evaluation_id: "eval-localized",
    result_version: 1,
    result,
    overrides: [],
    request_id: "req-localized",
  });

  assert.equal(ui.issues[0].title, "缺少促销信息层");
  assert.equal(ui.issues[0].rule, "缺少促销信息层");
});
test("API errors retain the local request id and timeout evidence", async () => {
  const error = await parseVisionQaApiError(
    Response.json(
      {
        error: {
          code: "LIVE_MODEL_TIMEOUT",
          message: "模型响应超时。",
          request_id: "request-timeout-001",
          retryable: true,
          details: {
            phase: "PROVIDER_WAIT",
            timeout_ms: 180_000,
            product_conclusion_formed: false,
          },
        },
      },
      { status: 504 },
    ),
  );

  assert.equal(error.code, "LIVE_MODEL_TIMEOUT");
  assert.equal(error.requestId, "request-timeout-001");
  assert.deepEqual(error.details, {
    phase: "PROVIDER_WAIT",
    timeout_ms: 180_000,
    product_conclusion_formed: false,
  });
});
