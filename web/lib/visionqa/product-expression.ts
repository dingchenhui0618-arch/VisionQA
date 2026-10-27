export const PRODUCT_EXPRESSION_WEIGHTS = {
  visual_focus: 0.15,
  product_recognition: 0.2,
  detail_visibility: 0.15,
  reference_fidelity: 0.25,
  real_use_credibility: 0.15,
  audience_scene_fit: 0.1,
} as const;

export type ProductExpressionMetricId = keyof typeof PRODUCT_EXPRESSION_WEIGHTS;
export type ProductExpressionAssessability = "FULL" | "PARTIAL" | "NOT_ASSESSABLE";
export type ProductExpressionGate = "PASS" | "REWORK" | "REGENERATE" | "BLOCKED" | "NOT_ASSESSABLE";

export type ProductExpressionMetric = {
  score: number | null;
  weight: number;
  evidence: string[];
  source_refs: string[];
  summary: string;
  assessability: ProductExpressionAssessability;
};

export type ProductExpressionV01 = {
  schema_version: "product-expression-v0.1";
  source: "DIRECT_REVIEW" | "LEGACY_EVALUATION_PROJECTION" | "DEMO_FIXTURE";
  scope: string;
  score: number | null;
  metrics: Record<ProductExpressionMetricId, ProductExpressionMetric>;
  sku_consistency_gate: ProductExpressionGate;
  summary: string;
  unknowns: string[];
  human_final_review_required: true;
};

export type LegacyMetric = { score: number | null; evidence?: string[]; summary?: string };
const metricIds = Object.keys(PRODUCT_EXPRESSION_WEIGHTS) as ProductExpressionMetricId[];

export function calculateProductExpressionScore(metrics: ProductExpressionV01["metrics"]): number | null {
  const assessable = metricIds.filter((id) => metrics[id].score !== null && metrics[id].assessability !== "NOT_ASSESSABLE");
  if (assessable.length === 0) return null;
  const weight = assessable.reduce((sum, id) => sum + PRODUCT_EXPRESSION_WEIGHTS[id], 0);
  const weighted = assessable.reduce((sum, id) => sum + (metrics[id].score ?? 0) * PRODUCT_EXPRESSION_WEIGHTS[id], 0);
  return Math.round((weighted / weight) * 10) / 10;
}

export function validateProductExpressionV01(value: ProductExpressionV01): string[] {
  const errors: string[] = [];
  if (value.schema_version !== "product-expression-v0.1") errors.push("schema_version 必须为 product-expression-v0.1");
  if (value.human_final_review_required !== true) errors.push("human_final_review_required 必须为 true");
  for (const id of metricIds) {
    const metric = value.metrics[id];
    if (!metric) { errors.push(`缺少维度 ${id}`); continue; }
    if (Math.abs(metric.weight - PRODUCT_EXPRESSION_WEIGHTS[id]) > 0.000001) errors.push(`${id}.weight 与固定权重不一致`);
    if (metric.assessability === "NOT_ASSESSABLE" && metric.score !== null) errors.push(`${id} 不可评估时 score 必须为 null`);
    if (metric.assessability !== "NOT_ASSESSABLE" && metric.score === null) errors.push(`${id} 可评估时必须提供 score`);
    if (metric.score !== null && metric.evidence.length === 0) errors.push(`${id} 有分数但没有证据`);
    if (metric.score !== null && metric.source_refs.length === 0) errors.push(`${id} 有分数但没有来源引用`);
  }
  const calculated = calculateProductExpressionScore(value.metrics);
  if (calculated !== value.score) errors.push(`score 应为 ${calculated ?? "null"}`);
  const fidelity = value.metrics.reference_fidelity;
  if (value.sku_consistency_gate === "PASS" && (fidelity.assessability !== "FULL" || fidelity.score === null || fidelity.score < 80)) {
    errors.push("SKU Gate 为 PASS 时，原商品一致性必须 FULL 且不低于 80");
  }
  return errors;
}

function unavailable(id: ProductExpressionMetricId, summary: string): ProductExpressionMetric {
  return { score: null, weight: PRODUCT_EXPRESSION_WEIGHTS[id], evidence: [], source_refs: [], summary, assessability: "NOT_ASSESSABLE" };
}

export function projectLegacyCommercialMetrics(input: {
  scope: string;
  metrics: Partial<Record<"product_prominence" | "selling_point_clarity" | "channel_placement_fit", LegacyMetric>>;
}): ProductExpressionV01 {
  const metrics = Object.fromEntries(metricIds.map((id) => [id, unavailable(id, "旧版商业结果没有该维度的直接证据，不能迁移分数。")] )) as ProductExpressionV01["metrics"];
  const mapping = { product_prominence: "visual_focus", selling_point_clarity: "product_recognition", channel_placement_fit: "audience_scene_fit" } as const;
  for (const [legacyId, targetId] of Object.entries(mapping) as Array<[keyof typeof mapping, ProductExpressionMetricId]>) {
    const source = input.metrics[legacyId];
    if (!source || source.score === null || !source.evidence?.length) continue;
    metrics[targetId] = {
      score: source.score,
      weight: PRODUCT_EXPRESSION_WEIGHTS[targetId],
      evidence: source.evidence,
      source_refs: [`evaluation-result-v0.3.metrics.${legacyId}`],
      summary: source.summary || "由旧版直接对应证据投影，仍需人工复核。",
      assessability: "PARTIAL",
    };
  }
  return {
    schema_version: "product-expression-v0.1", source: "LEGACY_EVALUATION_PROJECTION", scope: input.scope,
    score: calculateProductExpressionScore(metrics), metrics, sku_consistency_gate: "NOT_ASSESSABLE",
    summary: "旧版结果仅迁移存在直接证据对应的维度；SKU 一致性与其余维度等待新版评审。",
    unknowns: ["关键细节呈现", "原商品一致性", "真实使用可信度"], human_final_review_required: true,
  };
}
