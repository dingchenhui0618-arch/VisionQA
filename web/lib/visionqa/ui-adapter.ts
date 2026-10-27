import type {
  CommercialMetricId,
  EvaluationResultV03,
} from "./contracts";

export type UiDecision = "PASS" | "REVIEW" | "REJECT";

export type UiEvaluationPatch = {
  evaluationId: string;
  resultVersion: number;
  score: number | null;
  decision: UiDecision | null;
  skills: Array<{
    id: string;
    label: string;
    score: number | null;
    weight: string;
  }>;
  issues: Array<{
    id: string;
    title: string;
    skill: string;
    severity: "Blocker" | "Major" | "Minor";
    observation: string;
    impact: string;
    rule: string;
  }>;
  commercial: {
    templateId: string;
    templateVersion: string;
    templateName: string;
    fitScore: number | null;
    fitLevel: "高" | "中" | "低" | "未评估";
    summary: string;
    strengths: string[];
    gaps: string[];
    metrics: Array<{ id: string; label: string; score: number | null }>;
  };
  repairPrompt: string | null;
  lockedAttributes: string[];
  promptProvenance: string | null;
  calibrationStatus: "DEMO" | "UNCALIBRATED" | "CALIBRATED";
  modelStatus: string;
};

export type EvaluationApiEnvelope = {
  evaluation_id: string;
  result_version: number;
  result: EvaluationResultV03;
  overrides: unknown[];
  request_id: string;
};

const skillLabels = {
  human_realism: "真人真实性",
  photography_realism: "摄影真实性",
  material_realism: "材质真实性",
  commercial_value: "商品表达效能",
} as const;

const metricLabels: Record<CommercialMetricId, string> = {
  product_prominence: "商品主体识别",
  selling_point_clarity: "卖点表达",
  promotion_hierarchy: "促销信息层级",
  information_legibility: "关键信息可读",
  click_motivation: "点击动机",
  channel_placement_fit: "平台主图适配",
};

const skillCodes: Record<string, string> = {
  HUM: "真人真实性",
  PHO: "摄影真实性",
  MAT: "材质真实性",
  COM: "商品表达效能",
};

const issueLabels: Record<string, string> = {
  no_promotion_overlay: "缺少促销信息层",
  missing_promotion_overlay: "缺少促销信息层",
  garment_logo_visible: "服装 Logo 可见",
  fabric_texture_visible: "面料纹理可见",
};

function issueLabel(issueCode: string): string {
  return issueLabels[issueCode] ?? issueCode;
}

function severity(value: string): "Blocker" | "Major" | "Minor" {
  if (value === "blocker") return "Blocker";
  if (value === "major" || value === "information_insufficient") return "Major";
  return "Minor";
}

function fitLevel(value: string | null): "高" | "中" | "低" | "未评估" {
  if (value === "HIGH") return "高";
  if (value === "MEDIUM") return "中";
  if (value === "LOW") return "低";
  return "未评估";
}

export function adaptEvaluationEnvelope(
  envelope: EvaluationApiEnvelope,
): UiEvaluationPatch {
  const result = envelope.result;
  const commercial = result.score_evaluation.commercial_assessment;
  const prompt = result.action_plan.repair_prompt;

  return {
    evaluationId: envelope.evaluation_id,
    resultVersion: envelope.result_version,
    score: result.score_evaluation.overall_score,
    decision: result.gate_evaluation.decision,
    skills: Object.entries(result.score_evaluation.skill_scores).map(
      ([id, value], index) => ({
        id: String(index + 1).padStart(2, "0"),
        label: skillLabels[id as keyof typeof skillLabels],
        score: value.score,
        weight: `${Math.round(value.weight * 100)}%`,
      }),
    ),
    issues: result.model_evaluation.observations.map((observation, index) => ({
      id: String(index + 1).padStart(2, "0"),
      title: issueLabel(observation.issue_code),
      skill: observation.primary_skill
        ? skillCodes[observation.primary_skill]
        : "跨维度",
      severity: severity(observation.severity),
      observation: observation.observation,
      impact: observation.impact,
      rule: issueLabel(observation.issue_code),
    })),
    commercial: {
      templateId: commercial.template_id,
      templateVersion: commercial.template_version,
      templateName: commercial.template_id,
      fitScore: commercial.template_fit_score,
      fitLevel: fitLevel(commercial.fit_level),
      summary: commercial.summary,
      strengths: commercial.commercial_strengths,
      gaps: commercial.relative_gaps,
      metrics: Object.entries(commercial.metrics).map(([id, value]) => ({
        id,
        label: metricLabels[id as CommercialMetricId],
        score: value.score,
      })),
    },
    repairPrompt: prompt?.prompt ?? null,
    lockedAttributes: prompt?.locked_attributes ?? [],
    promptProvenance: prompt
      ? `${prompt.provenance.generator} · ${prompt.provenance.generator_version} · ${prompt.provenance.source}`
      : null,
    calibrationStatus: result.score_evaluation.calibration_status,
    modelStatus: result.model_evaluation.status,
  };
}
