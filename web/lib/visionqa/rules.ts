import {
  COMMERCIAL_METRIC_WEIGHTS,
  type Assessability,
  type CommercialAssessmentV03,
  type CommercialMetricId,
  type CommercialMetricScore,
  type Decision,
  type FitLevel,
  type ObservationV03,
  type RepairPromptV03,
} from "./contracts.ts";

const round1 = (value: number) => Math.round(value * 10) / 10;

export function deriveFitLevel(score: number | null): FitLevel | null {
  if (score === null) return null;
  if (score >= 90) return "HIGH";
  if (score >= 70) return "MEDIUM";
  return "LOW";
}

export function calculateCommercialFit(
  metrics: Record<CommercialMetricId, CommercialMetricScore>,
  assessability: Assessability,
): Pick<CommercialAssessmentV03, "template_fit_score" | "fit_level"> {
  if (assessability === "NOT_ASSESSABLE" || assessability === "NOT_APPLICABLE") {
    return { template_fit_score: null, fit_level: null };
  }

  let weighted = 0;
  let applicableWeight = 0;
  for (const [metricId, expectedWeight] of Object.entries(
    COMMERCIAL_METRIC_WEIGHTS,
  ) as Array<[CommercialMetricId, number]>) {
    const metric = metrics[metricId];
    if (!metric || metric.weight !== expectedWeight) {
      throw new Error(`Invalid or unscored commercial metric: ${metricId}`);
    }
    if (metric.score === null) {
      if (metric.assessability === "NOT_APPLICABLE") continue;
      throw new Error(`Invalid or unscored commercial metric: ${metricId}`);
    }
    weighted += metric.score * expectedWeight;
    applicableWeight += expectedWeight;
  }
  if (applicableWeight === 0) {
    return { template_fit_score: null, fit_level: null };
  }
  const template_fit_score = round1(weighted / applicableWeight);
  return { template_fit_score, fit_level: deriveFitLevel(template_fit_score) };
}

export function calculateOverallScore(scores: {
  human_realism: number | null;
  photography_realism: number | null;
  material_realism: number | null;
  commercial_value: number | null;
}): number | null {
  if (Object.values(scores).some((score) => score === null)) return null;
  return round1(
    scores.human_realism! * 0.25 +
      scores.photography_realism! * 0.2 +
      scores.material_realism! * 0.2 +
      scores.commercial_value! * 0.35,
  );
}

export function deriveScoreBand(score: number | null) {
  if (score === null) return null;
  if (score >= 90) return "PASS_CANDIDATE" as const;
  if (score >= 70) return "REVIEW_OPTIMIZE" as const;
  return "REJECT_REWORK" as const;
}

export function decideGate(
  observations: ObservationV03[],
  overallScore: number | null,
): { decision: Decision; decision_reason: string } {
  const blocker = observations.find(
    (item) => item.severity === "blocker" && item.status === "detected",
  );
  if (blocker) {
    return {
      decision: "REJECT",
      decision_reason: `确认的 Blocker ${blocker.issue_code} 覆盖分数结果。`,
    };
  }
  if (overallScore === null) {
    return { decision: "REVIEW", decision_reason: "评估不完整，必须人工复核。" };
  }
  if (overallScore >= 90) {
    return { decision: "PASS", decision_reason: "达到发布候选分数；MVP 仍需人工复核。" };
  }
  if (overallScore >= 70) {
    return { decision: "REVIEW", decision_reason: "位于优化复核区间。" };
  }
  return { decision: "REJECT", decision_reason: "低于返工阈值。" };
}

export function composeRepairPrompt(input: {
  observations: ObservationV03[];
  lockedAttributes: string[];
  commercialGaps?: Array<{ metric_id: CommercialMetricId; action: string }>;
  generatorVersion?: string;
}): RepairPromptV03 | null {
  const actionable = input.observations.filter(
    (item) => item.status === "detected" || item.status === "suspected",
  );
  const commercialGaps = input.commercialGaps ?? [];
  if (actionable.length === 0 && commercialGaps.length === 0) return null;

  const hasBlocker = actionable.some(
    (item) => item.severity === "blocker" && item.status === "detected",
  );
  const strategy = hasBlocker ? "MANUAL_REVIEW" : "LOCAL_EDIT";
  const repairActions = actionable.map((item) => ({
    action:
      item.status === "suspected"
        ? `先人工核验：${item.observation}`
        : `修复：${item.observation}`,
    source_observation_ids: [item.observation_id],
  }));
  const commercialActions = commercialGaps.map((gap) => ({
    action: gap.action,
    source_metric_ids: [gap.metric_id],
  }));
  const locked = [...new Set(input.lockedAttributes)];
  const negative = locked.map((attribute) => `不得改变锁定属性：${attribute}`);
  const promptParts = [
    strategy === "MANUAL_REVIEW"
      ? "存在已确认阻断问题，先人工核对商品事实，再决定局部重绘或重新生成。"
      : "仅对列出问题做局部修复。",
    ...repairActions.map((item) => item.action),
    ...commercialActions.map((item) => item.action),
    locked.length > 0 ? `保持不变：${locked.join("、")}。` : "",
    "不得引入未在证据中出现的新商品属性、文字、Logo 或配饰。",
  ].filter(Boolean);

  return {
    strategy,
    prompt: promptParts.join(" "),
    locked_attributes: locked,
    repair_actions: repairActions,
    commercial_actions: commercialActions,
    negative_constraints: [
      ...negative,
      "不得引入未在证据中出现的新商品属性、文字、Logo 或配饰。",
    ],
    related_observation_ids: actionable.map((item) => item.observation_id),
    provenance: {
      generator: "DETERMINISTIC_RULES",
      generator_version: input.generatorVersion ?? "repair-rules-0.3.0",
      source: "MODEL_OBSERVATIONS",
    },
  };
}
