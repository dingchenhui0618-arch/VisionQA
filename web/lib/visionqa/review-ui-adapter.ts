import type { VisualReviewResponse } from "./visual-review-contract.ts";
import type { EvidenceAnchor, VisualReviewV02Response } from "./review-contract-v0.2.ts";

export type PluginUiEvidence = {
  id: string;
  label: string;
  description: string;
  kind: EvidenceAnchor["kind"] | "text";
  selector?: string;
  rect?: { x: number; y: number; width: number; height: number };
};

export type PluginUiIssue = {
  id: string;
  title: string;
  priority: "优先处理" | "建议处理" | "可以顺手确认";
  summary: string;
  nextStep: string;
  evidence: PluginUiEvidence[];
};

export type PluginUiResult = {
  schema_version: "visionqa-ui-v0.1";
  decision: VisualReviewResponse["decision"];
  decision_label: string;
  summary: string;
  issues: PluginUiIssue[];
  next_step: string;
  verification_checks: string[];
  revision_id?: string;
  preview_only: boolean;
};

const decisionLabels: Record<VisualReviewResponse["decision"], string> = {
  PASS: "可以继续",
  NEEDS_REVISION: "建议修正",
  MANUAL_REVIEW: "需要人工判断",
  BLOCKED: "暂时阻止",
  NEEDS_CONTEXT: "需要更多上下文",
  NOT_ASSESSABLE: "暂不可评估",
};

const categoryLabels: Record<string, string> = {
  hierarchy: "层级不够清楚",
  readability: "阅读不够顺畅",
  alignment: "对齐关系需要调整",
  contrast: "对比度需要确认",
  spacing: "间距关系需要调整",
  interaction: "交互提示不够明显",
  responsive: "不同屏幕下需要确认",
  provider: "当前还缺少可判断的证据",
};

function priorityFor(severity: VisualReviewResponse["issues"][number]["severity"]): PluginUiIssue["priority"] {
  return severity === "blocker" || severity === "high" ? "优先处理" : severity === "medium" ? "建议处理" : "可以顺手确认";
}

function anchorToUi(anchor: EvidenceAnchor, fallbackDescription = "当前视觉证据"): PluginUiEvidence {
  const description = anchor.description || fallbackDescription;
  if (anchor.kind === "dom_selector") return { id: anchor.id, label: "页面位置", description, kind: anchor.kind, selector: anchor.selector, rect: anchor.rect };
  return { id: anchor.id, label: "评审证据", description, kind: anchor.kind, rect: "rect" in anchor ? anchor.rect : undefined };
}

function legacyEvidenceToUi(issue: VisualReviewResponse["issues"][number]): PluginUiEvidence[] {
  return issue.evidence.slice(0, 3).map((item, index) => ({
    id: `${issue.id}-evidence-${index + 1}`,
    label: item.source === "pixel" ? "截图证据" : item.source === "structure" ? "结构证据" : item.source === "comparison" ? "对比证据" : "上下文证据",
    description: item.description,
    kind: "text",
  }));
}

function fromLegacy(contract: VisualReviewResponse): PluginUiResult {
  const issues = contract.issues.slice(0, 16).map((issue) => ({
    id: issue.id,
    title: categoryLabels[issue.category] || "有一处视觉问题需要看一下",
    priority: priorityFor(issue.severity),
    summary: issue.evidence[0]?.description || "当前证据指出这里需要进一步确认。",
    nextStep: issue.suggested_fix,
    evidence: legacyEvidenceToUi(issue),
  }));
  return {
    schema_version: "visionqa-ui-v0.1",
    decision: contract.decision,
    decision_label: decisionLabels[contract.decision],
    summary: contract.summary,
    issues,
    next_step: contract.repair_plan.operations[0]?.action || "人工确认当前结果，再决定是否继续修改。",
    verification_checks: contract.verification.checks.slice(0, 3),
    preview_only: contract.usage.mode === "mock",
  };
}

function fromV02(contract: VisualReviewV02Response): PluginUiResult {
  const issueMap = new Map(contract.issues.map((issue) => [issue.id, issue]));
  const issues: PluginUiIssue[] = contract.observations.observations
    .filter((observation) => observation.status !== "not_assessable")
    .slice(0, 16)
    .map((observation) => {
      const issue = issueMap.get(observation.id) || contract.issues.find((item) => item.category === observation.dimension);
      const anchors = observation.evidence.map((anchor) => anchorToUi(anchor)).slice(0, 4);
      return {
        id: issue?.id || observation.id,
        title: categoryLabels[issue?.category || observation.dimension] || observation.dimension,
        priority: priorityFor(issue?.severity || observation.severity),
        summary: observation.statement,
        nextStep: issue?.suggested_fix || observation.recommendation || "人工确认这处证据，再决定下一步。",
        evidence: anchors,
      };
    });
  const fallbackIssues = issues.length ? issues : contract.issues.slice(0, 16).map((issue) => ({
    id: issue.id,
    title: categoryLabels[issue.category] || "有一处视觉问题需要看一下",
    priority: priorityFor(issue.severity),
    summary: issue.evidence_anchors[0]?.description || "当前证据指出这里需要进一步确认。",
    nextStep: issue.suggested_fix,
    evidence: issue.evidence_anchors.map((anchor) => anchorToUi(anchor)).slice(0, 4),
  }));
  return {
    schema_version: "visionqa-ui-v0.1",
    decision: contract.decision,
    decision_label: decisionLabels[contract.decision],
    summary: contract.summary,
    issues: fallbackIssues,
    next_step: contract.repair_plan.operations[0]?.action || "人工确认当前结果，再决定是否继续修改。",
    verification_checks: contract.verification.checks.slice(0, 3),
    revision_id: contract.revision_id,
    preview_only: contract.usage.mode === "mock",
  };
}

export function toPluginUiResult(contract: VisualReviewResponse | VisualReviewV02Response): PluginUiResult {
  return contract.schema_version === "visual-review-v0.2" ? fromV02(contract) : fromLegacy(contract);
}
