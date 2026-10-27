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

/** Keep internal operation identifiers out of the first user-facing result. */
function humanNextStep(action: string | undefined): string {
  const normalized = action?.trim();
  if (!normalized) return "人工确认当前结果，再决定是否继续修改。";
  const labels: Record<string, string> = {
    connect_authorized_visual_provider: "接入可用的视觉模型后再检查，或先由人工确认这份结果。",
    confirm_human_review: "先确认这处问题，再决定是否继续修改。",
    provide_visual_context: "补充一张可检查的图片或截图后再试一次。",
  };
  return labels[normalized] || normalized;
}

function humanVerificationCheck(check: string): string {
  const normalized = check.trim();
  const replacements: Record<string, string> = {
    "确认已使用真实视觉 Provider": "确认这次结果来自可用的视觉模型",
    "确认已使用真实视觉 Provider 或人工评审，而非 Mock 结果。": "确认这次已经形成视觉判断，或由人工完成确认。",
    "确认输入产物与当前 revision 一致": "确认结果对应当前这张图片或当前页面",
    "确认截图、DOM/结构和当前 revision 仍对应同一份视觉产物。": "确认截图、页面内容和当前版本仍是同一份作品。",
    "人工复核最终建议": "在接受建议前做最后一次人工确认",
    "任何写回操作都必须经过用户明确批准。": "插件不会自动修改你的文件；如需改动，请先确认。",
  };
  return replacements[normalized] || normalized.replace(/Provider/g, "视觉模型").replace(/Mock/g, "预览结果").replace(/revision/g, "页面版本");
}

function humanText(value: string): string {
  return value
    .replace(/Mock Provider/g, "当前预览")
    .replace(/Mock 适配器/g, "当前预览")
    .replace(/视觉 Provider/g, "视觉模型")
    .replace(/Provider/g, "视觉模型")
    .replace(/Mock/g, "预览")
    .replace(/revision/g, "页面版本");
}

function humanSummary(summary: string, previewOnly: boolean): string {
  if (previewOnly) return "图片已收到，但当前只确认了输入，没有形成视觉判断。请开启可用的视觉模型后重新检查，或先由人工确认。";
  return humanText(summary);
}

function fromLegacy(contract: VisualReviewResponse): PluginUiResult {
  const previewOnly = contract.usage.mode === "mock";
  const issues = contract.issues.slice(0, 16).map((issue) => ({
    id: issue.id,
    title: categoryLabels[issue.category] || "有一处视觉问题需要看一下",
    priority: priorityFor(issue.severity),
    summary: humanText(issue.evidence[0]?.description || "当前证据指出这里需要进一步确认。"),
    nextStep: humanNextStep(humanText(issue.suggested_fix)),
    evidence: legacyEvidenceToUi(issue).map((evidence) => ({ ...evidence, description: humanText(evidence.description) })),
  }));
  return {
    schema_version: "visionqa-ui-v0.1",
    decision: contract.decision,
    decision_label: decisionLabels[contract.decision],
    summary: humanSummary(contract.summary, previewOnly),
    issues,
    next_step: humanNextStep(contract.repair_plan.operations[0]?.action),
    verification_checks: contract.verification.checks.slice(0, 3).map(humanVerificationCheck),
    preview_only: previewOnly,
  };
}

function fromV02(contract: VisualReviewV02Response): PluginUiResult {
  const previewOnly = contract.usage.mode === "mock";
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
        summary: humanText(observation.statement),
        nextStep: humanNextStep(humanText(issue?.suggested_fix || observation.recommendation || "人工确认这处证据，再决定下一步。")),
        evidence: anchors.map((anchor) => ({ ...anchor, description: humanText(anchor.description) })),
      };
    });
  const fallbackIssues = issues.length ? issues : contract.issues.slice(0, 16).map((issue) => ({
    id: issue.id,
    title: categoryLabels[issue.category] || "有一处视觉问题需要看一下",
    priority: priorityFor(issue.severity),
    summary: humanText(issue.evidence_anchors[0]?.description || "当前证据指出这里需要进一步确认。"),
    nextStep: humanNextStep(humanText(issue.suggested_fix)),
    evidence: issue.evidence_anchors.map((anchor) => ({ ...anchorToUi(anchor), description: humanText(anchor.description) })).slice(0, 4),
  }));
  return {
    schema_version: "visionqa-ui-v0.1",
    decision: contract.decision,
    decision_label: decisionLabels[contract.decision],
    summary: humanSummary(contract.summary, previewOnly),
    issues: fallbackIssues,
    next_step: humanNextStep(contract.repair_plan.operations[0]?.action),
    verification_checks: contract.verification.checks.slice(0, 3).map(humanVerificationCheck),
    revision_id: contract.revision_id,
    preview_only: previewOnly,
  };
}

export function toPluginUiResult(contract: VisualReviewResponse | VisualReviewV02Response): PluginUiResult {
  return contract.schema_version === "visual-review-v0.2" ? fromV02(contract) : fromLegacy(contract);
}
