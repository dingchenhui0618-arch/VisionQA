import {
  COMMERCIAL_METRIC_WEIGHTS,
  validateEvaluationResultV03,
  type CommercialMetricId,
  type CommercialMetricScore,
  type EvaluationResultV03,
} from "../contracts.ts";
import {
  calculateCommercialFit,
  calculateOverallScore,
  composeRepairPrompt,
  decideGate,
  deriveScoreBand,
} from "../rules.ts";
import {
  VisionProviderError,
  evaluateWithRetry,
  type ProviderEvaluationInput,
  type ProviderObservationDraft,
  type RetryOptions,
  type VisionProviderAdapter,
} from "./types.ts";

const SKILL_WEIGHTS = {
  human_realism: 0.25,
  photography_realism: 0.2,
  material_realism: 0.2,
  commercial_value: 0.35,
} as const;

function hasEvidence(score: number | null, evidence: string[]): boolean {
  return score === null || evidence.some((item) => item.trim().length > 0);
}

function toResult(
  draft: ProviderObservationDraft,
  input: ProviderEvaluationInput,
): EvaluationResultV03 {
  const visualArtifactReview =
    input.reviewMode === "web_page" ||
    input.commercialTemplate.id === "web_visual_review" ||
    ["visual_baseline", "plugin_visual_review"].includes(input.commercialTemplate.id);
  const promotionRequired =
    input.commercialTemplate.id === "platform_promotion_main_image";
  const observed = promotionRequired
    ? draft.observations
    : draft.observations.filter(
        (observation) =>
          !["no_promotion_overlay", "missing_promotion_overlay"].includes(
            observation.issue_code,
          ),
      );
  // The screenshot is the candidate in web-page mode. Keep a legacy model
  // signal for auditability, but never let its missing-reference wording
  // become a confirmed visual blocker.
  const observations = visualArtifactReview
    ? observed.map((observation) =>
        ["missing_candidate_image", "missing_reference_image"].includes(
          observation.issue_code,
        )
          ? {
              ...observation,
              issue_code: "web_target_scope",
              severity: "information_insufficient" as const,
              status: "not_assessable" as const,
              observation:
                "已收到网页截图，但模型未能确认本次要评审的具体界面范围。",
              impact:
                "无法把当前观察可靠归因到页面问题，需要人工确认评审区域或目标。",
              candidateEvidence:
                observation.candidateEvidence || "当前网页截图已作为 image 1 提供。",
              referenceEvidence: undefined,
              referenceImageIndex: undefined,
            }
          : observation,
      )
    : observed;
  const missingPromotionObservation = observations.find(
    (observation) =>
      observation.status === "detected" &&
      ["no_promotion_overlay", "missing_promotion_overlay"].includes(
        observation.issue_code,
      ),
  );
  const platformPromotionMissingRequiredLayer = Boolean(
    promotionRequired && missingPromotionObservation,
  );
  const commercialAssessability = visualArtifactReview
    ? "NOT_APPLICABLE"
    : platformPromotionMissingRequiredLayer
    ? "LIMITED"
    : draft.commercialAssessment.assessability;

  const metrics = Object.fromEntries(
    (
      Object.entries(COMMERCIAL_METRIC_WEIGHTS) as Array<
        [CommercialMetricId, number]
      >
    ).map(([metricId, weight]) => {
      const source = draft.commercialAssessment.metrics?.[metricId];
      if (visualArtifactReview) {
        return [
          metricId,
          {
            score: null,
            weight,
            assessability: "NOT_APPLICABLE",
            evidence: [],
            summary: "通用视觉模式不使用商品或促销商业评分。",
          },
        ];
      }
      const requiredMissingMetric =
        platformPromotionMissingRequiredLayer &&
        ["promotion_hierarchy", "information_legibility"].includes(metricId) &&
        source?.score == null;
      if (requiredMissingMetric) {
        return [
          metricId,
          {
            score: 0,
            weight,
            assessability: "LIMITED",
            evidence: [missingPromotionObservation!.observation],
            summary:
              metricId === "promotion_hierarchy"
                ? "平台促销主图缺少必要促销信息层，促销层级记为 0 分。"
                : "平台促销主图缺少必要商业信息，信息可读性记为 0 分。",
          },
        ];
      }
      const evidence = (source?.evidence ?? []).filter((item) => item.trim());
      const score =
        source && hasEvidence(source.score, evidence) ? source.score : null;
      return [
        metricId,
        {
          score,
          weight,
          assessability: source?.assessability ?? "NOT_ASSESSABLE",
          evidence,
          summary: source?.summary?.trim() || "证据不足，需人工复核。",
        },
      ];
    }),
  ) as Record<CommercialMetricId, CommercialMetricScore>;

  const commercialEvidenceComplete = (
    Object.keys(COMMERCIAL_METRIC_WEIGHTS) as CommercialMetricId[]
  ).every((metricId) => {
    const metric = metrics[metricId];
    return (
      metric.assessability === "NOT_APPLICABLE" ||
      (typeof metric.score === "number" && hasEvidence(metric.score, metric.evidence))
    );
  });

  let commercialFit: { template_fit_score: number | null; fit_level: "HIGH" | "MEDIUM" | "LOW" | null } = {
    template_fit_score: null,
    fit_level: null,
  };
  if (
    !visualArtifactReview &&
    commercialEvidenceComplete &&
    commercialAssessability !== "NOT_ASSESSABLE" &&
    commercialAssessability !== "NOT_APPLICABLE"
  ) {
    try {
      commercialFit = calculateCommercialFit(
        metrics,
        commercialAssessability,
      );
    } catch {
      commercialFit = { template_fit_score: null, fit_level: null };
    }
  }

  const objectiveSkills = visualArtifactReview
    ? {
        human_realism: {
          score: null,
          assessability: "NOT_APPLICABLE" as const,
          evidence: [] as string[],
        summary: "通用视觉模式不使用人物真实性评分。",
        },
        photography_realism: {
          score: null,
          assessability: "NOT_APPLICABLE" as const,
          evidence: [] as string[],
          summary: "通用视觉模式不使用摄影真实性评分。",
        },
        material_realism: {
          score: null,
          assessability: "NOT_APPLICABLE" as const,
          evidence: [] as string[],
          summary: "通用视觉模式不使用材质真实性评分。",
        },
      }
    : {
        human_realism: draft.skillAssessments.human_realism,
        photography_realism: draft.skillAssessments.photography_realism,
        material_realism: draft.skillAssessments.material_realism,
      };
  const skillScores = {
    human_realism: {
      score: hasEvidence(
        objectiveSkills.human_realism.score,
        objectiveSkills.human_realism.evidence ?? [],
      )
        ? objectiveSkills.human_realism.score
        : null,
      weight: SKILL_WEIGHTS.human_realism,
      assessability: objectiveSkills.human_realism.assessability,
    },
    photography_realism: {
      score: hasEvidence(
        objectiveSkills.photography_realism.score,
        objectiveSkills.photography_realism.evidence ?? [],
      )
        ? objectiveSkills.photography_realism.score
        : null,
      weight: SKILL_WEIGHTS.photography_realism,
      assessability: objectiveSkills.photography_realism.assessability,
    },
    material_realism: {
      score: hasEvidence(
        objectiveSkills.material_realism.score,
        objectiveSkills.material_realism.evidence ?? [],
      )
        ? objectiveSkills.material_realism.score
        : null,
      weight: SKILL_WEIGHTS.material_realism,
      assessability: objectiveSkills.material_realism.assessability,
    },
    commercial_value: {
      score: commercialFit.template_fit_score,
      weight: SKILL_WEIGHTS.commercial_value,
      assessability: commercialAssessability,
    },
  };
  const overallScore = calculateOverallScore({
    human_realism: skillScores.human_realism.score,
    photography_realism: skillScores.photography_realism.score,
    material_realism: skillScores.material_realism.score,
    commercial_value: skillScores.commercial_value.score,
  });
  const gate = decideGate(observations, overallScore);
  const commercialGaps = (
    Object.keys(COMMERCIAL_METRIC_WEIGHTS) as CommercialMetricId[]
  )
    .filter((metricId) => {
      const score = metrics[metricId].score;
      return typeof score === "number" && score < 70;
    })
    .map((metricId) => ({
      metric_id: metricId,
      action: `针对 ${metricId} 的现有证据进行优化，需人工确认具体修改。`,
    }));
  const repairPrompt = composeRepairPrompt({
    observations,
    lockedAttributes: input.lockedAttributes,
    commercialGaps,
  });

  const evidenceIncomplete =
    !commercialEvidenceComplete ||
    Object.values(objectiveSkills).some(
      (skill) => !hasEvidence(skill.score, skill.evidence ?? []),
    );
  const result: EvaluationResultV03 = {
    schema_version: "0.3.0",
    model_evaluation: {
      status: "SUCCEEDED",
      observations,
    },
    score_evaluation: {
      status: evidenceIncomplete || overallScore === null ? "PARTIAL" : "SUCCEEDED",
      calibration_status: "UNCALIBRATED",
      skill_scores: skillScores,
      overall_score: overallScore,
      score_band: deriveScoreBand(overallScore),
      commercial_assessment: {
        template_id: input.commercialTemplate.id,
        template_version: input.commercialTemplate.version,
        assessment_scope: input.commercialTemplate.assessmentScope,
        assessability: commercialAssessability,
        metrics,
        ...commercialFit,
        commercial_strengths: visualArtifactReview ? [] : draft.commercialAssessment.strengths,
        relative_gaps: visualArtifactReview ? [] : draft.commercialAssessment.gaps,
        summary: visualArtifactReview
          ? "通用视觉模式不使用商品或促销评分，视觉结论以 observations 为准。"
          : draft.commercialAssessment.summary,
      },
    },
    gate_evaluation: gate,
    action_plan: {
      repair_prompt: repairPrompt,
      required_human_checks: [
        ...draft.requiredHumanChecks,
        ...(evidenceIncomplete ? ["模型证据不完整，必须人工复核。"] : []),
      ],
    },
  };

  const validation = validateEvaluationResultV03(result);
  if (!validation.valid) {
    throw new VisionProviderError(
      "INVALID_OUTPUT",
      `Derived v0.3 result failed runtime validation: ${validation.errors.join("; ")}`,
    );
  }
  return result;
}

export interface VisionEvaluationOutcome {
  result: EvaluationResultV03;
  provider: {
    providerId: string;
    adapterVersion: string;
    modelSnapshot: string;
    providerRequestId: string | null;
    latencyMs: number;
    usage: { inputTokens: number | null; outputTokens: number | null };
    warnings: string[];
  };
}

export async function orchestrateVisionEvaluation(
  adapter: VisionProviderAdapter,
  input: ProviderEvaluationInput,
  signal: AbortSignal,
  retryOptions?: RetryOptions,
): Promise<VisionEvaluationOutcome> {
  const envelope = await evaluateWithRetry(
    adapter,
    input,
    signal,
    retryOptions,
  );
  return {
    result: toResult(envelope.observationDraft, input),
    provider: {
      providerId: envelope.providerId,
      adapterVersion: envelope.adapterVersion,
      modelSnapshot: envelope.modelSnapshot,
      providerRequestId: envelope.providerRequestId,
      latencyMs: envelope.latencyMs,
      usage: envelope.usage,
      warnings: envelope.warnings,
    },
  };
}
