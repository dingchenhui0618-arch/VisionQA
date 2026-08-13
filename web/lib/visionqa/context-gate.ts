import type { EvaluationResultV03 } from "./contracts.ts";

export function applyContextGate(
  result: EvaluationResultV03,
  missingContext: string[],
): EvaluationResultV03 {
  if (missingContext.length === 0) return result;
  const keepReject = result.gate_evaluation.decision === "REJECT";
  return {
    ...result,
    score_evaluation: {
      ...result.score_evaluation,
      status: "PARTIAL",
      overall_score: null,
      score_band: null,
    },
    gate_evaluation: {
      decision: keepReject ? "REJECT" : "REVIEW",
      decision_reason: keepReject
        ? `${result.gate_evaluation.decision_reason}；上下文仍不完整（${missingContext.join("、")}），不得因此弱化拒绝结论。`
        : `上下文不完整（${missingContext.join("、")}），必须人工复核。`,
    },
    action_plan: {
      ...result.action_plan,
      required_human_checks: [
        ...new Set([
          ...result.action_plan.required_human_checks,
          `补齐上下文：${missingContext.join("、")}。`,
        ]),
      ],
    },
  };
}
