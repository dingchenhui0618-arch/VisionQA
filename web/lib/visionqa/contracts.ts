export const COMMERCIAL_METRIC_WEIGHTS = {
  product_prominence: 0.25,
  selling_point_clarity: 0.2,
  promotion_hierarchy: 0.2,
  information_legibility: 0.15,
  click_motivation: 0.1,
  channel_placement_fit: 0.1,
} as const;

export type CommercialMetricId = keyof typeof COMMERCIAL_METRIC_WEIGHTS;
export type Assessability =
  | "FULL"
  | "LIMITED"
  | "NOT_ASSESSABLE"
  | "NOT_APPLICABLE";
export type FitLevel = "HIGH" | "MEDIUM" | "LOW";
export type Decision = "PASS" | "REVIEW" | "REJECT";

export interface CommercialMetricScore {
  score: number | null;
  weight: number;
  assessability: Assessability;
  evidence: string[];
  summary: string;
}

export interface CommercialAssessmentV03 {
  template_id: string;
  template_version: string;
  assessment_scope: string;
  assessability: Assessability;
  metrics: Record<CommercialMetricId, CommercialMetricScore>;
  template_fit_score: number | null;
  fit_level: FitLevel | null;
  commercial_strengths: string[];
  relative_gaps: string[];
  summary: string;
}

export interface ObservationV03 {
  observation_id: string;
  issue_code: string;
  primary_skill: "HUM" | "PHO" | "MAT" | "COM" | null;
  severity: "blocker" | "major" | "minor" | "information_insufficient";
  status: "detected" | "suspected" | "not_assessable";
  observation: string;
  impact: string;
  candidateEvidence?: string;
  referenceEvidence?: string;
  candidateImageIndex?: number;
  referenceImageIndex?: number;
  candidateCount?: number;
  referenceCount?: number;
  changeType?: "ADDED" | "MISSING" | "CHANGED";
}

export interface RepairPromptV03 {
  strategy: "LOCAL_EDIT" | "REGENERATE" | "MANUAL_REVIEW";
  prompt: string;
  locked_attributes: string[];
  repair_actions: Array<{
    action: string;
    source_observation_ids: string[];
  }>;
  commercial_actions: Array<{
    action: string;
    source_metric_ids: CommercialMetricId[];
  }>;
  negative_constraints: string[];
  related_observation_ids: string[];
  provenance: {
    generator: "DETERMINISTIC_RULES" | "MODEL_ASSISTED";
    generator_version: string;
    source: "MODEL_OBSERVATIONS" | "HUMAN_OVERRIDE" | "MIXED";
  };
}

export interface EvaluationResultV03 {
  schema_version: "0.3.0";
  model_evaluation: {
    status:
      | "SUCCEEDED"
      | "NOT_RUN"
      | "INSUFFICIENT_INPUT"
      | "UNREADABLE_ASSET"
      | "PROVIDER_ERROR"
      | "TIMEOUT"
      | "INVALID_OUTPUT";
    observations: ObservationV03[];
  };
  score_evaluation: {
    status: "SUCCEEDED" | "PARTIAL" | "NOT_RUN" | "INVALID_OBSERVATIONS";
    calibration_status: "DEMO" | "UNCALIBRATED" | "CALIBRATED";
    skill_scores: Record<
      "human_realism" | "photography_realism" | "material_realism" | "commercial_value",
      { score: number | null; weight: number; assessability: Assessability }
    >;
    overall_score: number | null;
    score_band: "PASS_CANDIDATE" | "REVIEW_OPTIMIZE" | "REJECT_REWORK" | null;
    commercial_assessment: CommercialAssessmentV03;
  };
  gate_evaluation: {
    decision: Decision | null;
    decision_reason: string;
  };
  action_plan: {
    repair_prompt: RepairPromptV03 | null;
    required_human_checks: string[];
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const isScore = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
const nearlyEqual = (left: number, right: number) => Math.abs(left - right) < 0.051;

export function validateEvaluationResultV03(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!value || typeof value !== "object") {
    return { valid: false, errors: ["result must be an object"] };
  }

  const result = value as Partial<EvaluationResultV03>;
  if (result.schema_version !== "0.3.0") errors.push("schema_version must be 0.3.0");

  const commercial = result.score_evaluation?.commercial_assessment;
  if (!commercial) {
    errors.push("score_evaluation.commercial_assessment is required");
  } else {
    let expectedCommercialScore = 0;
    let applicableCommercialWeight = 0;
    let canCalculateCommercialScore = true;
    for (const [metricId, expectedWeight] of Object.entries(
      COMMERCIAL_METRIC_WEIGHTS,
    ) as Array<[CommercialMetricId, number]>) {
      const metric = commercial.metrics?.[metricId];
      if (!metric) {
        errors.push(`commercial metric ${metricId} is required`);
        continue;
      }
      if (metric.weight !== expectedWeight) {
        errors.push(`${metricId}.weight must be ${expectedWeight}`);
      }
      if (metric.score !== null && !isScore(metric.score)) {
        errors.push(`${metricId}.score must be null or between 0 and 100`);
      }
      if (typeof metric.score === "number") {
        expectedCommercialScore += metric.score * expectedWeight;
        applicableCommercialWeight += expectedWeight;
      } else if (metric.assessability !== "NOT_APPLICABLE") {
        canCalculateCommercialScore = false;
      }
      if (!metric.summary?.trim()) errors.push(`${metricId}.summary is required`);
      if (!Array.isArray(metric.evidence)) errors.push(`${metricId}.evidence must be an array`);
    }

    const expectedLevel =
      commercial.template_fit_score === null
        ? null
        : commercial.template_fit_score >= 90
          ? "HIGH"
          : commercial.template_fit_score >= 70
            ? "MEDIUM"
            : "LOW";
    if (
      commercial.template_fit_score !== null &&
      !isScore(commercial.template_fit_score)
    ) {
      errors.push("template_fit_score must be null or between 0 and 100");
    }
    if (commercial.fit_level !== expectedLevel) {
      errors.push("fit_level must be derived from template_fit_score");
    }
    if (
      canCalculateCommercialScore &&
      applicableCommercialWeight > 0 &&
      commercial.template_fit_score !== null &&
      !nearlyEqual(
        commercial.template_fit_score,
        expectedCommercialScore / applicableCommercialWeight,
      )
    ) {
      errors.push("template_fit_score must be derived from the six fixed-weight metrics");
    }
    if (
      canCalculateCommercialScore &&
      applicableCommercialWeight > 0 &&
      !["NOT_ASSESSABLE", "NOT_APPLICABLE"].includes(commercial.assessability) &&
      commercial.template_fit_score === null
    ) {
      errors.push("template_fit_score is required when applicable commercial metrics are complete");
    }
    if (
      ["NOT_ASSESSABLE", "NOT_APPLICABLE"].includes(commercial.assessability) &&
      (commercial.template_fit_score !== null || commercial.fit_level !== null)
    ) {
      errors.push("non-assessable commercial results cannot carry a score or fit_level");
    }
  }

  const skills = result.score_evaluation?.skill_scores;
  const skillWeights = {
    human_realism: 0.25,
    photography_realism: 0.2,
    material_realism: 0.2,
    commercial_value: 0.35,
  } as const;
  if (skills) {
    let expectedOverall = 0;
    let canCalculateOverall = true;
    for (const [skillId, expectedWeight] of Object.entries(skillWeights) as Array<
      [keyof typeof skillWeights, number]
    >) {
      const skill = skills[skillId];
      if (!skill) {
        errors.push(`skill score ${skillId} is required`);
        canCalculateOverall = false;
        continue;
      }
      if (skill.weight !== expectedWeight) errors.push(`${skillId}.weight must be ${expectedWeight}`);
      if (typeof skill.score === "number") expectedOverall += skill.score * expectedWeight;
      else canCalculateOverall = false;
    }
    const overall = result.score_evaluation?.overall_score;
    if (canCalculateOverall && typeof overall === "number" && !nearlyEqual(overall, expectedOverall)) {
      errors.push("overall_score must be derived from the four fixed-weight Skill scores");
    }
    const expectedBand =
      overall === null || overall === undefined
        ? null
        : overall >= 90
          ? "PASS_CANDIDATE"
          : overall >= 70
            ? "REVIEW_OPTIMIZE"
            : "REJECT_REWORK";
    if (result.score_evaluation?.score_band !== expectedBand) {
      errors.push("score_band must be derived from overall_score");
    }
  }

  const repairPrompt = result.action_plan?.repair_prompt;
  if (repairPrompt) {
    if (!repairPrompt.prompt?.trim()) errors.push("repair_prompt.prompt is required");
    if (!repairPrompt.provenance?.generator_version?.trim()) {
      errors.push("repair_prompt.provenance.generator_version is required");
    }
    if (!repairPrompt.provenance?.source) {
      errors.push("repair_prompt.provenance.source is required");
    }
    for (const action of repairPrompt.repair_actions ?? []) {
      if (!action.action?.trim() || action.source_observation_ids.length === 0) {
        errors.push("each repair action must identify its source observation");
      }
    }
    for (const action of repairPrompt.commercial_actions ?? []) {
      if (!action.action?.trim() || action.source_metric_ids.length === 0) {
        errors.push("each commercial action must identify its source metric");
      }
    }
    if (!Array.isArray(repairPrompt.locked_attributes)) {
      errors.push("repair_prompt.locked_attributes must be an array");
    }
    if (!Array.isArray(repairPrompt.negative_constraints)) {
      errors.push("repair_prompt.negative_constraints must be an array");
    }
  }

  const hasConfirmedBlocker = Boolean(
    result.model_evaluation?.observations?.some(
      (item) => item.severity === "blocker" && item.status === "detected",
    ),
  );
  if (hasConfirmedBlocker && result.gate_evaluation?.decision !== "REJECT") {
    errors.push("confirmed blocker must force gate decision REJECT");
  } else if (!hasConfirmedBlocker && result.score_evaluation) {
    const score = result.score_evaluation.overall_score;
    const expectedDecision =
      score === null ? "REVIEW" : score >= 90 ? "PASS" : score >= 70 ? "REVIEW" : "REJECT";
    if (result.gate_evaluation?.decision !== expectedDecision) {
      errors.push("gate decision must follow deterministic threshold policy");
    }
  }

  return { valid: errors.length === 0, errors };
}
