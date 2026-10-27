import {
  COMMERCIAL_METRIC_WEIGHTS,
  type CommercialMetricId,
} from "../contracts.ts";
import type {
  ProviderCommercialMetricDraft,
  ProviderEvaluationInput,
  ProviderObservationDraft,
  ProviderObservationEnvelope,
  VisionProviderAdapter,
} from "./types.ts";

const metric = (
  score: number,
  summary: string,
): ProviderCommercialMetricDraft => ({
  score,
  assessability: "FULL",
  evidence: [`fixture evidence: ${summary}`],
  summary,
});

export function createFixtureDraft(): ProviderObservationDraft {
  const scores: Record<CommercialMetricId, ProviderCommercialMetricDraft> = {
    product_prominence: metric(86, "商品主体清晰且占据主要视觉面积。"),
    selling_point_clarity: metric(82, "服装版型与核心视觉卖点可辨认。"),
    promotion_hierarchy: metric(76, "主次促销信息存在但层级仍可收敛。"),
    information_legibility: metric(80, "主要信息可读，辅助信息需移动端复核。"),
    click_motivation: metric(79, "具备基础点击动机。"),
    channel_placement_fit: metric(78, "基本符合平台促销主图图位。"),
  };

  // Compile-time assertion that fixture coverage follows the versioned metric set.
  void COMMERCIAL_METRIC_WEIGHTS;
  return {
    observations: [
      {
        observation_id: "obs-fixture-001",
        issue_code: "CC-03",
        primary_skill: "COM",
        severity: "minor",
        status: "detected",
        observation: "辅助促销信息与主价格的视觉层级接近。",
        impact: "缩略图下可能削弱价格信息的第一读取顺序。",
      },
    ],
    skillAssessments: {
      human_realism: {
        score: 84,
        assessability: "FULL",
        evidence: ["fixture evidence: 人体结构未见明显异常。"],
        summary: "人体表现可用。",
      },
      photography_realism: {
        score: 82,
        assessability: "FULL",
        evidence: ["fixture evidence: 光影与透视整体一致。"],
        summary: "摄影真实感可用。",
      },
      material_realism: {
        score: 80,
        assessability: "LIMITED",
        evidence: ["fixture evidence: 面料纹理可见，但缺少近景参考。"],
        summary: "材质判断有限。",
      },
    },
    commercialAssessment: {
      assessability: "FULL",
      metrics: scores,
      strengths: ["商品主体明确", "核心卖点可辨认"],
      gaps: ["辅助促销信息层级偏强"],
      summary: "Fixture：相对平台促销主图模板为中等贴合。",
    },
    requiredHumanChecks: ["对照商品参考图核验颜色、版型与图案。"],
  };
}

export class FixtureVisionAdapter implements VisionProviderAdapter {
  readonly providerId = "fixture";
  readonly adapterVersion = "fixture-adapter-0.1.0";
  private readonly draftFactory: (
    input: ProviderEvaluationInput,
  ) => ProviderObservationDraft;

  constructor(
    draftFactory: (
      input: ProviderEvaluationInput,
    ) => ProviderObservationDraft = createFixtureDraft,
  ) {
    this.draftFactory = draftFactory;
  }

  async evaluate(
    input: ProviderEvaluationInput,
    signal: AbortSignal,
  ): Promise<ProviderObservationEnvelope> {
    if (signal.aborted) throw signal.reason;
    const startedAt = Date.now();
    return {
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      modelSnapshot: "fixture-visionqa-0.1.0",
      providerRequestId: `fixture:${input.requestId}`,
      latencyMs: Date.now() - startedAt,
      usage: { inputTokens: 0, outputTokens: 0 },
      warnings: ["FIXTURE_ONLY_NOT_A_REAL_MODEL_RESULT"],
      observationDraft: this.draftFactory(input),
    };
  }
}
