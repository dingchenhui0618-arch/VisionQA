import type { ScreeningDecision, ScreeningItem } from "./contracts.ts";

type Observation = {
  severity?: string;
  status?: string;
  observation?: string;
  impact?: string;
};

type EvaluationEnvelope = {
  result?: {
    model_evaluation?: { status?: string; observations?: Observation[] };
    gate_evaluation?: { decision?: "PASS" | "REVIEW" | "REJECT" | null; decision_reason?: string };
    action_plan?: { repair_prompt?: { prompt?: string } | null };
  };
};

export type CustomerScreeningResult = Omit<
  ScreeningItem,
  "id" | "tenantId" | "batchId" | "customerReviewedAt"
>;

export function mapEvaluationToCustomerScreening(
  assetId: string,
  envelope: EvaluationEnvelope,
): CustomerScreeningResult {
  const result = envelope.result;
  const observations = result?.model_evaluation?.observations ?? [];
  const insufficient =
    !result ||
    result.model_evaluation?.status !== "SUCCEEDED" ||
    observations.some(
      (item) => item.severity === "information_insufficient" || item.status === "not_assessable",
    );
  if (insufficient) {
    return {
      assetId,
      decision: "NEEDS_MANUAL_CHECK",
      primaryIssue: null,
      visibleEvidence: "当前商品真值或画面信息不足，系统不替你猜测。请人工确认商品细节。",
      repairPrompt: null,
      issueRegion: null,
    };
  }

  const severityOrder: Record<string, number> = { blocker: 0, major: 1, minor: 2 };
  const primary = [...observations]
    .filter((item) => item.status === "detected" || item.status === "suspected")
    .sort((a, b) => (severityOrder[a.severity ?? "minor"] ?? 3) - (severityOrder[b.severity ?? "minor"] ?? 3))[0];

  if (!primary && result.gate_evaluation?.decision === "PASS") {
    return {
      assetId,
      decision: "NO_OBVIOUS_ISSUE",
      primaryIssue: null,
      visibleEvidence: "与已提供的商品真值对照后，暂未发现需要优先处理的明显问题。",
      repairPrompt: null,
      issueRegion: null,
    };
  }

  if (!primary) {
    return {
      assetId,
      decision: "NEEDS_MANUAL_CHECK",
      primaryIssue: null,
      visibleEvidence: cleanSentence(result.gate_evaluation?.decision_reason) || "系统没有形成足够可靠的单一问题，请人工判断。",
      repairPrompt: null,
      issueRegion: null,
    };
  }

  return {
    assetId,
    decision: "NEEDS_ATTENTION",
    primaryIssue: cleanSentence(primary.observation) || "商品细节与真值不一致",
    visibleEvidence: cleanSentence(primary.impact) || "该差异可能影响商品真实性或后续使用。",
    repairPrompt: cleanSentence(result.action_plan?.repair_prompt?.prompt) || null,
    issueRegion: null,
  };
}

export function exampleScreeningResult(assetId: string, fileName: string): CustomerScreeningResult | null {
  const name = fileName.toLowerCase();
  const examples: Array<{
    test: RegExp;
    decision: ScreeningDecision;
    issue: string | null;
    evidence: string;
    prompt: string | null;
    region: CustomerScreeningResult["issueRegion"];
  }> = [
    {
      test: /demo-cardigan-defect|sc-001-extra-button/,
      decision: "NEEDS_ATTENTION",
      issue: "开衫门襟出现多余纽扣",
      evidence: "候选图门襟的纽扣数量与商品真值不一致，优先修正这一处。",
      prompt: "只移除门襟多余纽扣并恢复针织纹理；保持人物、姿势、脸、手、背景、构图和其余服装细节不变。",
      region: { x: 0.42, y: 0.38, width: 0.18, height: 0.28 },
    },
    {
      test: /sc-002-hand-cuff/,
      decision: "NEEDS_ATTENTION",
      issue: "手部与袖口粘连",
      evidence: "手部边缘与袖口结构融合，影响穿着真实性。",
      prompt: "修复手部和袖口之间的边界与遮挡关系，保持商品结构、人物身份和构图不变。",
      region: { x: 0.58, y: 0.42, width: 0.22, height: 0.24 },
    },
    {
      test: /sc-003-extra-arm/,
      decision: "NEEDS_ATTENTION",
      issue: "人物出现多余手臂",
      evidence: "人体结构异常涉及整体姿态，建议重新生成而不是局部涂改。",
      prompt: "重新生成可用的单人模特图，严格保持商品真值、人物方向和画幅；不得出现额外肢体。",
      region: { x: 0.18, y: 0.25, width: 0.64, height: 0.48 },
    },
    {
      test: /sc-004-sleeve-texture/,
      decision: "NEEDS_ATTENTION",
      issue: "一侧袖子材质纹理丢失",
      evidence: "问题袖子的织物纹理与真值及另一侧不一致。",
      prompt: "只恢复问题袖子的针织纹理和自然褶皱，其他区域保持不变。",
      region: { x: 0.12, y: 0.32, width: 0.24, height: 0.36 },
    },
    {
      test: /sc-005-multi-structure/,
      decision: "NEEDS_ATTENTION",
      issue: "商品多处结构同时变化",
      evidence: "候选图存在多个商品身份级差异，不适合继续局部修补。",
      prompt: "依据商品真值重新生成整张候选图，保持画幅和模特方向，并重新复验全部商品结构。",
      region: { x: 0.24, y: 0.2, width: 0.52, height: 0.58 },
    },
    {
      test: /demo-cardigan-repaired/,
      decision: "NO_OBVIOUS_ISSUE",
      issue: null,
      evidence: "与示例商品真值对照后，暂未发现需要优先处理的明显问题。",
      prompt: null,
      region: null,
    },
  ];
  const match = examples.find((entry) => entry.test.test(name));
  if (!match) return null;
  return {
    assetId,
    decision: match.decision,
    primaryIssue: match.issue,
    visibleEvidence: match.evidence,
    repairPrompt: match.prompt,
    issueRegion: match.region,
  };
}

/**
 * Explicit local-demo result.  This is intentionally deterministic and does
 * not inspect pixels (or filenames); callers must label the response as
 * MOCK_ONLY.  Keeping it here lets the local backend exercise the complete
 * persisted batch contract without implying model evidence.
 */
export function localMockScreeningResult(assetId: string, index: number): CustomerScreeningResult {
  if (index % 3 === 2) {
    return {
      assetId,
      decision: "NO_OBVIOUS_ISSUE",
      primaryIssue: null,
      visibleEvidence: "模拟状态：未见明显问题（预设结果，不代表模型判断）。",
      repairPrompt: null,
      issueRegion: null,
    };
  }
  const manual = index % 3 === 1;
  return {
    assetId,
    decision: manual ? "NEEDS_MANUAL_CHECK" : "NEEDS_ATTENTION",
    primaryIssue: manual ? null : "模拟问题：请人工核对商品局部细节",
    visibleEvidence: manual ? "模拟状态：需要人工补充判断（预设结果）。" : "模拟证据：候选图局部需要人工确认（预设结果）。",
    repairPrompt: manual ? null : "仅处理选定局部；保持人物、背景、构图和非目标商品细节不变。",
    issueRegion: manual ? null : { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
  };
}

function cleanSentence(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 500)
    : "";
}
