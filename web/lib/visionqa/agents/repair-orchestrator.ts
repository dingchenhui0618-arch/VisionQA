import type { RepairProviderJobSnapshot } from "../repair-provider-contract.ts";

export const REPAIR_COLLABORATION_SCHEMA_VERSION =
  "visionqa-repair-collaboration-v0.1" as const;

export type RepairAgentStatus = "COMPLETED" | "WAITING" | "BLOCKED";

export type RepairCollaborationInput = {
  caseId: string;
  sourceAssetId: number;
  sourceName: string;
  sourceSha256: string;
  referenceAssetCount: number;
  diagnosisReady: boolean;
  issueCount: number;
  repairPromptReady: boolean;
  lockedAttributeCount: number;
  providerJob: RepairProviderJobSnapshot | null;
  repairOutputAvailable: boolean;
  humanChecksCompleted: number;
  upscaleOutputAvailable: boolean;
};

export type RepairCollaborationRun = {
  schemaVersion: typeof REPAIR_COLLABORATION_SCHEMA_VERSION;
  caseId: string;
  executionMode: "LOCAL_STATE_MACHINE_NO_MODEL";
  status:
    | "NEEDS_PRODUCT_TRUTH"
    | "NEEDS_DIAGNOSIS"
    | "READY_FOR_PROVIDER"
    | "PROVIDER_BLOCKED"
    | "REPAIR_IN_PROGRESS"
    | "REPAIR_OUTPUT_READY"
    | "READY_FOR_DELIVERY"
    | "DELIVERED";
  agents: Array<{
    id: string;
    name: string;
    responsibility: string;
    status: RepairAgentStatus;
    note: string;
  }>;
  handoffs: Array<{
    from: string;
    to: string;
    artifact: string;
    ready: boolean;
  }>;
  nextAction: string;
  independentModelAgentsActive: false;
  humanFinalReviewRequired: true;
};

function stageStatus(
  completed: boolean,
  waiting: boolean,
): RepairAgentStatus {
  if (completed) return "COMPLETED";
  return waiting ? "WAITING" : "BLOCKED";
}

export function runRepairCollaboration(
  input: RepairCollaborationInput,
): RepairCollaborationRun {
  const truthReady = input.referenceAssetCount > 0;
  const diagnosisReady = truthReady && input.diagnosisReady;
  const planReady =
    diagnosisReady &&
    input.repairPromptReady &&
    input.lockedAttributeCount > 0;
  const providerBlocked =
    input.providerJob?.status === "BLOCKED_AUTHORIZATION" ||
    input.providerJob?.status === "ADAPTER_NOT_CONFIGURED" ||
    input.providerJob?.status === "FAILED";
  const providerRunning = input.providerJob?.status === "RUNNING";
  const outputReady = input.repairOutputAvailable;
  const humanReviewReady =
    planReady && outputReady && input.humanChecksCompleted === 4;
  const delivered = humanReviewReady && input.upscaleOutputAvailable;

  let status: RepairCollaborationRun["status"];
  let nextAction: string;
  if (!truthReady) {
    status = "NEEDS_PRODUCT_TRUTH";
    nextAction = "先上传商品白底图或官方确认稿，建立商品真值。";
  } else if (!diagnosisReady) {
    status = "NEEDS_DIAGNOSIS";
    nextAction = "对当前 AI 模特草图完成问题诊断，不使用示例结论。";
  } else if (!planReady) {
    status = "NEEDS_DIAGNOSIS";
    nextAction = "补齐修正 Prompt 与必须锁定的商品属性。";
  } else if (!input.providerJob) {
    status = "READY_FOR_PROVIDER";
    nextAction = "建立可追溯的改图任务并选择执行 Provider。";
  } else if (providerBlocked) {
    status = "PROVIDER_BLOCKED";
    nextAction = "当前 Provider 未获准调用；可等待授权或上传外部改图结果。";
  } else if (providerRunning) {
    status = "REPAIR_IN_PROGRESS";
    nextAction = "等待 Provider 返回候选图，不重复提交付费任务。";
  } else if (!outputReady) {
    status = "REPAIR_IN_PROGRESS";
    nextAction = "执行改图任务或上传外部改图候选。";
  } else if (!humanReviewReady) {
    status = "REPAIR_OUTPUT_READY";
    nextAction = "完成四项人工漂移复验。";
  } else if (!delivered) {
    status = "READY_FOR_DELIVERY";
    nextAction = "对人工确认后的候选图生成 4K 交付文件。";
  } else {
    status = "DELIVERED";
    nextAction = "当前修正案例已形成可下载终稿与处理凭证。";
  }

  return {
    schemaVersion: REPAIR_COLLABORATION_SCHEMA_VERSION,
    caseId: input.caseId,
    executionMode: "LOCAL_STATE_MACHINE_NO_MODEL",
    status,
    agents: [
      {
        id: "sku-truth-guardian",
        name: "商品真值守门员",
        responsibility: "锁定白底图、颜色、版型、图案、Logo 与材质依据",
        status: truthReady ? "COMPLETED" : "BLOCKED",
        note: truthReady
          ? `已登记 ${input.referenceAssetCount} 张商品真值图`
          : "没有商品真值时禁止形成一致性结论",
      },
      {
        id: "diagnosis-agent",
        name: "问题诊断智能体",
        responsibility: "定位商品漂移、人体结构和生成痕迹",
        status: stageStatus(diagnosisReady, truthReady),
        note: diagnosisReady
          ? `当前诊断包含 ${input.issueCount} 项问题`
          : truthReady
            ? "等待当前草图的真实诊断结果"
            : "等待商品真值",
      },
      {
        id: "repair-planner",
        name: "修正规划智能体",
        responsibility: "生成修正边界、锁定项和可执行 Prompt",
        status: stageStatus(planReady, diagnosisReady),
        note: planReady
          ? `已锁定 ${input.lockedAttributeCount} 项商品属性`
          : "不使用示例 Prompt 填充缺失诊断",
      },
      {
        id: "generation-executor",
        name: "改图执行智能体",
        responsibility: "调用获准 Provider 或接收外部改图候选",
        status: outputReady
          ? "COMPLETED"
          : planReady
            ? providerBlocked
              ? "BLOCKED"
              : "WAITING"
            : "BLOCKED",
        note: outputReady
          ? input.providerJob?.outputSource === "QWEN_BAILIAN"
            ? "千问候选图已写入当前本机项目"
            : "外部改图候选已写入当前本机项目"
          : providerBlocked
            ? "授权或配置不完整，网络请求保持为零"
            : "等待建立或执行改图任务",
      },
      {
        id: "drift-verifier",
        name: "漂移复验智能体",
        responsibility: "组织商品一致性与非目标区域人工复验",
        status: humanReviewReady
          ? "COMPLETED"
          : outputReady
            ? "WAITING"
            : "BLOCKED",
        note: outputReady
          ? planReady
            ? `已完成 ${input.humanChecksCompleted}/4 项人工复验`
            : `历史勾选 ${input.humanChecksCompleted}/4，当前证据 Gate 未满足`
          : "等待改图候选",
      },
      {
        id: "delivery-agent",
        name: "清晰度交付智能体",
        responsibility: "只对人工确认图生成 4K 文件与处理凭证",
        status: delivered
          ? "COMPLETED"
          : humanReviewReady
            ? "WAITING"
            : "BLOCKED",
        note: delivered
          ? "4K 文件与处理凭证已经形成"
          : humanReviewReady
            ? "等待执行清晰度交付"
            : "等待人工复验完成",
      },
    ],
    handoffs: [
      {
        from: "sku-truth-guardian",
        to: "diagnosis-agent",
        artifact: "商品真值范围",
        ready: truthReady,
      },
      {
        from: "diagnosis-agent",
        to: "repair-planner",
        artifact: "问题证据与诊断结论",
        ready: diagnosisReady,
      },
      {
        from: "repair-planner",
        to: "generation-executor",
        artifact: "修正 Prompt 与锁定属性",
        ready: planReady,
      },
      {
        from: "generation-executor",
        to: "drift-verifier",
        artifact: "改图候选",
        ready: outputReady,
      },
      {
        from: "drift-verifier",
        to: "delivery-agent",
        artifact: "人工复验记录",
        ready: humanReviewReady,
      },
    ],
    nextAction,
    independentModelAgentsActive: false,
    humanFinalReviewRequired: true,
  };
}
