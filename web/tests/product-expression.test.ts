import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_EXPRESSION_WEIGHTS, calculateProductExpressionScore, projectLegacyCommercialMetrics, validateProductExpressionV01, type ProductExpressionV01 } from "../lib/visionqa/product-expression.ts";

test("product expression uses fixed weights and evidence-weighted score", () => {
  const metrics = Object.fromEntries(Object.entries(PRODUCT_EXPRESSION_WEIGHTS).map(([id, weight]) => [id, {
    score: 80, weight, evidence: ["可见证据"], source_refs: [`review.${id}`], summary: "人工审核", assessability: "FULL",
  }])) as ProductExpressionV01["metrics"];
  assert.equal(calculateProductExpressionScore(metrics), 80);
  const value: ProductExpressionV01 = { schema_version: "product-expression-v0.1", source: "DIRECT_REVIEW", scope: "asset-1", score: 80, metrics, sku_consistency_gate: "PASS", summary: "可进入人工终审", unknowns: [], human_final_review_required: true };
  assert.deepEqual(validateProductExpressionV01(value), []);
});

test("a score without evidence is rejected", () => {
  const projected = projectLegacyCommercialMetrics({ scope: "legacy-1", metrics: { product_prominence: { score: 91, evidence: ["商品主体位于视觉中心"] } } });
  projected.metrics.visual_focus.evidence = [];
  assert.ok(validateProductExpressionV01(projected).some((error) => error.includes("没有证据")));
});

test("legacy projection does not invent reference fidelity", () => {
  const projected = projectLegacyCommercialMetrics({ scope: "legacy-2", metrics: { product_prominence: { score: 88, evidence: ["主体清楚"] }, selling_point_clarity: { score: 76, evidence: ["轮廓可识别"] } } });
  assert.equal(projected.metrics.reference_fidelity.score, null);
  assert.equal(projected.metrics.reference_fidelity.assessability, "NOT_ASSESSABLE");
  assert.equal(projected.sku_consistency_gate, "NOT_ASSESSABLE");
  assert.deepEqual(validateProductExpressionV01(projected), []);
});
