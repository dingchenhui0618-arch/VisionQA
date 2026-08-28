"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  createOverride as createFormalOverride,
  evaluateLiveCandidate,
  getEvaluation as getFormalEvaluation,
  getLiveModelCapability,
  type CustomerProfileInput,
  type LiveModelCapability,
  VisionQaApiError,
} from "../lib/visionqa/api-client";
import type { UiEvaluationPatch } from "../lib/visionqa/ui-adapter";
import type { LiveEvaluationAttemptRecord } from "../lib/visionqa/live-evaluation-contract";
import {
  appendLocalFeedback,
  candidateTraceId,
  fixtureIndexFromSha256,
  LOCAL_EVALUATION_MODE,
  LOCAL_FEEDBACK_STORAGE_KEY,
  sha256Blob,
  validateLocalCandidate,
} from "../lib/visionqa/local-mvp";
import {
  createBatchCsv,
  createStoredZip,
  downloadBlob,
} from "../lib/visionqa/batch-download";
import { MarketingDeliveryPack } from "./workspace-growth";
import { AssetIntakeWorkspace } from "./workspace-intake";
import { WorkspaceBaseline } from "./workspace-overview";
import { RepairWorkspace } from "./workspace-repair";
import { projectLegacyCommercialMetrics } from "../lib/visionqa/product-expression";
import type { UpscaleJobReceipt } from "../lib/visionqa/upscale";
import type { RepairProviderJobSnapshot } from "../lib/visionqa/repair-provider-contract";
import {
  buildBoundaryAwareRepairPrompt,
  inferRepairBoundary,
  SYNTHETIC_REPAIR_CASES,
  syntheticRepairCase,
} from "../lib/visionqa/repair-boundary";
import {
  SYNTHETIC_TROUSERS_CASE_ID,
  isSyntheticTrousersGroundTruthEligible,
} from "../lib/visionqa/synthetic-ground-truth";
import {
  appendProjectRestoreEvent,
  configureProjectStorageScope,
  createLocalProject,
  loadLatestLocalProject,
  saveLocalProject,
  VISIONQA_PROJECT_PAYLOAD_SCHEMA_VERSION,
  type VisionQaProjectAssetRecord,
  type VisionQaProjectAuditEvent,
  type VisionQaProjectMaterialCounts,
  type VisionQaProjectRecord,
} from "../lib/visionqa/project-store";
import type { TrialAccountSession } from "../lib/visionqa/trial-auth";

type Decision = "PASS" | "REVIEW" | "REJECT";
type View = "grid" | "evidence";
type WorkspaceArea = "overview" | "baseline" | "intake" | "review" | "repair" | "delivery";
type CommercialTemplateId = "model-image-repair" | "brand-flagship";
type ManualIssueCategory =
  | "商品结构"
  | "Logo／字标"
  | "印花／胶印／刺绣"
  | "颜色／材质／纹理"
  | "人物／穿着逻辑"
  | "背景／构图";

type SkillScore = {
  id: string;
  label: string;
  score: number;
  weight: string;
};

type Issue = {
  id: string;
  title: string;
  skill: string;
  severity: "Blocker" | "Major" | "Minor";
  observation: string;
  impact: string;
  rule: string;
  marker: { x: number; y: number };
};

type Asset = {
  id: number;
  src: string;
  decision: Decision;
  score: number;
  productLabel: string;
  skills: SkillScore[];
  issues: Issue[];
  commercialAssessment: string;
  repairPrompt: string;
  lockedAttributes: string;
};

type CommercialMetric = {
  id: string;
  label: string;
  score: number;
};

type CommercialResult = {
  templateId: string;
  templateVersion: string;
  templateName: string;
  fitScore: number;
  fitLevel: "高" | "中" | "低" | "未评估";
  summary: string;
  strengths: string[];
  gaps: string[];
  metrics: CommercialMetric[];
};

type EvaluatedAsset = Asset & {
  commercial: CommercialResult;
  evaluationId?: string;
  resultVersion?: number;
  scoreAvailable?: boolean;
  diagnosisReady?: boolean;
  promptProvenance?: string | null;
  calibrationStatus?: "DEMO" | "UNCALIBRATED" | "CALIBRATED";
  modelStatus?: string;
  markerAvailable?: boolean;
  evaluationMode?:
    | typeof LOCAL_EVALUATION_MODE
    | "LIVE_MODEL_CANARY"
    | "SYNTHETIC_GROUND_TRUTH"
    | "HUMAN_CONFIRMED_ISSUE";
  fixtureCaseId?: string;
  persistedEvaluation?: boolean;
  providerId?: string;
  modelSnapshot?: string;
  providerLatencyMs?: number;
  referenceCount?: number;
  evidenceMode?: "SYNTHETIC_INTERNAL_TEST_ONLY";
  assetOrigin?: "IMAGEGEN_SYNTHETIC_INTERNAL";
  notRealCustomerEvidence?: boolean;
  notModelEffectivenessEvidence?: boolean;
  notCommercialEvidence?: boolean;
};

type DataState =
  | { kind: "fixture" }
  | { kind: "loading"; evaluationId: string }
  | { kind: "real"; evaluationId: string }
  | {
      kind: "local";
      candidateName: string;
      candidateTraceId: string;
      fixtureCaseId: string;
    }
  | { kind: "live-loading"; candidateName: string }
  | {
      kind: "live";
      evaluationId: string;
      providerId: string;
      modelSnapshot: string;
      latencyMs: number;
    }
  | { kind: "synthetic-ground-truth"; caseId: string }
  | { kind: "synthetic-library"; candidateName: string; caseId: string }
  | {
      kind: "human-confirmed";
      candidateName: string;
      evidenceMode?: "SYNTHETIC_INTERNAL_TEST_ONLY";
      fixtureCaseId?: string;
    }
  | {
      kind: "live-error";
      candidateName: string;
      message: string;
      errorCode?: string;
      requestId?: string | null;
    }
  | { kind: "fallback"; evaluationId: string; message: string };

type AuditEntry = {
  id: string;
  assetId: number;
  originalDecision: Decision;
  humanDecision: Decision;
  createdAt: string;
  storage: "server" | "local";
  commercialTemplateId?: string;
  commercialFitScore?: number;
  schemaVersion?: "visionqa-local-feedback-v1";
  candidateTraceId?: string;
  candidateSha256?: string;
  candidateName?: string;
  evaluationMode?:
    | typeof LOCAL_EVALUATION_MODE
    | "LIVE_MODEL_CANARY"
    | "SYNTHETIC_GROUND_TRUTH"
    | "HUMAN_CONFIRMED_ISSUE";
  fixtureCaseId?: string;
  reasonCode?: string;
  evidenceNote?: string;
  overallScore?: number;
  submissionContext?: SubmissionContext;
  reviewStartedAt?: string;
  reviewCompletedAt?: string;
  promptCopyCount?: number;
};

type OverrideInput = {
  reasonCode: string;
  evidenceNote: string;
};

type SubmissionContext = {
  channel: string;
  placement: string;
  referenceStatus: "complete" | "missing";
  provenanceStatus: "confirmed_ai" | "confirmed_real" | "unknown";
};

type LocalCandidate = {
  name: string;
  size: number;
  sha256: string;
  traceId: string;
  fixtureCaseId: string;
  submissionContext: SubmissionContext;
  reviewStartedAt: string;
};

type IntakeState =
  | { kind: "idle" }
  | { kind: "processing"; candidateName: string }
  | { kind: "ready" }
  | { kind: "error"; message: string };

type BatchCandidate = {
  id: number;
  file: File;
  src: string;
  sha256: string;
  traceId: string;
  fixtureCaseId: string;
  status: "ready" | "running" | "done" | "error";
  selected: boolean;
  result?: EvaluatedAsset;
  error?: string;
  lastAttempt?: LiveEvaluationAttemptRecord;
};

type StoredEvaluatedAsset = Omit<EvaluatedAsset, "src">;

type StoredBatchCandidate = Omit<
  BatchCandidate,
  "file" | "src" | "result" | "status"
> & {
  assetId: string;
  status: "ready" | "done" | "error";
  result?: StoredEvaluatedAsset;
};

type StoredRepairSession = {
  schemaVersion: "visionqa-repair-session-v0.1";
  sourceAssetId: number | null;
  outputAssetId: string | null;
  humanChecks: string[];
  upscaleAssetId: string | null;
  upscaleReceipt: UpscaleJobReceipt | null;
  providerJob?: RepairProviderJobSnapshot | null;
};

type WorkspaceProjectPayload = {
  schemaVersion: typeof VISIONQA_PROJECT_PAYLOAD_SCHEMA_VERSION;
  area: WorkspaceArea;
  view: View;
  commercialTemplateId: CommercialTemplateId;
  selectedId: number;
  auditEntries: AuditEntry[];
  dataState: Exclude<DataState, { kind: "loading" } | { kind: "live-loading" }>;
  localCandidate: LocalCandidate | null;
  intakeState: Exclude<IntakeState, { kind: "processing" }>;
  submissionContext: SubmissionContext;
  promptCopyCount: number;
  customerProfile: CustomerProfileInput;
  referenceAssetIds: string[];
  batchCandidates: StoredBatchCandidate[];
  repairSession?: StoredRepairSession;
};

type ProjectPersistenceState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "saving"; revision: number }
  | { kind: "saved"; revision: number; updatedAt: string }
  | { kind: "error"; message: string };

type ProjectAssetInput = Omit<
  VisionQaProjectAssetRecord,
  "schemaVersion" | "projectId" | "updatedAt"
>;

const CARDIGAN_EXPERIENCE_CASE_ID = "SYN-VQA-GRAY-CARDIGAN-001";
const CARDIGAN_EXPERIENCE_ISSUE =
  "画面左侧／穿着者右胸多出商品真值中不存在的黑色五瓣花刺绣；只删除这枚错误刺绣，保留画面右侧／穿着者左胸的正确刺绣、四颗纽扣、人物和其他区域。";

const isSyntheticRepairLibraryCase = (caseId: string | undefined) =>
  Boolean(syntheticRepairCase(caseId));

async function publicImageFile(url: string, name: string): Promise<File> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`无法载入本地体验素材：${name}`);
  const blob = await response.blob();
  return new File([blob], name, {
    type: blob.type || "image/png",
    lastModified: Date.now(),
  });
}

function durableDataState(
  state: DataState,
  candidate: LocalCandidate | null,
): WorkspaceProjectPayload["dataState"] {
  if (state.kind === "loading") {
    return {
      kind: "fallback",
      evaluationId: state.evaluationId,
      message: "上次读取在页面关闭前尚未完成，请重新获取正式评估。",
    };
  }
  if (state.kind === "live-loading") {
    return candidate
      ? {
          kind: "local",
          candidateName: candidate.name,
          candidateTraceId: candidate.traceId,
          fixtureCaseId: candidate.fixtureCaseId,
        }
      : { kind: "fixture" };
  }
  return state;
}

function durableRepairProviderJob(
  job: RepairProviderJobSnapshot | null,
): RepairProviderJobSnapshot | null {
  if (!job || job.status !== "RUNNING") return job;
  return {
    ...job,
    status: "FAILED",
    failureCode: "INTERRUPTED_RETRY_REQUIRED",
  };
}

function durableIntakeState(
  state: IntakeState,
  candidateCount: number,
): WorkspaceProjectPayload["intakeState"] {
  if (state.kind !== "processing") return state;
  return candidateCount > 0 ? { kind: "ready" } : { kind: "idle" };
}

function stripEvaluatedAsset(asset: EvaluatedAsset): StoredEvaluatedAsset {
  return {
    id: asset.id,
    decision: asset.decision,
    score: asset.score,
    productLabel: asset.productLabel,
    skills: asset.skills,
    issues: asset.issues,
    commercialAssessment: asset.commercialAssessment,
    repairPrompt: asset.repairPrompt,
    lockedAttributes: asset.lockedAttributes,
    commercial: asset.commercial,
    evaluationId: asset.evaluationId,
    resultVersion: asset.resultVersion,
    scoreAvailable: asset.scoreAvailable,
    diagnosisReady: asset.diagnosisReady,
    promptProvenance: asset.promptProvenance,
    calibrationStatus: asset.calibrationStatus,
    modelStatus: asset.modelStatus,
    markerAvailable: asset.markerAvailable,
    evaluationMode: asset.evaluationMode,
    fixtureCaseId: asset.fixtureCaseId,
    persistedEvaluation: asset.persistedEvaluation,
    providerId: asset.providerId,
    modelSnapshot: asset.modelSnapshot,
    providerLatencyMs: asset.providerLatencyMs,
    referenceCount: asset.referenceCount,
    evidenceMode: asset.evidenceMode,
    assetOrigin: asset.assetOrigin,
    notRealCustomerEvidence: asset.notRealCustomerEvidence,
    notModelEffectivenessEvidence: asset.notModelEffectivenessEvidence,
    notCommercialEvidence: asset.notCommercialEvidence,
  };
}

function buildWorkspaceProjectPayload({
  area,
  view,
  commercialTemplateId,
  selectedId,
  auditEntries,
  dataState,
  localCandidate,
  intakeState,
  submissionContext,
  promptCopyCount,
  customerProfile,
  referenceFiles,
  batchCandidates,
  repairOutputFile,
  repairSourceAssetId,
  repairChecks,
  upscaleOutputFile,
  upscaleReceipt,
  repairProviderJob,
}: {
  area: WorkspaceArea;
  view: View;
  commercialTemplateId: CommercialTemplateId;
  selectedId: number;
  auditEntries: AuditEntry[];
  dataState: DataState;
  localCandidate: LocalCandidate | null;
  intakeState: IntakeState;
  submissionContext: SubmissionContext;
  promptCopyCount: number;
  customerProfile: CustomerProfileInput;
  referenceFiles: File[];
  batchCandidates: BatchCandidate[];
  repairOutputFile: File | null;
  repairSourceAssetId: number | null;
  repairChecks: string[];
  upscaleOutputFile: File | null;
  upscaleReceipt: UpscaleJobReceipt | null;
  repairProviderJob: RepairProviderJobSnapshot | null;
}): WorkspaceProjectPayload {
  return {
    schemaVersion: VISIONQA_PROJECT_PAYLOAD_SCHEMA_VERSION,
    area,
    view,
    commercialTemplateId,
    selectedId,
    auditEntries,
    dataState: durableDataState(dataState, localCandidate),
    localCandidate,
    intakeState: durableIntakeState(intakeState, batchCandidates.length),
    submissionContext,
    promptCopyCount,
    customerProfile,
    referenceAssetIds: referenceFiles.map(
      (file, index) => `reference-${index}-${file.lastModified}-${file.size}`,
    ),
    batchCandidates: batchCandidates.map((candidate) => ({
      id: candidate.id,
      assetId: `candidate-${candidate.sha256}`,
      sha256: candidate.sha256,
      traceId: candidate.traceId,
      fixtureCaseId: candidate.fixtureCaseId,
      status: candidate.status === "running" ? "ready" : candidate.status,
      selected: candidate.selected,
      result: candidate.result
        ? stripEvaluatedAsset(candidate.result)
        : undefined,
      error:
        candidate.status === "running"
          ? "上次分析在页面关闭前尚未完成，请重新发起。"
          : candidate.error,
      lastAttempt:
        candidate.lastAttempt?.status === "RUNNING"
          ? {
              ...candidate.lastAttempt,
              status: "FAILED",
              finishedAt: new Date().toISOString(),
              errorCode: "INTERRUPTED_RETRY_REQUIRED",
            }
          : candidate.lastAttempt,
    })),
    repairSession: {
      schemaVersion: "visionqa-repair-session-v0.1",
      sourceAssetId: repairSourceAssetId,
      outputAssetId: repairOutputFile
        ? `repair-output-${repairOutputFile.lastModified}-${repairOutputFile.size}`
        : null,
      humanChecks: repairChecks,
      upscaleAssetId: upscaleOutputFile
        ? `upscale-output-${upscaleOutputFile.lastModified}-${upscaleOutputFile.size}`
        : null,
      upscaleReceipt,
      providerJob: durableRepairProviderJob(repairProviderJob),
    },
  };
}

function buildProjectAssets(
  referenceFiles: File[],
  batchCandidates: BatchCandidate[],
  repairOutputFile: File | null,
  upscaleOutputFile: File | null,
): ProjectAssetInput[] {
  return [
    ...referenceFiles.map((file, index): ProjectAssetInput => ({
      assetId: `reference-${index}-${file.lastModified}-${file.size}`,
      role: "REFERENCE",
      position: index,
      fileName: file.name,
      mimeType: file.type,
      byteSize: file.size,
      lastModified: file.lastModified,
      sha256: null,
      file,
    })),
    ...batchCandidates.map((candidate, index): ProjectAssetInput => ({
      assetId: `candidate-${candidate.sha256}`,
      role: "CANDIDATE",
      position: index,
      fileName: candidate.file.name,
      mimeType: candidate.file.type,
      byteSize: candidate.file.size,
      lastModified: candidate.file.lastModified,
      sha256: candidate.sha256,
      file: candidate.file,
    })),
    ...(repairOutputFile
      ? [{
          assetId: `repair-output-${repairOutputFile.lastModified}-${repairOutputFile.size}`,
          role: "REPAIR_OUTPUT" as const,
          position: 0,
          fileName: repairOutputFile.name,
          mimeType: repairOutputFile.type,
          byteSize: repairOutputFile.size,
          lastModified: repairOutputFile.lastModified,
          sha256: null,
          file: repairOutputFile,
        }]
      : []),
    ...(upscaleOutputFile
      ? [{
          assetId: `upscale-output-${upscaleOutputFile.lastModified}-${upscaleOutputFile.size}`,
          role: "UPSCALE_OUTPUT" as const,
          position: 0,
          fileName: upscaleOutputFile.name,
          mimeType: upscaleOutputFile.type,
          byteSize: upscaleOutputFile.size,
          lastModified: upscaleOutputFile.lastModified,
          sha256: null,
          file: upscaleOutputFile,
        }]
      : []),
  ];
}

function projectMaterialCounts(
  referenceFiles: File[],
  batchCandidates: BatchCandidate[],
  auditEntries: AuditEntry[],
): VisionQaProjectMaterialCounts {
  return {
    references: referenceFiles.length,
    candidates: batchCandidates.length,
    completedEvaluations: batchCandidates.filter((candidate) => candidate.result)
      .length,
    humanReviews: new Set(auditEntries.map((entry) => entry.assetId)).size,
  };
}

function projectContentSignature(
  payload: WorkspaceProjectPayload,
  assets: ProjectAssetInput[],
): string {
  return JSON.stringify({
    payload,
    assets: assets.map((asset) => ({
      assetId: asset.assetId,
      role: asset.role,
      position: asset.position,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      lastModified: asset.lastModified,
      sha256: asset.sha256,
    })),
  });
}

function isWorkspaceProjectPayload(value: unknown): value is WorkspaceProjectPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<WorkspaceProjectPayload>;
  return (
    payload.schemaVersion === VISIONQA_PROJECT_PAYLOAD_SCHEMA_VERSION &&
    Array.isArray(payload.referenceAssetIds) &&
    Array.isArray(payload.batchCandidates) &&
    Array.isArray(payload.auditEntries) &&
    !!payload.customerProfile &&
    !!payload.submissionContext
  );
}

function logicalAssetId(asset: VisionQaProjectAssetRecord): string {
  const prefix = `${asset.projectId}:`;
  return asset.assetId.startsWith(prefix)
    ? asset.assetId.slice(prefix.length)
    : asset.assetId;
}

const defaultCustomerProfile: CustomerProfileInput = {
  styles: ["简约通勤"],
  priceMin: "199",
  priceMax: "599",
  audiences: ["都市白领", "通勤女性"],
  ageRanges: ["24–30 岁"],
  genderProfiles: ["女性为主"],
  cityTiers: ["一线城市", "新一线城市"],
  audienceSegments: ["都市白领", "通勤女性"],
  scenarios: ["通勤"],
  purchaseDrivers: ["版型", "搭配效率"],
  skuLinks: [],
  skuFacts: [],
};

const imageNames = [
  "model-blue-floral-dress-front.png",
  "model-black-column-dress.png",
  "model-ivory-floral-midi.png",
  "model-ivory-puff-midi.png",
  "model-black-floral-mini.png",
  "model-sky-blue-midi.png",
  "model-ivory-square-neck-top.png",
];

const decisions: Decision[] = [
  "REVIEW",
  "PASS",
  "REJECT",
  "REVIEW",
  "PASS",
  "REVIEW",
  "REJECT",
  "PASS",
  "REVIEW",
  "PASS",
  "REJECT",
  "PASS",
];

const scores = [82, 94, 58, 79, 91, 76, 63, 93, 84, 90, 61, 92];

const commercialTemplates: {
  id: CommercialTemplateId;
  name: string;
  version: string;
  status: string;
}[] = [
  {
    id: "model-image-repair",
    name: "AI 模特图修正",
    version: "0.3",
    status: "商品一致性、人体真实感与母图可交付性",
  },
  {
    id: "brand-flagship",
    name: "品牌场景表达",
    version: "0.2-demo",
    status: "商品识别、场景关系与品牌克制标准",
  },
];

const profiles = [
  {
    productLabel: "蓝色碎花收腰连衣裙",
    commercial:
      "商品焦点清晰，但腰线与碎花面料卖点表达偏弱，点击动机不足。",
    prompt:
      "保持蓝色碎花连衣裙的领口、袖型、腰线与印花位置不变；修正右袖口缝线与接合方向，使其与商品参考图一致；恢复自然手指间距与拇指支撑关系；减少皮肤过度磨皮，保留真实毛孔与轻微肤质；采用自然手机摄影质感，柔和侧光、真实微颗粒、不过度锐化；强化腰线与碎花面料作为视觉卖点，保持电商主图主体清晰。",
    locked: "主色、碎花位置、领口、长袖、腰线、裙长",
    issues: [
      {
        title: "袖口结构疑似错位",
        skill: "材质真实性",
        severity: "Major" as const,
        observation: "右袖口缝线方向与参考图不一致，接合位置偏移。",
        impact: "可能改变商品结构表达，需要人工核对原始 SKU。",
        rule: "MAT-03 / PF-03",
        marker: { x: 73, y: 43 },
      },
      {
        title: "右手抓握不自然",
        skill: "真人真实性",
        severity: "Major" as const,
        observation: "手指接触关系过紧，拇指姿态缺少自然支撑。",
        impact: "降低人物真实感，但未确认达到阻断级别。",
        rule: "HUM-04 / HI-04",
        marker: { x: 43, y: 61 },
      },
    ],
  },
  {
    productLabel: "黑色吊带修身长裙",
    commercial: "廓形和黑色质感表达清楚，主体突出，已具备高分发布候选条件。",
    prompt:
      "保持黑色吊带长裙的修身廓形、肩带宽度、领口高度和裙长不变；仅轻微恢复皮肤纹理与黑色面料暗部层次，保留自然棚拍光影与真实手机摄影微颗粒；不得改变腰臀比例、裙摆轮廓或增加装饰。",
    locked: "黑色、吊带、修身廓形、领口、裙长",
    issues: [],
  },
  {
    productLabel: "象牙白碎花中长裙",
    commercial: "商品可识别，但花型连续性和裙摆结构错误会直接损害购买判断。",
    prompt:
      "保持象牙白底色、碎花内容、方领和中长裙廓形不变；重新生成裙摆和腰部区域，恢复花型连续性、自然褶皱与真实布料垂坠；禁止改变花型比例、裙长和袖型；使用柔和自然光，避免塑料感和过度锐化。",
    locked: "象牙白底色、碎花、方领、袖型、裙长",
    issues: [
      {
        title: "花型与裙摆结构断裂",
        skill: "材质真实性",
        severity: "Blocker" as const,
        observation: "腰部以下花型出现不连续，裙摆褶皱与缝线无法形成合理结构。",
        impact: "可能误导商品花型和版型，不能进入发布流程。",
        rule: "MAT-01 / PF-02",
        marker: { x: 52, y: 58 },
      },
    ],
  },
  {
    productLabel: "象牙白泡泡袖连衣裙",
    commercial: "画面干净，但姿态和纯白面料层次偏平，属于可优化而非阻断问题。",
    prompt:
      "保持象牙白、方领、泡泡袖、收腰和裙摆长度不变；增加面料高光与阴影层次，恢复泡泡袖的自然体积和细微褶皱；调整人物重心使姿态更自然；保留干净电商主图构图，不增加配饰或背景道具。",
    locked: "象牙白、方领、泡泡袖、收腰、裙长",
    issues: [
      {
        title: "白色面料层次偏平",
        skill: "材质真实性",
        severity: "Major" as const,
        observation: "袖部和裙身明暗变化不足，面料体积与褶皱表达偏弱。",
        impact: "商品质感显得平淡，需要优化后复核。",
        rule: "MAT-04 / GM-04",
        marker: { x: 31, y: 35 },
      },
    ],
  },
  {
    productLabel: "黑色碎花短袖连衣裙",
    commercial: "黑色碎花和腰部廓形形成清晰记忆点，姿态具有展示效率。",
    prompt:
      "保持黑色底、白色碎花、短袖、V 领和收腰廓形不变；仅优化发丝边缘和皮肤微纹理，维持自然站姿、真实棚拍光影和商品主体权重；不得改变碎花密度或裙长。",
    locked: "黑色底、白色碎花、短袖、V 领、裙长",
    issues: [],
  },
  {
    productLabel: "浅蓝色吊带中长裙",
    commercial: "颜色清爽，但裙身材质过度平滑，视觉记忆点和真实感都不足。",
    prompt:
      "保持浅蓝色、细肩带、收腰位置和中长裙长度不变；恢复裙身布料纹理、自然垂坠和细微褶皱，减少塑料般平滑感；增加轻微手机摄影颗粒与自然侧光，强化清爽夏季卖点，不增加装饰。",
    locked: "浅蓝色、细肩带、收腰位置、裙长",
    issues: [
      {
        title: "裙身材质过度平滑",
        skill: "材质真实性",
        severity: "Major" as const,
        observation: "大面积裙身缺少连续纹理与受力褶皱，呈现塑料般平滑感。",
        impact: "降低商品面料可信度和视觉吸引力。",
        rule: "MAT-06 / GM-06",
        marker: { x: 54, y: 55 },
      },
    ],
  },
  {
    productLabel: "象牙白方领短袖上装",
    commercial: "商品轮廓可见，但下摆与手臂接触区域存在结构风险，暂不具备发布条件。",
    prompt:
      "保持象牙白方领上装的领口、短袖、衣长和下摆轮廓不变；重做手臂与衣身接触区域，恢复自然遮挡、袖口边缘和下摆连续性；保留真实棉质纹理和自然站姿；不得改变领型、袖长或增加图案。",
    locked: "象牙白、方领、短袖、衣长、下摆",
    issues: [
      {
        title: "手臂与衣身边缘融合",
        skill: "真人真实性",
        severity: "Blocker" as const,
        observation: "右手臂与上装侧边出现不合理融合，遮挡关系无法成立。",
        impact: "人体和商品结构同时受损，必须重新生成或局部重绘。",
        rule: "HUM-02 / HI-02",
        marker: { x: 67, y: 49 },
      },
    ],
  },
];

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function buildSkillScores(score: number, index: number): SkillScore[] {
  const offsets = [
    [4, -2, -8, -14],
    [2, 1, -1, 3],
    [-8, -5, -13, -4],
    [1, -3, -7, -6],
  ][index % 4];
  return [
    { id: "01", label: "真人真实性", score: clampScore(score + offsets[0]), weight: "25%" },
    { id: "02", label: "摄影真实性", score: clampScore(score + offsets[1]), weight: "20%" },
    { id: "03", label: "材质真实性", score: clampScore(score + offsets[2]), weight: "20%" },
    { id: "04", label: "商品表达效能", score: clampScore(score + offsets[3]), weight: "35%" },
  ];
}

const assets: Asset[] = decisions.map((decision, index) => {
  const profile = profiles[index % profiles.length];
  return {
    id: index + 1,
    src: `/fashion/${imageNames[index % imageNames.length]}`,
    decision,
    score: scores[index],
    productLabel: profile.productLabel,
    skills: buildSkillScores(scores[index], index),
    issues: profile.issues.map((issue, issueIndex) => ({
      ...issue,
      id: String(issueIndex + 1).padStart(2, "0"),
    })),
    commercialAssessment: profile.commercial,
    repairPrompt: profile.prompt,
    lockedAttributes: profile.locked,
  };
});

const commercialMetricLabels = [
  "视觉重心",
  "商品识别效率",
  "关键细节呈现",
  "原商品一致性",
  "真实使用可信度",
  "人群与场景适配",
];

function getCommercialResult(
  asset: Asset,
  templateId: CommercialTemplateId,
): CommercialResult {
  const baseScore =
    asset.skills.find((skill) => skill.id === "04")?.score ?? asset.score;
  const flagshipOffsets = [-12, 4, -7, 8, 5, -9, -4, 7, -6, 3, -8, 6];
  const fitScore =
    templateId === "model-image-repair"
      ? baseScore
      : clampScore(baseScore + flagshipOffsets[asset.id - 1]);
  const metricOffsets =
    templateId === "model-image-repair"
      ? [6, -3, 2, 4, -7, 1]
      : [3, 5, -12, 8, -4, 6];
  const fitLevel = fitScore >= 90 ? "高" : fitScore >= 70 ? "中" : "低";
  const template = commercialTemplates.find((item) => item.id === templateId)!;
  const gaps =
    templateId === "model-image-repair"
      ? ["关键商品细节还不够集中", "原商品一致性需要结合基准图人工确认"]
      : ["场景对商品的支撑关系偏弱", "品牌表达与商品细节需要重新平衡"];
  const strengths =
    templateId === "model-image-repair"
      ? ["视觉重心落在商品主体", "主要轮廓具备识别效率"]
      : ["人物与商品关系清楚", "场景没有覆盖商品主要结构"];

  return {
    templateId,
    templateVersion: template.version,
    templateName: template.name,
    fitScore,
    fitLevel,
    summary:
      templateId === "model-image-repair"
        ? asset.commercialAssessment
        : `相对品牌场景表达标准，${asset.productLabel}的商品识别仍然成立，但场景、人物和关键细节之间需要建立更明确的视觉秩序。`,
    strengths,
    gaps,
    metrics: commercialMetricLabels.map((label, index) => ({
      id: `COM-${String(index + 1).padStart(2, "0")}`,
      label,
      score: clampScore(fitScore + metricOffsets[index]),
    })),
  };
}

function evaluateAsset(
  asset: Asset,
  templateId: CommercialTemplateId,
): EvaluatedAsset {
  const commercial = getCommercialResult(asset, templateId);
  const originalCommercial =
    asset.skills.find((skill) => skill.id === "04")?.score ?? asset.score;
  const score = Math.round(
    asset.score + (commercial.fitScore - originalCommercial) * 0.35,
  );
  const hasBlocker = asset.issues.some((issue) => issue.severity === "Blocker");
  const decision: Decision = hasBlocker
    ? "REJECT"
    : score >= 90
      ? "PASS"
      : score >= 70
        ? "REVIEW"
        : "REJECT";

  return {
    ...asset,
    score,
    decision,
    commercial,
    commercialAssessment: commercial.summary,
    skills: asset.skills.map((skill) =>
      skill.id === "04" ? { ...skill, score: commercial.fitScore } : skill,
    ),
  };
}

function pendingCandidateAsset(
  candidate: BatchCandidate,
  templateId: CommercialTemplateId,
): EvaluatedAsset {
  const template = commercialTemplates.find((item) => item.id === templateId)!;
  return {
    id: candidate.id,
    src: candidate.src,
    decision: "REVIEW",
    score: 0,
    productLabel: candidate.file.name,
    skills: [],
    issues: [],
    commercialAssessment:
      "尚未完成当前 AI 模特草图的问题诊断，不显示示例评分或商业结论。",
    repairPrompt: "",
    lockedAttributes: "",
    commercial: {
      templateId,
      templateVersion: template.version,
      templateName: template.name,
      fitScore: Number.NaN,
      fitLevel: "未评估",
      summary: "等待当前草图的真实问题诊断。",
      strengths: [],
      gaps: [],
      metrics: [],
    },
    scoreAvailable: false,
    diagnosisReady: false,
    promptProvenance: null,
    calibrationStatus: "UNCALIBRATED",
    modelStatus: "NOT_RUN",
    markerAvailable: false,
    fixtureCaseId: candidate.fixtureCaseId,
  };
}

function syntheticTrousersGroundTruthAsset(
  candidate: BatchCandidate,
  templateId: CommercialTemplateId,
): EvaluatedAsset {
  const template = commercialTemplates.find((item) => item.id === templateId)!;
  return {
    id: candidate.id,
    src: candidate.src,
    decision: "REVIEW",
    score: Number.NaN,
    scoreAvailable: false,
    diagnosisReady: true,
    productLabel: candidate.file.name,
    skills: [],
    issues: [
      {
        id: "synthetic-controlled-cargo-pocket",
        title: "裤腿多出翻盖工装口袋",
        skill: "商品一致性",
        severity: "Major",
        observation:
          "画面左侧（模特右腿）大腿外侧出现矩形翻盖工装口袋；商品真值板显示该 SKU 只有两侧斜插袋，不存在工装贴袋。",
        impact: "改变了裤装结构与 SKU 身份，不能直接作为该商品的模特图交付。",
        rule: "只移除错误口袋并恢复连续纵向微褶面料，人物与所有非目标区域保持不变。",
        marker: { x: 29, y: 58 },
      },
    ],
    commercialAssessment:
      "这是合成受控样例的人工预设真值，只验证修正闭环，不代表模型准确率或客户结论。",
    repairPrompt:
      "只移除画面左侧（模特右腿）大腿外侧错误增加的矩形翻盖工装口袋，恢复该区域连续一致的深酒红纵向微褶技术面料。保持同一人物身份、脸部、发型、表情、姿势、手部、白色上衣、黑色抽绳、背景、镜头、画幅、裤子颜色、直筒版型、松紧腰头、原有侧缝口袋、裤脚、鞋和所有非目标区域完全不变。不得裁切、拉近或变成商品特写，不得新增 Logo、文字、促销信息、接缝或其他口袋。",
    lockedAttributes:
      "同一完整模特与全身构图、深酒红颜色、直筒裤型、纵向微褶、松紧腰头、中央黑色抽绳、两侧斜插袋、无工装口袋、无 Logo 与文字、直筒裤脚、白鞋与浅灰背景",
    commercial: {
      templateId,
      templateVersion: template.version,
      templateName: template.name,
      fitScore: Number.NaN,
      fitLevel: "未评估",
      summary:
        "合成内部测试只提供已知结构缺陷，不进行商业分数推断。",
      strengths: [],
      gaps: ["画面左侧（模特右腿）多出商品真值不存在的翻盖工装口袋"],
      metrics: [],
    },
    promptProvenance: "synthetic-ground-truth-v0.1",
    calibrationStatus: "UNCALIBRATED",
    modelStatus: "HUMAN_GROUND_TRUTH",
    markerAvailable: true,
    evaluationMode: "SYNTHETIC_GROUND_TRUTH",
    fixtureCaseId: SYNTHETIC_TROUSERS_CASE_ID,
    persistedEvaluation: false,
    referenceCount: 1,
  };
}

function humanConfirmedIssueAsset(
  candidate: BatchCandidate,
  templateId: CommercialTemplateId,
  category: ManualIssueCategory,
  note: string,
): EvaluatedAsset {
  const template = commercialTemplates.find((item) => item.id === templateId)!;
  const issueText = note.trim();
  const syntheticInternal = isSyntheticRepairLibraryCase(candidate.fixtureCaseId);
  const boundary = inferRepairBoundary(category, issueText, {
    caseId: candidate.fixtureCaseId,
  });
  const repairPrompt = buildBoundaryAwareRepairPrompt(boundary);
  const needsRegeneration = boundary.strategy === "REGENERATE";
  const blocked = boundary.strategy === "BLOCKED";
  return {
    id: candidate.id,
    src: candidate.src,
    decision: needsRegeneration || blocked ? "REJECT" : "REVIEW",
    score: Number.NaN,
    scoreAvailable: false,
    diagnosisReady: true,
    productLabel: candidate.file.name,
    skills: [],
    issues: [
      {
        id: `human-${category}`,
        title: issueText,
        skill: category,
        severity: needsRegeneration || blocked ? "Blocker" : "Major",
        observation: `由用户确认的${category}问题：${issueText}`,
        impact: blocked
          ? "当前证据不足，不能让模型猜测商品事实。"
          : needsRegeneration
            ? "该问题不适合危险局修，应整体重生成后重新复验。"
            : "该问题需要在进入详情页、排版或上架流程前处理，并复验其他已正确区域。",
        rule: `${boundary.strategy} · ${boundary.allowedRegion}；停止条件：${boundary.stopConditions.join("；")}`,
        marker: { x: 50, y: 50 },
      },
    ],
    commercialAssessment:
      "用户已确认一个具体问题，当前没有运行综合评分；后续以修正前后和人工复验作为结果。",
    repairPrompt,
    lockedAttributes: boundary.lockedRegions.join("、"),
    commercial: {
      templateId,
      templateVersion: template.version,
      templateName: template.name,
      fitScore: Number.NaN,
      fitLevel: "未评估",
      summary: "不生成商业评分，以具体问题与修正结果为准。",
      strengths: [],
      gaps: [issueText],
      metrics: [],
    },
    promptProvenance: `${boundary.version} · 用户确认问题 · 智能边界建议待人工确认`,
    calibrationStatus: "UNCALIBRATED",
    modelStatus: `HUMAN_CONFIRMED_${boundary.strategy}`,
    markerAvailable: false,
    evaluationMode: "HUMAN_CONFIRMED_ISSUE",
    fixtureCaseId: candidate.fixtureCaseId,
    persistedEvaluation: false,
    referenceCount: 0,
    evidenceMode: syntheticInternal ? "SYNTHETIC_INTERNAL_TEST_ONLY" : undefined,
    assetOrigin: syntheticInternal ? "IMAGEGEN_SYNTHETIC_INTERNAL" : undefined,
    notRealCustomerEvidence: syntheticInternal || undefined,
    notModelEffectivenessEvidence: syntheticInternal || undefined,
    notCommercialEvidence: syntheticInternal || undefined,
  };
}

function buildApiAsset(
  patch: UiEvaluationPatch,
  options: {
    src?: string;
    productLabel?: string;
    persistedEvaluation?: boolean;
    evaluationMode?:
      | typeof LOCAL_EVALUATION_MODE
      | "LIVE_MODEL_CANARY"
      | "SYNTHETIC_GROUND_TRUTH"
      | "HUMAN_CONFIRMED_ISSUE";
    providerId?: string;
    modelSnapshot?: string;
    providerLatencyMs?: number;
    id?: number;
    referenceCount?: number;
    fixtureCaseId?: string;
  } = {},
): EvaluatedAsset {
  const fixture = assets[0];
  const syntheticInternal = isSyntheticRepairLibraryCase(options.fixtureCaseId);
  return {
    ...fixture,
    id: options.id ?? 1,
    src: options.src ?? "",
    productLabel:
      options.productLabel ?? `正式评估 · ${patch.evaluationId}`,
    score: patch.score ?? Number.NaN,
    scoreAvailable: patch.score !== null,
    diagnosisReady: true,
    decision: patch.decision ?? "REVIEW",
    skills: patch.skills.map((skill) => ({
      ...skill,
      score: skill.score ?? Number.NaN,
    })),
    issues: patch.issues.map((issue, index) => ({
      ...issue,
      marker: { x: 35 + (index % 3) * 15, y: 38 + (index % 4) * 12 },
    })),
    commercial: {
      ...patch.commercial,
      fitScore: patch.commercial.fitScore ?? Number.NaN,
      fitLevel: patch.commercial.fitLevel,
      metrics: patch.commercial.metrics.map((metric) => ({
        ...metric,
        score: metric.score ?? Number.NaN,
      })),
    },
    commercialAssessment: patch.commercial.summary,
    repairPrompt:
      patch.repairPrompt ?? "当前正式评估没有生成可执行修复 Prompt，需人工处理。",
    lockedAttributes: patch.lockedAttributes.join("、") || "未提供",
    evaluationId: patch.evaluationId,
    resultVersion: patch.resultVersion,
    promptProvenance: patch.promptProvenance,
    calibrationStatus: patch.calibrationStatus,
    modelStatus: patch.modelStatus,
    markerAvailable: false,
    persistedEvaluation: options.persistedEvaluation ?? true,
    evaluationMode: options.evaluationMode,
    providerId: options.providerId,
    modelSnapshot: options.modelSnapshot,
    providerLatencyMs: options.providerLatencyMs,
    referenceCount: options.referenceCount,
    fixtureCaseId: options.fixtureCaseId,
    evidenceMode: syntheticInternal ? "SYNTHETIC_INTERNAL_TEST_ONLY" : undefined,
    assetOrigin: syntheticInternal ? "IMAGEGEN_SYNTHETIC_INTERNAL" : undefined,
    notRealCustomerEvidence: syntheticInternal || undefined,
    notModelEffectivenessEvidence: syntheticInternal || undefined,
    notCommercialEvidence: syntheticInternal || undefined,
  };
}

const statusClass = (decision: Decision) => decision.toLowerCase();

const displayDecision = (decision: Decision) =>
  decision === "PASS"
    ? "PASS"
    : decision === "REVIEW"
      ? "REWORK"
      : "REGENERATE";

function Status({ value }: { value: Decision }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`status-dot ${statusClass(value)}`} aria-hidden="true" />
      <span>{displayDecision(value)}</span>
    </span>
  );
}

function DataStateNotice({ state }: { state: DataState }) {
  if (state.kind === "fixture") {
    return (
      <div className="data-state-notice">
        当前打开的是示例项目，用于体验问题定位、证据和修正 Prompt。上传自己的 AI 模特草图后，
        示例结果不会进入真实修正任务。
      </div>
    );
  }
  if (state.kind === "loading") {
    return (
      <div className="data-state-notice loading" aria-live="polite">
        正在读取评估 {state.evaluationId}，完成前不会显示其他项目结果。
      </div>
    );
  }
  if (state.kind === "live-loading") {
    return (
      <div className="data-state-notice loading" aria-live="polite">
        正在分析 {state.candidateName}。图片会发送至阿里云百炼；服务端不留存原图，本机项目会保存当前工作集。
      </div>
    );
  }
  if (state.kind === "live-error") {
    if (state.errorCode === "LIVE_MODEL_TIMEOUT") {
      return (
        <div className="data-state-notice error" role="alert">
          <strong>模型响应超时，未形成商品结论。</strong>{" "}
          系统已等待 3 分钟并保留当前图片；这属于技术失败，不代表商品图不合格。
          {state.requestId ? ` 请求记录 ${state.requestId.slice(0, 8)}。` : ""}
          如需重试，请重新确认本次发送授权。
        </div>
      );
    }
    return (
      <div className="data-state-notice error" role="alert">
        {state.candidateName} 未形成有效诊断：{state.message}。未完成图片仍保留在当前任务中；
        再次外发前需要重新确认授权、剩余次数与预算。
      </div>
    );
  }
  if (state.kind === "local") {
    return (
      <div className="data-state-notice local" role="status">
        已载入 {state.candidateName}。AI 模特草图正在本机等待，尚未发送到模型，也没有生成诊断结论。
        确认商品真值和发送授权后即可开始分析。
      </div>
    );
  }
  if (state.kind === "synthetic-ground-truth") {
    return (
      <div className="data-state-notice real" role="status">
        已载入合成受控样例 {state.caseId} 的人工预设真值。该结论只用于验证修正闭环，
        不是模型诊断、客户证据或准确率证据。
      </div>
    );
  }
  if (state.kind === "synthetic-library") {
    return (
      <div className="data-state-notice local" role="status">
        合成试用案例 {state.caseId}，不是客户或商业证据。
      </div>
    );
  }
  if (state.kind === "human-confirmed") {
    return (
      <div className="data-state-notice real" role="status">
        {state.evidenceMode
          ? `已确认合成案例 ${state.fixtureCaseId ?? ""} 的问题，不是模型或客户证据。`
          : `已确认 ${state.candidateName} 的问题，等待修正。`}
      </div>
    );
  }
  if (state.kind === "fallback") {
    return (
      <div className="data-state-notice error" role="alert">
        评估 {state.evaluationId} 暂时无法读取：{state.message}。请稍后重试或返回示例项目。
      </div>
    );
  }
  if (state.kind === "live") {
    return (
      <div className="data-state-notice real">
        AI 问题诊断已完成 · {state.modelSnapshot} · 最近一张耗时{" "}
        {(state.latencyMs / 1000).toFixed(1)} 秒。系统已生成问题证据、修正建议与 Prompt；
        最终决定仍需人工确认。
      </div>
    );
  }
  return (
    <div className="data-state-notice real">
      已读取评估 {state.evaluationId}。缺失的资产预览或证据位置保持未提供，不使用示例内容补齐。
    </div>
  );
}

function SafeImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={`${alt}，预览不可用`}
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          placeItems: "center",
          background: "#e7e8ea",
          color: "#686c74",
          fontSize: "0.75rem",
        }}
      >
        预览未提供
      </div>
    );
  }
  // Prototype assets are served locally; production image optimization is intentionally deferred.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} onError={() => setFailed(true)} />;
}

type WorkspaceProps = {
  initialAccount: TrialAccountSession;
};

export function Workspace({ initialAccount }: WorkspaceProps) {
  return (
    <WorkspaceWorkbench
      account={initialAccount}
      onLogout={async () => {
        const response = await fetch("/api/trial-auth/logout", { method: "POST" });
        if (response.ok) window.location.assign("/login");
      }}
    />
  );
}

function WorkspaceWorkbench({
  account,
  onLogout,
}: {
  account: TrialAccountSession;
  onLogout: () => void;
}) {
  configureProjectStorageScope(account.storageScope);
  const previewOpen = true;
  const [area, setArea] = useState<WorkspaceArea>("overview");
  const [view, setView] = useState<View>("grid");
  const [commercialTemplateId, setCommercialTemplateId] =
    useState<CommercialTemplateId>("model-image-repair");
  const [selectedId, setSelectedId] = useState(1);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<Decision>("REJECT");
  const [toast, setToast] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [apiAsset, setApiAsset] = useState<EvaluatedAsset | null>(null);
  const [dataState, setDataState] = useState<DataState>({ kind: "fixture" });
  const [localCandidate, setLocalCandidate] = useState<LocalCandidate | null>(
    null,
  );
  const [intakeState, setIntakeState] = useState<IntakeState>({ kind: "idle" });
  const [submissionContext, setSubmissionContext] = useState<SubmissionContext>({
    channel: "天猫",
    placement: "AI模特图",
    referenceStatus: "complete",
    provenanceStatus: "confirmed_ai",
  });
  const [promptCopyCount, setPromptCopyCount] = useState(0);
  const [liveCapability, setLiveCapability] =
    useState<LiveModelCapability | null>(null);
  const [liveConsent, setLiveConsent] = useState(false);
  const [liveRunning, setLiveRunning] = useState(false);
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [customerProfile, setCustomerProfile] =
    useState<CustomerProfileInput>(defaultCustomerProfile);
  const [batchCandidates, setBatchCandidates] = useState<BatchCandidate[]>([]);
  const [repairOutputFile, setRepairOutputFile] = useState<File | null>(null);
  const [repairSourceAssetId, setRepairSourceAssetId] = useState<number | null>(null);
  const [repairChecks, setRepairChecks] = useState<string[]>([]);
  const [upscaleOutputFile, setUpscaleOutputFile] = useState<File | null>(null);
  const [upscaleReceipt, setUpscaleReceipt] =
    useState<UpscaleJobReceipt | null>(null);
  const [repairProviderJob, setRepairProviderJob] =
    useState<RepairProviderJobSnapshot | null>(null);
  const [projectRecord, setProjectRecord] =
    useState<VisionQaProjectRecord<WorkspaceProjectPayload> | null>(null);
  const [projectEvents, setProjectEvents] = useState<VisionQaProjectAuditEvent[]>([]);
  const [projectPersistence, setProjectPersistence] =
    useState<ProjectPersistenceState>({ kind: "idle" });
  const localObjectUrl = useRef<string | null>(null);
  const candidateFileRef = useRef<File | null>(null);
  const batchCandidatesRef = useRef<BatchCandidate[]>([]);
  const projectRecordRef =
    useRef<VisionQaProjectRecord<WorkspaceProjectPayload> | null>(null);
  const projectInitializedRef = useRef(false);
  const lastSavedSignatureRef = useRef("");
  const projectSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const projectPayload = useMemo(
    () =>
      buildWorkspaceProjectPayload({
        area,
        view,
        commercialTemplateId,
        selectedId,
        auditEntries,
        dataState,
        localCandidate,
        intakeState,
        submissionContext,
        promptCopyCount,
        customerProfile,
        referenceFiles,
        batchCandidates,
        repairOutputFile,
        repairSourceAssetId,
        repairChecks,
        upscaleOutputFile,
        upscaleReceipt,
        repairProviderJob,
      }),
    [
      area,
      view,
      commercialTemplateId,
      selectedId,
      auditEntries,
      dataState,
      localCandidate,
      intakeState,
      submissionContext,
      promptCopyCount,
      customerProfile,
      referenceFiles,
      batchCandidates,
      repairOutputFile,
      repairSourceAssetId,
      repairChecks,
      upscaleOutputFile,
      upscaleReceipt,
      repairProviderJob,
    ],
  );
  const projectAssets = useMemo(
    () =>
      buildProjectAssets(
        referenceFiles,
        batchCandidates,
        repairOutputFile,
        upscaleOutputFile,
      ),
    [referenceFiles, batchCandidates, repairOutputFile, upscaleOutputFile],
  );
  const projectCounts = useMemo(
    () => projectMaterialCounts(referenceFiles, batchCandidates, auditEntries),
    [referenceFiles, batchCandidates, auditEntries],
  );
  const projectSignature = useMemo(
    () => projectContentSignature(projectPayload, projectAssets),
    [projectPayload, projectAssets],
  );
  useEffect(() => {
    batchCandidatesRef.current = batchCandidates;
  }, [batchCandidates]);

  const evaluatedAssets = useMemo(
    () => {
      const batchAssets = batchCandidates.map((item) =>
        item.result ?? pendingCandidateAsset(item, commercialTemplateId),
      );
      return batchAssets.length > 0
        ? batchAssets
        : apiAsset
        ? [apiAsset]
        : assets.map((asset) => evaluateAsset(asset, commercialTemplateId));
    },
    [apiAsset, batchCandidates, commercialTemplateId],
  );
  const selected =
    evaluatedAssets.find((asset) => asset.id === selectedId) ??
    evaluatedAssets[0];
  const batchResultCount = batchCandidates.filter((item) => item.result).length;

  useEffect(() => {
    const evaluationId = new URLSearchParams(window.location.search).get(
      "evaluation_id",
    );
    if (!evaluationId) return;

    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setDataState({ kind: "loading", evaluationId });
      }
    });
    getFormalEvaluation(evaluationId, controller.signal)
      .then((patch) => {
        setApiAsset(buildApiAsset(patch));
        setSelectedId(1);
        setDataState({ kind: "real", evaluationId });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof VisionQaApiError
            ? `${error.code}：${error.message}`
            : "正式评估读取失败";
        setApiAsset(null);
        setDataState({ kind: "fallback", evaluationId, message });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    getLiveModelCapability()
      .then((capability) => {
        if (active) setLiveCapability(capability);
      })
      .catch(() => {
        if (active) setLiveCapability(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (localObjectUrl.current) URL.revokeObjectURL(localObjectUrl.current);
      batchCandidatesRef.current.forEach((candidate) =>
        URL.revokeObjectURL(candidate.src),
      );
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (overrideOpen || area !== "review") return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        setSelectedId((current) => (current % evaluatedAssets.length) + 1);
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        setSelectedId((current) =>
          current === 1 ? evaluatedAssets.length : current - 1,
        );
      }
      if (event.key === "Enter") setView("evidence");
      if (event.key === "Escape") setView("grid");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [area, evaluatedAssets.length, overrideOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored =
          window.localStorage.getItem(LOCAL_FEEDBACK_STORAGE_KEY) ??
          window.localStorage.getItem("visionqa-demo-audit");
        if (stored) setAuditEntries(JSON.parse(stored) as AuditEntry[]);
      } catch {
        // Corrupted demo audit data is ignored; a new record replaces it on save.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!previewOpen || projectInitializedRef.current) return;
    projectInitializedRef.current = true;
    setProjectPersistence({ kind: "loading" });

    const initializeProject = async () => {
      try {
        const loaded = await loadLatestLocalProject<WorkspaceProjectPayload>();
        if (loaded) {
          if (!isWorkspaceProjectPayload(loaded.project.payload)) {
            throw new Error("本机项目使用了当前版本不支持的内容契约。");
          }
          const payload = loaded.project.payload;
          const assetMap = new Map(
            loaded.assets.map((asset) => [logicalAssetId(asset), asset]),
          );
          const restoredReferences = payload.referenceAssetIds.flatMap((assetId) => {
            const asset = assetMap.get(assetId);
            return asset?.file instanceof File ? [asset.file] : [];
          });
          const restoredCandidates = payload.batchCandidates.flatMap(
            (candidate): BatchCandidate[] => {
              const asset = assetMap.get(candidate.assetId);
              if (!asset || !(asset.file instanceof File)) return [];
              const src = URL.createObjectURL(asset.file);
              return [
                {
                  id: candidate.id,
                  file: asset.file,
                  src,
                  sha256: candidate.sha256,
                  traceId: candidate.traceId,
                  fixtureCaseId: candidate.fixtureCaseId,
                  status: candidate.status,
                  selected: candidate.selected,
                  result: candidate.result
                    ? { ...candidate.result, src }
                    : undefined,
                  error: candidate.error?.startsWith("LIVE_MODEL_TIMEOUT")
                    ? "LIVE_MODEL_TIMEOUT：历史调用发生技术超时，没有形成商品结论；不代表商品图不合格。"
                    : candidate.error,
                  lastAttempt: candidate.lastAttempt,
                },
              ];
            },
          );
          const restoredRepair = payload.repairSession;
          const restoredRepairOutput = restoredRepair?.outputAssetId
            ? assetMap.get(restoredRepair.outputAssetId)?.file
            : null;
          const restoredUpscaleOutput = restoredRepair?.upscaleAssetId
            ? assetMap.get(restoredRepair.upscaleAssetId)?.file
            : null;
          const restoredAssetInputs: ProjectAssetInput[] = loaded.assets.map(
            (asset) => ({
              assetId: logicalAssetId(asset),
              role: asset.role,
              position: asset.position,
              fileName: asset.fileName,
              mimeType: asset.mimeType,
              byteSize: asset.byteSize,
              lastModified: asset.lastModified,
              sha256: asset.sha256,
              file: asset.file,
            }),
          );

          setArea(payload.area === "delivery" ? "repair" : payload.area);
          setView(payload.view);
          setCommercialTemplateId(
            payload.commercialTemplateId === "brand-flagship"
              ? "brand-flagship"
              : "model-image-repair",
          );
          setSelectedId(payload.selectedId);
          setAuditEntries(payload.auditEntries);
          setApiAsset(null);
          const restoredTimeout = restoredCandidates.find((candidate) =>
            candidate.error?.startsWith("LIVE_MODEL_TIMEOUT"),
          );
          setDataState(
            payload.dataState.kind === "live-error" && restoredTimeout
              ? {
                  ...payload.dataState,
                  message: "历史调用发生技术超时，没有形成商品结论",
                  errorCode: "LIVE_MODEL_TIMEOUT",
                  requestId: restoredTimeout.lastAttempt?.requestId ?? null,
                }
              : payload.dataState,
          );
          setLocalCandidate(payload.localCandidate);
          setIntakeState(payload.intakeState);
          setSubmissionContext(payload.submissionContext);
          setPromptCopyCount(payload.promptCopyCount);
          setCustomerProfile(payload.customerProfile);
          setReferenceFiles(restoredReferences);
          setBatchCandidates(restoredCandidates);
          setRepairOutputFile(
            restoredRepairOutput instanceof File ? restoredRepairOutput : null,
          );
          setRepairSourceAssetId(restoredRepair?.sourceAssetId ?? null);
          setRepairChecks(restoredRepair?.humanChecks ?? []);
          setUpscaleOutputFile(
            restoredUpscaleOutput instanceof File ? restoredUpscaleOutput : null,
          );
          setUpscaleReceipt(restoredRepair?.upscaleReceipt ?? null);
          setRepairProviderJob(restoredRepair?.providerJob ?? null);
          setLiveConsent(false);
          setLiveRunning(false);
          candidateFileRef.current = restoredCandidates[0]?.file ?? null;
          projectRecordRef.current = loaded.project;
          setProjectRecord(loaded.project);
          lastSavedSignatureRef.current = projectContentSignature(
            payload,
            restoredAssetInputs,
          );
          const restoreEvent = await appendProjectRestoreEvent(loaded.project);
          setProjectEvents([...loaded.events, restoreEvent]);
          setProjectPersistence({
            kind: "saved",
            revision: loaded.project.revision,
            updatedAt: loaded.project.updatedAt,
          });
          return;
        }

        const snapshot = {
          payload: projectPayload,
          assets: projectAssets,
          counts: projectCounts,
          signature: projectSignature,
        };
        const dateLabel = new Intl.DateTimeFormat("zh-CN", {
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        const created = await createLocalProject({
          projectName: `本机服饰项目 · ${dateLabel}`,
          stage: snapshot.payload.area,
          payload: snapshot.payload,
          materialCounts: snapshot.counts,
          assets: snapshot.assets,
        });
        projectRecordRef.current = created.project;
        setProjectRecord(created.project);
        setProjectEvents(created.events);
        lastSavedSignatureRef.current = snapshot.signature;
        setProjectPersistence({
          kind: "saved",
          revision: created.project.revision,
          updatedAt: created.project.updatedAt,
        });
      } catch (error) {
        projectInitializedRef.current = false;
        setProjectPersistence({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "本机项目初始化失败，请检查浏览器存储权限。",
        });
      }
    };

    void initializeProject();
  }, [
    previewOpen,
    projectAssets,
    projectCounts,
    projectPayload,
    projectSignature,
  ]);

  useEffect(() => {
    if (
      !previewOpen ||
      !projectRecordRef.current ||
      projectSignature === lastSavedSignatureRef.current
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      const payload = projectPayload;
      const assets = projectAssets;
      const counts = projectCounts;
      const signature = projectSignature;
      const currentRevision = projectRecordRef.current?.revision ?? 0;
      setProjectPersistence({ kind: "saving", revision: currentRevision });
      projectSaveQueueRef.current = projectSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const current = projectRecordRef.current;
          if (!current || signature === lastSavedSignatureRef.current) return;
          try {
            const saved = await saveLocalProject({
              projectId: current.projectId,
              expectedRevision: current.revision,
              projectName: current.projectName,
              stage: payload.area,
              payload,
              materialCounts: counts,
              assets,
            });
            projectRecordRef.current = saved.project;
            setProjectRecord(saved.project);
            setProjectEvents(saved.events);
            lastSavedSignatureRef.current = signature;
            setProjectPersistence({
              kind: "saved",
              revision: saved.project.revision,
              updatedAt: saved.project.updatedAt,
            });
          } catch (error) {
            setProjectPersistence({
              kind: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "本机自动保存失败。",
            });
          }
        });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [
    previewOpen,
    projectAssets,
    projectCounts,
    projectPayload,
    projectSignature,
  ]);

  const loadBatchCandidates = async (files: File[]) => {
    if (files.length === 0) {
      setIntakeState({ kind: "error", message: "尚未选择候选图。" });
      return;
    }
    const limit = Math.min(3, liveCapability?.maxTotalRequests ?? 3);
    const limited = files.slice(0, limit);
    const invalid = limited.find((file) => !validateLocalCandidate(file).ok);
    if (invalid) {
      setIntakeState({
        kind: "error",
        message: `${invalid.name} 不是有效图片，或超过 10 MB。`,
      });
      return;
    }
    setIntakeState({ kind: "processing", candidateName: `${limited.length} 张图片` });
    try {
      batchCandidates.forEach((item) => URL.revokeObjectURL(item.src));
      const prepared = await Promise.all(
        limited.map(async (file, index): Promise<BatchCandidate> => {
          const sha256 = await sha256Blob(file);
          const fixtureIndex = fixtureIndexFromSha256(sha256, assets.length);
          return {
            id: index + 1,
            file,
            src: URL.createObjectURL(file),
            sha256,
            traceId: candidateTraceId(sha256),
            fixtureCaseId: `fixture-${String(fixtureIndex + 1).padStart(3, "0")}`,
            status: "ready",
            selected: true,
          };
        }),
      );
      setBatchCandidates(prepared);
      setRepairOutputFile(null);
      setRepairSourceAssetId(null);
      setRepairChecks([]);
      setUpscaleOutputFile(null);
      setUpscaleReceipt(null);
      setRepairProviderJob(null);
      const first = prepared[0];
      candidateFileRef.current = first.file;
      setApiAsset(null);
      setLocalCandidate({
        name: first.file.name,
        size: first.file.size,
        sha256: first.sha256,
        traceId: first.traceId,
        fixtureCaseId: first.fixtureCaseId,
        submissionContext,
        reviewStartedAt: new Date().toISOString(),
      });
      setSelectedId(1);
      setView("grid");
      setLiveConsent(false);
      setDataState({
        kind: "local",
        candidateName: `批次 ${prepared.length} 张图片`,
        candidateTraceId: first.traceId,
        fixtureCaseId: first.fixtureCaseId,
      });
      setIntakeState({ kind: "ready" });
      if (files.length > limited.length) {
        setToast(`当前套餐每批最多 ${limited.length} 张，其余图片未加入队列。`);
      }
    } catch {
      setIntakeState({ kind: "error", message: "浏览器无法建立批次预览，请重新选择图片。" });
    }
  };

  const restoreFixtureBatch = () => {
    if (localObjectUrl.current) {
      URL.revokeObjectURL(localObjectUrl.current);
      localObjectUrl.current = null;
    }
    setApiAsset(null);
    batchCandidates.forEach((item) => URL.revokeObjectURL(item.src));
    setBatchCandidates([]);
    setRepairOutputFile(null);
    setRepairSourceAssetId(null);
    setRepairChecks([]);
    setUpscaleOutputFile(null);
    setUpscaleReceipt(null);
    setRepairProviderJob(null);
    setLocalCandidate(null);
    candidateFileRef.current = null;
    setLiveConsent(false);
    setSelectedId(1);
    setDataState({ kind: "fixture" });
    setIntakeState({ kind: "idle" });
  };

  const loadCardiganExperienceCase = async (
    mode: "start" | "complete",
  ) => {
    setIntakeState({ kind: "processing", candidateName: "开衫体验案例" });
    try {
      const [truthFile, candidateFile, repairedFile] = await Promise.all([
        publicImageFile("/fashion/demo-cardigan-truth.png", "product-truth-grid.png"),
        publicImageFile("/fashion/demo-cardigan-defect.png", "ai-model-draft-controlled-defect.png"),
        publicImageFile("/fashion/demo-cardigan-repaired.png", "qwen3-repair-candidate-v0.1.png"),
      ]);
      batchCandidates.forEach((item) => URL.revokeObjectURL(item.src));
      const sha256 = await sha256Blob(candidateFile);
      const candidate: BatchCandidate = {
        id: 1,
        file: candidateFile,
        src: URL.createObjectURL(candidateFile),
        sha256,
        traceId: candidateTraceId(sha256),
        fixtureCaseId: CARDIGAN_EXPERIENCE_CASE_ID,
        status: "ready",
        selected: true,
      };
      const result = mode === "complete"
        ? humanConfirmedIssueAsset(
            candidate,
            commercialTemplateId,
            "印花／胶印／刺绣",
            CARDIGAN_EXPERIENCE_ISSUE,
          )
        : undefined;
      const readyCandidate = result
        ? { ...candidate, status: "done" as const, result }
        : candidate;
      setReferenceFiles([truthFile]);
      setCustomerProfile((current) => ({
        ...current,
        styles: ["简约通勤"],
        priceMin: "199",
        priceMax: "399",
        audiences: ["都市白领", "通勤女性"],
        skuFacts: [
          "暖浅灰细罗纹针织圆领长袖短款开衫",
          "前襟恰好四颗哑光深灰纽扣",
          "正确刺绣恰好一枚，位于穿着者左胸（画面右侧）",
          "穿着者右胸（画面左侧）无刺绣或装饰",
          "无口袋、无拉链、无品牌文字",
        ],
      }));
      setBatchCandidates([readyCandidate]);
      candidateFileRef.current = candidateFile;
      setLocalCandidate({
        name: candidateFile.name,
        size: candidateFile.size,
        sha256,
        traceId: candidate.traceId,
        fixtureCaseId: CARDIGAN_EXPERIENCE_CASE_ID,
        submissionContext,
        reviewStartedAt: new Date().toISOString(),
      });
      setApiAsset(result ?? null);
      setSelectedId(candidate.id);
      setView("grid");
      setLiveConsent(false);
      setRepairProviderJob(null);
      setRepairChecks([]);
      setUpscaleOutputFile(null);
      setUpscaleReceipt(null);
      if (mode === "complete" && result) {
        setDataState({ kind: "human-confirmed", candidateName: candidateFile.name });
        setRepairOutputFile(repairedFile);
        setRepairSourceAssetId(candidate.id);
        setArea("repair");
        setToast("已载入完整开衫案例；可直接检查修改前后并完成人工复验。");
      } else {
        setDataState({
          kind: "local",
          candidateName: candidateFile.name,
          candidateTraceId: candidate.traceId,
          fixtureCaseId: CARDIGAN_EXPERIENCE_CASE_ID,
        });
        setRepairOutputFile(null);
        setRepairSourceAssetId(null);
        setArea("review");
        setToast("已载入开衫案例；可以直接确认问题，或勾选授权运行 AI 诊断。");
      }
      setIntakeState({ kind: "ready" });
      window.setTimeout(() => setToast(null), 4200);
    } catch (error) {
      setIntakeState({
        kind: "error",
        message: error instanceof Error ? error.message : "本地体验案例载入失败。",
      });
    }
  };

  const loadSyntheticRepairCase = async (
    caseId: (typeof SYNTHETIC_REPAIR_CASES)[number]["id"],
  ) => {
    const selectedCase = SYNTHETIC_REPAIR_CASES.find((item) => item.id === caseId);
    if (!selectedCase) return;
    setIntakeState({ kind: "processing", candidateName: selectedCase.label });
    try {
      const [truthFile, candidateFile] = await Promise.all([
        publicImageFile("/fashion/repair-library/product-truth-grid.png", "product-truth-grid.png"),
        publicImageFile(`/fashion/repair-library/${selectedCase.file}`, selectedCase.file),
      ]);
      batchCandidates.forEach((item) => URL.revokeObjectURL(item.src));
      const sha256 = await sha256Blob(candidateFile);
      if (sha256 !== selectedCase.sha256) {
        throw new Error(`合成案例 ${selectedCase.id} 文件哈希与冻结登记不一致，已停止载入。`);
      }
      const candidate: BatchCandidate = {
        id: 1,
        file: candidateFile,
        src: URL.createObjectURL(candidateFile),
        sha256,
        traceId: candidateTraceId(sha256),
        fixtureCaseId: selectedCase.id,
        status: "ready",
        selected: true,
      };
      setReferenceFiles([truthFile]);
      setCustomerProfile((current) => ({
        ...current,
        styles: ["简约通勤"],
        priceMin: "199",
        priceMax: "399",
        audiences: ["都市白领", "通勤女性"],
        skuFacts: [
          "暖浅灰细罗纹圆领长袖短款开衫",
          "前襟恰好四颗哑光深灰纽扣",
          "正确刺绣恰好一枚，位于穿着者左胸（画面右侧）",
          "穿着者右胸（画面左侧）无刺绣或装饰",
          "无口袋、无拉链、无品牌文字",
        ],
      }));
      setBatchCandidates([candidate]);
      candidateFileRef.current = candidateFile;
      setLocalCandidate({
        name: candidateFile.name,
        size: candidateFile.size,
        sha256,
        traceId: candidate.traceId,
        fixtureCaseId: selectedCase.id,
        submissionContext,
        reviewStartedAt: new Date().toISOString(),
      });
      setApiAsset(null);
      setSelectedId(candidate.id);
      setView("grid");
      setLiveConsent(false);
      setRepairOutputFile(null);
      setRepairSourceAssetId(null);
      setRepairProviderJob(null);
      setRepairChecks([]);
      setUpscaleOutputFile(null);
      setUpscaleReceipt(null);
      setDataState({
        kind: "synthetic-library",
        candidateName: candidateFile.name,
        caseId: selectedCase.id,
      });
      setArea("review");
      setIntakeState({ kind: "ready" });
      setToast(`已载入 ${selectedCase.label}；可让 AI 识别，也可直接描述问题。预期路由：${selectedCase.strategyLabel}。`);
      window.setTimeout(() => setToast(null), 5200);
    } catch (error) {
      setIntakeState({
        kind: "error",
        message: error instanceof Error ? error.message : "合成案例载入失败。",
      });
    }
  };

  const syntheticGroundTruthEligible =
    isSyntheticTrousersGroundTruthEligible({
      candidateCount: batchCandidates.length,
      candidateSha256: batchCandidates[0]?.sha256,
      referenceFileNames: referenceFiles.map((file) => file.name),
    });

  const loadSyntheticGroundTruth = () => {
    if (!syntheticGroundTruthEligible) {
      setToast("当前素材不是已登记的合成受控样例，不能载入测试真值。");
      return;
    }
    const candidate = batchCandidates[0];
    const result = syntheticTrousersGroundTruthAsset(
      candidate,
      commercialTemplateId,
    );
    setBatchCandidates((current) =>
      current.map((item) =>
        item.id === candidate.id
          ? { ...item, status: "done", result, error: undefined }
          : item,
      ),
    );
    setApiAsset(result);
    setSelectedId(candidate.id);
    setDataState({
      kind: "synthetic-ground-truth",
      caseId: SYNTHETIC_TROUSERS_CASE_ID,
    });
    setToast("已载入合成样例人工真值；这不是模型诊断结果。");
  };

  const confirmManualIssue = (
    category: ManualIssueCategory,
    note: string,
  ) => {
    const candidate =
      batchCandidates.find((item) => item.selected) ?? batchCandidates[0];
    if (!candidate || note.trim().length < 4) {
      setToast("请先选择一张图片，并写清楚需要修正的具体问题。");
      return;
    }
    const result = humanConfirmedIssueAsset(
      candidate,
      commercialTemplateId,
      category,
      note,
    );
    setBatchCandidates((current) =>
      current.map((item) =>
        item.id === candidate.id
          ? { ...item, status: "done", result, error: undefined }
          : item,
      ),
    );
    setApiAsset(result);
    setSelectedId(candidate.id);
    setDataState({
      kind: "human-confirmed",
      candidateName: candidate.file.name,
      evidenceMode: isSyntheticRepairLibraryCase(candidate.fixtureCaseId)
        ? "SYNTHETIC_INTERNAL_TEST_ONLY"
        : undefined,
      fixtureCaseId: candidate.fixtureCaseId,
    });
    setToast("具体问题已记录，可以进入修正与前后复验。");
  };

  const runLiveEvaluation = async () => {
    const file = candidateFileRef.current;
    if (!file || !localCandidate) {
      setToast("请先选择一批候选图。");
      return;
    }
    if (!liveConsent) {
      setToast("请先确认当前图片可以发送至阿里云百炼。");
      return;
    }
    if (!liveCapability?.configured) {
      setToast("AI 评分服务尚未配置，请联系管理员。");
      return;
    }

    const queue = batchCandidates.length > 0
      ? batchCandidates.filter((item) => item.status !== "done")
      : [{
          id: 1,
          file,
          src: localObjectUrl.current ?? "",
          sha256: localCandidate.sha256,
          traceId: localCandidate.traceId,
          fixtureCaseId: localCandidate.fixtureCaseId,
          status: "ready" as const,
          selected: true,
        }];
    setLiveRunning(true);
    setDataState({ kind: "live-loading", candidateName: `${queue.length} 张候选图` });
    try {
      let lastResult: EvaluatedAsset | null = null;
      let lastFailure: {
        code: string;
        message: string;
        requestId: string | null;
      } | null = null;
      let completed = 0;
      for (const item of queue) {
        const requestId = crypto.randomUUID();
        const startedAt = new Date().toISOString();
        const startedAtMs = Date.now();
        setBatchCandidates((current) => current.map((candidate) =>
          candidate.id === item.id
            ? {
                ...candidate,
                status: "running",
                error: undefined,
                lastAttempt: {
                  requestId,
                  status: "RUNNING",
                  startedAt,
                  finishedAt: null,
                  elapsedMs: null,
                  errorCode: null,
                  retryable: false,
                  providerRequestId: null,
                  inputTokens: null,
                  outputTokens: null,
                },
              }
            : candidate,
        ));
        try {
          const live = await evaluateLiveCandidate({
            file: item.file,
            references: referenceFiles,
            customerProfile,
            channel: submissionContext.channel,
            placement: submissionContext.placement,
            referenceStatus: referenceFiles.length > 0 ? "complete" : "missing",
            provenanceStatus: submissionContext.provenanceStatus,
            commercialTemplateId,
            requestId,
          });
          const result = buildApiAsset(live.patch, {
            id: item.id,
            src: item.src,
            productLabel: item.file.name,
            persistedEvaluation: false,
            evaluationMode: "LIVE_MODEL_CANARY",
            providerId: live.provider.providerId,
            modelSnapshot: live.provider.modelSnapshot,
            providerLatencyMs: live.provider.latencyMs,
            referenceCount: referenceFiles.length,
            fixtureCaseId: item.fixtureCaseId,
          });
          lastResult = result;
          completed += 1;
          setBatchCandidates((current) => current.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  status: "done",
                  result,
                  traceId: live.candidateTraceId,
                  lastAttempt: {
                    requestId: live.requestId,
                    status: "SUCCEEDED",
                    startedAt,
                    finishedAt: new Date().toISOString(),
                    elapsedMs: Date.now() - startedAtMs,
                    errorCode: null,
                    retryable: false,
                    providerRequestId: live.provider.providerRequestId,
                    inputTokens: live.provider.usage.inputTokens,
                    outputTokens: live.provider.usage.outputTokens,
                  },
                }
              : candidate,
          ));
          setApiAsset(result);
          setSelectedId(item.id);
        } catch (error) {
          const apiError = error instanceof VisionQaApiError ? error : null;
          const code = apiError?.code ?? "LIVE_MODEL_FAILED";
          const resolvedRequestId = apiError?.requestId ?? requestId;
          const message = apiError
            ? `${apiError.code}：${apiError.message}`
            : "LIVE_MODEL_FAILED：真实模型分析失败，本次没有形成商品结论。";
          lastFailure = {
            code,
            message: apiError?.message ?? "真实模型分析失败，本次没有形成商品结论。",
            requestId: resolvedRequestId,
          };
          setBatchCandidates((current) => current.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  status: "error",
                  error: message,
                  lastAttempt: {
                    requestId: resolvedRequestId,
                    status: code === "LIVE_MODEL_TIMEOUT" ? "TIMEOUT" : "FAILED",
                    startedAt,
                    finishedAt: new Date().toISOString(),
                    elapsedMs: Date.now() - startedAtMs,
                    errorCode: code,
                    retryable: apiError?.retryable ?? false,
                    providerRequestId: null,
                    inputTokens: null,
                    outputTokens: null,
                  },
                }
              : candidate,
          ));
        }
      }
      setView("grid");
      if (lastResult) {
        setDataState({
          kind: "live",
          evaluationId: lastResult.evaluationId ?? "live_batch",
          providerId: lastResult.providerId ?? liveCapability.providerId,
          modelSnapshot: lastResult.modelSnapshot ?? liveCapability.modelSnapshot,
          latencyMs: lastResult.providerLatencyMs ?? 0,
        });
        setToast(`批次完成 ${completed}/${queue.length} 张，请进行人工终审。`);
      } else {
        setDataState({
          kind: "live-error",
          candidateName: "当前批次",
          message: lastFailure?.message ?? "所有图片均未形成有效结果",
          errorCode: lastFailure?.code,
          requestId: lastFailure?.requestId,
        });
        setToast("当前批次没有形成有效结果，请查看队列错误。");
      }
    } catch (error) {
      const message =
        error instanceof VisionQaApiError
          ? `${error.code}：${error.message}`
          : "真实模型分析失败";
      setDataState({
        kind: "live-error",
        candidateName: file.name,
        message,
      });
      setToast(message);
    } finally {
      setLiveRunning(false);
      setLiveConsent(false);
      getLiveModelCapability()
        .then(setLiveCapability)
        .catch(() => setLiveCapability(null));
      window.setTimeout(() => setToast(null), 4200);
    }
  };

  const toggleBatchSelection = (id: number) => {
    setBatchCandidates((current) => current.map((item) =>
      item.id === id ? { ...item, selected: !item.selected } : item,
    ));
  };

  const downloadSelectedOriginals = async () => {
    const selectedFiles = batchCandidates.filter((item) => item.selected).map((item) => item.file);
    if (selectedFiles.length === 0) {
      setToast("请先勾选需要下载的图片。");
      return;
    }
    downloadBlob(await createStoredZip(selectedFiles), "VisionQA-选中原图.zip");
    setToast(`已生成 ${selectedFiles.length} 张选中原图的 ZIP。`);
  };

  const downloadBatchReport = () => {
    const rows = batchCandidates
      .filter((item) => item.selected && item.result)
      .map((item) => {
        const result = item.result!;
        const score = (id: string) =>
          result.skills.find((skill) => skill.id === id)?.score ?? null;
        return {
          fileName: item.file.name,
          score: result.scoreAvailable === false ? null : result.score,
          decision: result.decision,
          humanRealism: score("01"),
          photographyRealism: score("02"),
          materialRealism: score("03"),
          commercialValue: score("04"),
          repairPrompt: result.repairPrompt,
        };
      });
    if (rows.length === 0) {
      setToast("选中的图片还没有真实诊断结果。");
      return;
    }
    downloadBlob(createBatchCsv(rows), "VisionQA-问题诊断报告.csv");
    setToast(`已下载 ${rows.length} 张图片的问题诊断报告。`);
  };

  const commitDecision = async (
    decision: Decision,
    input: OverrideInput = {
      reasonCode: "CONFIRMED",
      evidenceNote: "人工确认系统结论。",
    },
  ) => {
    let storage: AuditEntry["storage"] = "local";
    try {
      if (localCandidate) {
        storage = "local";
      } else if (
        selected.persistedEvaluation &&
        selected.evaluationId &&
        selected.resultVersion
      ) {
        await createFormalOverride({
          evaluationId: selected.evaluationId,
          baseEvaluationVersion: selected.resultVersion,
          originalDecision: selected.decision,
          humanDecision: decision,
          reasonCode: input.reasonCode,
          evidenceNote: input.evidenceNote,
          commercialTemplateId: selected.commercial.templateId,
          commercialTemplateVersion: selected.commercial.templateVersion,
          systemFitScore: selected.commercial.fitScore,
        });
        storage = "server";
      } else {
        const response = await fetch("/api/overrides", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            assetId: `prototype-asset-${selected.id}`,
            sourceUrl: selected.src,
            productLabel: selected.productLabel,
            originalDecision: selected.decision,
            humanDecision: decision,
            reasonCode: input.reasonCode,
            evidenceNote: input.evidenceNote,
            overallScore: selected.score,
            skillScores: selected.skills,
            issues: selected.issues,
            commercialAssessment: selected.commercialAssessment,
            commercialTemplateId: selected.commercial.templateId,
            commercialTemplateVersion: selected.commercial.templateVersion,
            commercialFitScore: selected.commercial.fitScore,
            commercialMetrics: selected.commercial.metrics,
            repairPrompt: selected.repairPrompt,
            lockedAttributes: selected.lockedAttributes,
          }),
        });
        if (response.ok) storage = "server";
      }
    } catch {
      // The prototype remains usable when the deployment has no D1 binding.
    }

    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      assetId: selected.id,
      originalDecision: selected.decision,
      humanDecision: decision,
      createdAt: new Date().toISOString(),
      storage,
      commercialTemplateId: selected.commercial.templateId,
      commercialFitScore: selected.commercial.fitScore,
      schemaVersion: localCandidate
        ? "visionqa-local-feedback-v1"
        : undefined,
      candidateTraceId: localCandidate?.traceId,
      candidateSha256: localCandidate?.sha256,
      candidateName: localCandidate?.name,
      evaluationMode: localCandidate
        ? selected.evaluationMode ?? LOCAL_EVALUATION_MODE
        : undefined,
      fixtureCaseId:
        localCandidate?.fixtureCaseId,
      reasonCode: input.reasonCode,
      evidenceNote: input.evidenceNote,
      overallScore: selected.score,
      submissionContext: localCandidate?.submissionContext,
      reviewStartedAt: localCandidate?.reviewStartedAt,
      reviewCompletedAt: new Date().toISOString(),
      promptCopyCount: localCandidate ? promptCopyCount : undefined,
    };
    const nextEntries = appendLocalFeedback(auditEntries, entry, 50);
    setAuditEntries(nextEntries);
    try {
      window.localStorage.setItem(
        LOCAL_FEEDBACK_STORAGE_KEY,
        JSON.stringify(nextEntries),
      );
      setToast(
        localCandidate
          ? `${selected.evaluationMode === "LIVE_MODEL_CANARY" ? "真实模型人工终审" : "本地反馈"}已保存并可追溯：${localCandidate.traceId} · ${selected.decision} → ${decision}`
          : storage === "server"
          ? `已写入服务端审计：图片 ${String(selected.id).padStart(3, "0")} · ${selected.decision} → ${decision}`
          : `D1 未绑定，已降级保存到本浏览器：图片 ${String(selected.id).padStart(3, "0")} · ${selected.decision} → ${decision}`,
      );
    } catch {
      setToast("人工结论已在当前会话记录，但浏览器持久化失败。");
    }
    setOverrideOpen(false);
    window.setTimeout(() => setToast(null), 3200);
  };

  const copyPrompt = async (prompt: string) => {
    if (localCandidate) setPromptCopyCount((count) => count + 1);
    try {
      await navigator.clipboard.writeText(prompt);
      setToast("修复 Prompt 已复制，可直接交给出图工具继续生成。");
    } catch {
      setToast("当前环境无法自动复制，请在证据详情中手动选择 Prompt。");
    }
    window.setTimeout(() => setToast(null), 3200);
  };

  const openOverride = (decision: Decision) => {
    setOverrideTarget(decision);
    setOverrideOpen(true);
  };

  const batchTitle =
    batchCandidates.length > 0
      ? `当前 SKU · ${batchCandidates.length} 张待修素材`
      : "商品图修正示例";
  const selectedBatchCandidate = batchCandidates.find(
    (item) => item.id === selected.id,
  );
  const selectedDiagnosisReady = selectedBatchCandidate
    ? Boolean(selectedBatchCandidate.result?.diagnosisReady)
    : dataState.kind !== "local" && dataState.kind !== "synthetic-library" && dataState.kind !== "live-loading";
  const projectTitle = projectRecord?.projectName ?? batchTitle;
  const sourceLabel =
    dataState.kind === "fixture"
      ? "内置示例项目"
      : dataState.kind === "live"
        ? "AI 诊断完成，等待人工确认"
        : dataState.kind === "synthetic-ground-truth"
          ? "合成样例真值，等待人工复验"
        : dataState.kind === "synthetic-library"
          ? `合成内部案例 ${dataState.caseId} · 非客户证据`
        : dataState.kind === "human-confirmed"
          ? dataState.evidenceMode
            ? `合成内部案例 ${dataState.fixtureCaseId ?? ""} · 用户已确认问题`
            : "用户已确认具体问题"
        : dataState.kind === "local"
          ? "客户图片仅在本机等待"
          : dataState.kind === "live-loading"
            ? "AI 问题诊断中"
            : dataState.kind === "live-error"
              ? "当前草图诊断失败"
              : "已保存评估";
  const areaLabel: Record<WorkspaceArea, string> = {
    overview: "项目总览",
    baseline: "商品真值",
    intake: "待修素材",
    review: "问题与建议",
    repair: "修正与交付",
    delivery: "营销延展",
  };
  const visibleAreas: WorkspaceArea[] = [
    "overview",
    "baseline",
    "intake",
    "review",
    "repair",
  ];

  return (
    <main className="vision-workbench-shell">
      <aside className="workspace-rail-nav">
        {/* Native navigation avoids the verified Vinext route-prefetch failure in production. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="workspace-brand" href="/" aria-label="返回 VisionQA 首页">
          <span aria-hidden="true">VQ</span>
          <strong>VisionQA</strong>
        </a>
        <div className="rail-project">
          <span>当前项目</span>
          <strong>{projectTitle}</strong>
          <small>{sourceLabel}</small>
        </div>
        <nav aria-label="工作台导航">
          {visibleAreas.map((item) => (
            <button
              key={item}
              type="button"
              aria-current={area === item ? "page" : undefined}
              onClick={() => setArea(item)}
            >
              {areaLabel[item]}
            </button>
          ))}
        </nav>
        <div className="rail-governance" role="note">
          <strong>人工终审开启</strong>
          <p>系统不会自动放行图片。</p>
        </div>
        <div className="rail-experience" aria-label="本地体验案例">
          <span>试用案例</span>
          <button type="button" onClick={() => void loadCardiganExperienceCase("start")}>
            开始开衫案例
          </button>
          <button type="button" onClick={() => void loadCardiganExperienceCase("complete")}>
            查看完整示例
          </button>
          <details className="rail-case-library">
            <summary>缺陷案例库 · 5</summary>
            <div>
              {SYNTHETIC_REPAIR_CASES.map((item) => (
                <button key={item.id} type="button" onClick={() => void loadSyntheticRepairCase(item.id)}>
                  <strong>{item.label}</strong>
                  <span>{item.strategy}</span>
                </button>
              ))}
            </div>
          </details>
          <small>案例载入不调用模型</small>
        </div>
      </aside>

      <section className="workspace-frame">
        <header className="workspace-topbar">
          <div>
            <span>{areaLabel[area]}</span>
            <strong>{projectTitle}</strong>
          </div>
          {/* Native navigation avoids route-prefetch instability in the production runtime. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="workspace-mobile-home" href="/" aria-label="返回 VisionQA 首页">
            VQ
          </a>
          <div className="topbar-actions">
            <span className="trial-account-label">{account.label}</span>
            <ProjectSaveStatus state={projectPersistence} />
            <button
              className="icon-button"
              type="button"
              aria-label="退出试用账号"
              onClick={onLogout}
            >
              退出
            </button>
          </div>
        </header>

        <nav className="workspace-mobile-nav" aria-label="移动端工作台导航">
          {visibleAreas.map((item) => (
            <button
              key={item}
              type="button"
              aria-current={area === item ? "page" : undefined}
              onClick={() => setArea(item)}
            >
              {areaLabel[item]}
            </button>
          ))}
        </nav>

        <div className="workspace-content">
          {area === "overview" && (
            <ProjectOverview
              batchTitle={projectTitle}
              sourceLabel={sourceLabel}
              coverSrc={selected.src}
              referenceCount={referenceFiles.length}
              skuCount={customerProfile.skuLinks.length}
              candidateCount={batchCandidates.length}
              completedCount={batchResultCount}
              reviewedCount={new Set(auditEntries.map((entry) => entry.assetId)).size}
              projectRecord={projectRecord}
              projectEvents={projectEvents}
              projectPersistence={projectPersistence}
              onNavigate={setArea}
            />
          )}

          {area === "baseline" && (
            <WorkspaceBaseline
              referenceFiles={referenceFiles}
              setReferenceFiles={setReferenceFiles}
              customerProfile={customerProfile}
              setCustomerProfile={setCustomerProfile}
              onContinue={() => setArea("intake")}
            />
          )}

          {area === "intake" && (
            <AssetIntakeWorkspace
              items={batchCandidates.map((item) => ({
                id: item.id,
                name: item.file.name,
                src: item.src,
                status: item.status,
                selected: item.selected,
                error: item.error,
              }))}
              processing={intakeState.kind === "processing"}
              errorMessage={intakeState.kind === "error" ? intakeState.message : undefined}
              submissionContext={submissionContext}
              setSubmissionContext={setSubmissionContext}
              onSelect={loadBatchCandidates}
              onToggle={toggleBatchSelection}
              onClear={restoreFixtureBatch}
              onContinue={() => setArea("review")}
            />
          )}

          {area === "review" && (
            <section className="review-page" aria-label="AI 模特图问题诊断">
              <DataStateNotice state={dataState} />
              <CustomerWorkflow
                state={intakeState}
                candidate={localCandidate}
                submissionContext={submissionContext}
                setSubmissionContext={setSubmissionContext}
                onSelect={loadBatchCandidates}
                onRestore={restoreFixtureBatch}
                liveCapability={liveCapability}
                liveConsent={liveConsent}
                setLiveConsent={setLiveConsent}
                liveRunning={liveRunning}
                onRunLive={runLiveEvaluation}
                syntheticGroundTruthEligible={syntheticGroundTruthEligible}
                onLoadSyntheticGroundTruth={loadSyntheticGroundTruth}
                onConfirmManualIssue={confirmManualIssue}
                referenceFiles={referenceFiles}
                batchCandidates={batchCandidates}
                toggleBatchSelection={toggleBatchSelection}
              />

              {batchCandidates.length > 0 && batchResultCount === 0 ? (
                <BatchWaitingState
                  count={batchCandidates.length}
                  running={liveRunning}
                  errorCount={batchCandidates.filter((item) => item.status === "error").length}
                />
              ) : view === "grid" ? (
                <GridWorkspace
                  assets={evaluatedAssets}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  openEvidence={() => setView("evidence")}
                  openOverride={openOverride}
                  commitDecision={commitDecision}
                  copyPrompt={copyPrompt}
                  selected={selected}
                  auditEntries={auditEntries}
                  allAssets={evaluatedAssets}
                  onRepair={() => setArea("repair")}
                />
              ) : (
                <EvidenceWorkspace
                  selected={selected}
                  setSelectedId={setSelectedId}
                  back={() => setView("grid")}
                  openOverride={openOverride}
                  commitDecision={commitDecision}
                  copyPrompt={copyPrompt}
                  auditEntries={auditEntries}
                  allAssets={evaluatedAssets}
                />
              )}
            </section>
          )}

          {area === "repair" && (
            <RepairWorkspace
              asset={selected}
              sourceFile={selectedBatchCandidate?.file ?? null}
              sourceSha256={selectedBatchCandidate?.sha256 ?? ""}
              referenceFiles={referenceFiles}
              diagnosisReady={selectedDiagnosisReady}
              outputFile={repairSourceAssetId === selected.id ? repairOutputFile : null}
              onOutputFileChange={(file) => {
                setRepairOutputFile(file);
                setRepairSourceAssetId(file ? selected.id : null);
                setRepairChecks([]);
                setUpscaleOutputFile(null);
                setUpscaleReceipt(null);
              }}
              checks={repairSourceAssetId === selected.id ? repairChecks : []}
              onChecksChange={setRepairChecks}
              upscaleOutputFile={repairSourceAssetId === selected.id ? upscaleOutputFile : null}
              upscaleReceipt={repairSourceAssetId === selected.id ? upscaleReceipt : null}
              onUpscaleReady={(file, receipt) => {
                setUpscaleOutputFile(file);
                setUpscaleReceipt(receipt);
              }}
              providerJob={
                repairProviderJob?.sourceAssetId === selected.id
                  ? repairProviderJob
                  : null
              }
              onProviderJobChange={setRepairProviderJob}
              isDemo={batchCandidates.length === 0}
              onBack={() => setArea("review")}
              onContinue={() => setArea("overview")}
            />
          )}

          {area === "delivery" && (
            <DeliveryWorkspace
              batchCandidates={batchCandidates}
              assets={evaluatedAssets}
              auditEntries={auditEntries}
              sourceLabel={sourceLabel}
              customerProfile={customerProfile}
              toggleBatchSelection={toggleBatchSelection}
              downloadSelectedOriginals={downloadSelectedOriginals}
              downloadBatchReport={downloadBatchReport}
              onReview={() => setArea("repair")}
            />
          )}
        </div>
      </section>

      {overrideOpen && (
        <OverridePanel
          original={selected.decision}
          target={overrideTarget}
          close={() => setOverrideOpen(false)}
          save={(input) => commitDecision(overrideTarget, input)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}

function ProjectSaveStatus({ state }: { state: ProjectPersistenceState }) {
  const label =
    state.kind === "loading"
      ? "正在恢复本机项目"
      : state.kind === "saving"
        ? `保存中 · v${state.revision}`
        : state.kind === "saved"
          ? `本机已保存 · v${state.revision}`
          : state.kind === "error"
            ? "本机保存失败"
            : "等待建立项目";
  return (
    <span
      className={`project-save-status is-${state.kind}`}
      role="status"
      title={state.kind === "error" ? state.message : undefined}
    >
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

function ProjectOverview({
  batchTitle,
  sourceLabel,
  coverSrc,
  referenceCount,
  skuCount,
  candidateCount,
  completedCount,
  reviewedCount,
  projectRecord,
  projectEvents,
  projectPersistence,
  onNavigate,
}: {
  batchTitle: string;
  sourceLabel: string;
  coverSrc: string;
  referenceCount: number;
  skuCount: number;
  candidateCount: number;
  completedCount: number;
  reviewedCount: number;
  projectRecord: VisionQaProjectRecord<WorkspaceProjectPayload> | null;
  projectEvents: VisionQaProjectAuditEvent[];
  projectPersistence: ProjectPersistenceState;
  onNavigate: (area: WorkspaceArea) => void;
}) {
  const hasBaseline = referenceCount > 0 || skuCount > 0;
  const isDemo = candidateCount === 0;
  const next = !hasBaseline
    ? { area: "baseline" as const, eyebrow: "下一步", title: "建立商品真值", detail: "先放入白底图或官方确认稿。" }
    : candidateCount === 0
      ? { area: "intake" as const, eyebrow: "下一步", title: "上传待修图片", detail: "建议一次处理一张图。" }
      : completedCount < candidateCount
        ? { area: "review" as const, eyebrow: "下一步", title: "确认图片问题", detail: "直接描述问题，或让 AI 先找问题。" }
        : reviewedCount < completedCount
          ? { area: "review" as const, eyebrow: "下一步", title: "确认处理建议", detail: "确认后进入修正。" }
          : { area: "repair" as const, eyebrow: "下一步", title: "修正并对比结果", detail: "人工复验后再交付。" };

  const stages: Array<{ area: "baseline" | "intake" | "review" | "repair"; label: string; detail: string; status: string }> = [
    { area: "baseline", label: "商品真值", detail: "白底图与确认事实", status: hasBaseline ? "完成" : "待补充" },
    { area: "intake", label: "待修图片", detail: "同一 SKU 的一张图", status: candidateCount ? `${candidateCount} 张` : "未上传" },
    { area: "review", label: "问题判断", detail: "确认问题和处理边界", status: isDemo ? "可试用" : `${completedCount}/${candidateCount}` },
    { area: "repair", label: "修正交付", detail: "前后对比与人工复验", status: reviewedCount ? "可进入" : "等待" },
  ];

  return (
    <section className="workspace-page overview-page" aria-labelledby="overview-title">
      <header className="page-heading">
        <div>
          <h1 id="overview-title">当前任务</h1>
        </div>
      </header>

      <section className="overview-focus" aria-label="当前项目下一步">
        <figure className="overview-cover">
          <SafeImage src={coverSrc} alt={`${batchTitle} 当前素材`} />
          <figcaption>{isDemo ? "内置示例素材，不代表客户结果" : "当前批次素材预览"}</figcaption>
        </figure>
        <div className="overview-next-action">
          <span>{next.eyebrow}</span>
          <h2>{next.title}</h2>
          <p>{next.detail}</p>
          <div className="overview-actions">
            <button className="primary-button" type="button" onClick={() => onNavigate(next.area)}>继续</button>
          </div>
        </div>
      </section>

      <section className="overview-stage-ledger" aria-labelledby="overview-stage-title">
        <div className="rail-intro">
          <h2 id="overview-stage-title">处理流程</h2>
          <p>{sourceLabel}</p>
        </div>
        <div className="rail-stages">
          {stages.map((stage, index) => (
            <button key={stage.area} type="button" onClick={() => onNavigate(stage.area)}>
              <span className="rail-index">{index + 1}</span>
              <span><strong>{stage.label}</strong><small>{stage.detail}</small></span>
              <span className="rail-action">{stage.status}</span>
            </button>
          ))}
        </div>
      </section>

      {projectRecord && (
        <details className="project-history" aria-labelledby="project-history-title">
          <summary>
            <div>
              <h2 id="project-history-title">本机项目记录</h2>
              <span>项目 {projectRecord.projectId.slice(0, 8)} · v{projectRecord.revision}</span>
            </div>
            <ProjectSaveStatus state={projectPersistence} />
          </summary>
          <dl>
            <div>
              <dt>项目标识</dt>
              <dd>{projectRecord.projectId.slice(0, 8)}</dd>
            </div>
            <div>
              <dt>内容版本</dt>
              <dd>v{projectRecord.revision}</dd>
            </div>
            <div>
              <dt>保存位置</dt>
              <dd>当前浏览器</dd>
            </div>
            <div>
              <dt>最近更新</dt>
              <dd>{new Date(projectRecord.updatedAt).toLocaleString("zh-CN")}</dd>
            </div>
          </dl>
          <ol aria-label="最近项目事件">
            {projectEvents
              .slice(-4)
              .reverse()
              .map((event) => (
                <li key={event.eventId}>
                  <span>{String(event.sequence).padStart(2, "0")}</span>
                  <div>
                    <strong>{event.summary}</strong>
                    <small>
                      {new Date(event.createdAt).toLocaleString("zh-CN")} · v
                      {event.toRevision}
                    </small>
                  </div>
                </li>
              ))}
          </ol>
          <p>
            本阶段仅保存在当前设备与浏览器中，不会上传客户图片；清除站点数据会同时清除本机项目。
          </p>
        </details>
      )}
    </section>
  );
}

function BatchWaitingState({
  count,
  running,
  errorCount,
}: {
  count: number;
  running: boolean;
  errorCount: number;
}) {
  return (
    <section className="batch-waiting-state" aria-live="polite">
      <div className="batch-waiting-visual" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h2>{running ? "正在生成首张诊断" : errorCount > 0 ? "当前任务尚无有效结果" : "模特草图已准备好"}</h2>
      <p>
        {running
          ? `系统正在按顺序分析 ${count} 张 AI 模特草图，首张结果完成后会在这里显示。`
          : errorCount > 0
            ? "请查看上方队列中的失败原因；再次外发前需要重新确认授权、剩余次数与预算。"
            : `已载入 ${count} 张 AI 模特草图。确认商品真值和授权后，点击“开始 AI 问题诊断”。`}
      </p>
      <small>在真实诊断完成前，本区域不会显示示例分数或模拟结论。</small>
    </section>
  );
}

function CustomerWorkflow({
  state,
  candidate,
  submissionContext,
  setSubmissionContext,
  onSelect,
  onRestore,
  liveCapability,
  liveConsent,
  setLiveConsent,
  liveRunning,
  onRunLive,
  syntheticGroundTruthEligible,
  onLoadSyntheticGroundTruth,
  onConfirmManualIssue,
  referenceFiles,
  batchCandidates,
  toggleBatchSelection,
}: {
  state: IntakeState;
  candidate: LocalCandidate | null;
  submissionContext: SubmissionContext;
  setSubmissionContext: Dispatch<SetStateAction<SubmissionContext>>;
  onSelect: (files: File[]) => Promise<void>;
  onRestore: () => void;
  liveCapability: LiveModelCapability | null;
  liveConsent: boolean;
  setLiveConsent: (value: boolean) => void;
  liveRunning: boolean;
  onRunLive: () => Promise<void>;
  syntheticGroundTruthEligible: boolean;
  onLoadSyntheticGroundTruth: () => void;
  onConfirmManualIssue: (
    category: ManualIssueCategory,
    note: string,
  ) => void;
  referenceFiles: File[];
  batchCandidates: BatchCandidate[];
  toggleBatchSelection: (id: number) => void;
}) {
  const completed = batchCandidates.filter((item) => item.status === "done").length;
  const failed = batchCandidates.filter((item) => item.status === "error").length;
  const processing = state.kind === "processing" || liveRunning;
  const [manualIssueCategory, setManualIssueCategory] =
    useState<ManualIssueCategory>("商品结构");
  const [manualIssueNote, setManualIssueNote] = useState("");
  const manualIssueOptions: ManualIssueCategory[] = [
    "商品结构",
    "Logo／字标",
    "印花／胶印／刺绣",
    "颜色／材质／纹理",
    "人物／穿着逻辑",
    "背景／构图",
  ];

  return (
    <details className="customer-workflow" open={batchCandidates.length > 0 && completed === 0}>
      <summary className="workflow-header">
        <div>
          <h2 id="customer-workflow-title">{completed > 0 ? "图片准备已完成" : "准备问题判断"}</h2>
          <p>{completed > 0 ? "需要时可重新上传或修改问题。" : "上传图片后，直接描述问题或使用 AI 判断。"}</p>
        </div>
        <strong>{batchCandidates.length > 0 ? `${batchCandidates.length} 张图片` : "展开"}</strong>
      </summary>

      <div className="workflow-sections">
        <section className="workflow-block workflow-block-wide">
          <header><div><h2>选择待修图片</h2><p>建议一次处理一张。</p></div></header>
          <div className="workflow-actions">
            <label className={`file-button ${processing ? "disabled" : ""}`}>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={processing}
                onChange={(event) => { void onSelect(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
              {state.kind === "processing" ? "正在建立任务" : batchCandidates.length ? "更换模特草图" : "选择 AI 模特草图"}
            </label>
            {syntheticGroundTruthEligible && completed === 0 && (
              <button
                className="quiet-button"
                type="button"
                disabled={processing}
                onClick={onLoadSyntheticGroundTruth}
              >
                使用案例答案
              </button>
            )}
            {batchCandidates.length > 0 && <button className="quiet-button" type="button" disabled={processing} onClick={onRestore}>清空批次</button>}
          </div>
          {batchCandidates.length > 0 && (
            <div className="batch-queue" aria-live="polite">
              <div className="batch-summary"><span>{batchCandidates.length} 张图片</span><span>{completed ? `${completed} 张已判断` : "等待判断"}</span>{failed > 0 && <span>{failed} 张失败</span>}</div>
              <ul>{batchCandidates.map((item) => (
                <li key={item.id}>
                  <label><input type="checkbox" checked={item.selected} onChange={() => toggleBatchSelection(item.id)} /><SafeImage src={item.src} alt={item.file.name} /><span title={item.file.name}>{item.file.name}</span></label>
                  <span className={`queue-status ${item.status}`}>{item.status === "ready" ? "等待分析" : item.status === "running" ? "分析中" : item.status === "done" ? `${item.result?.issues.length ?? 0} 项问题 · ${displayDecision(item.result?.decision ?? "REVIEW")}` : "失败"}</span>
                  {item.error && <small className="queue-error">{item.error}</small>}
                  {item.lastAttempt && (
                    <small className="queue-attempt mono">
                      请求 {item.lastAttempt.requestId.slice(0, 8)} · {item.lastAttempt.status === "RUNNING" ? "等待模型" : item.lastAttempt.status === "SUCCEEDED" ? "已完成" : item.lastAttempt.status === "TIMEOUT" ? "技术超时" : "技术失败"}
                      {typeof item.lastAttempt.elapsedMs === "number" ? ` · ${(item.lastAttempt.elapsedMs / 1000).toFixed(1)} 秒` : ""}
                    </small>
                  )}
                </li>
              ))}</ul>
            </div>
          )}
          {batchCandidates.length > 0 && (
            <details className="manual-issue-entry" open={completed === 0}>
              <summary>直接描述问题</summary>
              <div className="manual-issue-entry-content">
                <fieldset className="tag-field">
                  <legend>问题属于哪一类</legend>
                  <div>
                    {manualIssueOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={manualIssueCategory === option}
                        onClick={() => setManualIssueCategory(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="field-stack">
                  <span>具体哪里不对、希望改成什么</span>
                  <textarea
                    rows={3}
                    value={manualIssueNote}
                    placeholder="例如：画面左侧裤腿多了商品真值中不存在的翻盖口袋，只移除这个口袋，人物和其他区域不要变化。"
                    onChange={(event) => setManualIssueNote(event.target.value)}
                  />
                </label>
                <div className="workflow-actions">
                  <button
                    className="primary-button"
                    type="button"
                    disabled={manualIssueNote.trim().length < 4}
                    onClick={() => {
                      onConfirmManualIssue(manualIssueCategory, manualIssueNote);
                      setManualIssueNote("");
                    }}
                  >
                    查看处理建议
                  </button>
                </div>
              </div>
            </details>
          )}
          {batchCandidates.length > 0 && (
            <details className="ai-diagnosis-option">
              <summary>让 AI 先找问题</summary>
              <div>
                <details className="submission-context-details">
                  <summary>图片用途</summary>
                  <div className="submission-context compact-context">
                    <label>渠道<input value={submissionContext.channel} onChange={(event) => setSubmissionContext((current) => ({ ...current, channel: event.target.value }))} disabled={processing} /></label>
                    <label>图位<input value={submissionContext.placement} onChange={(event) => setSubmissionContext((current) => ({ ...current, placement: event.target.value }))} disabled={processing} /></label>
                    <label>素材来源<select value={submissionContext.provenanceStatus} onChange={(event) => setSubmissionContext((current) => ({ ...current, provenanceStatus: event.target.value as SubmissionContext["provenanceStatus"] }))} disabled={processing}><option value="confirmed_ai">AI 生成</option><option value="confirmed_real">真人实拍</option><option value="unknown">暂不确定</option></select></label>
                  </div>
                </details>
                <label className="live-consent"><input type="checkbox" checked={liveConsent} disabled={liveRunning || !liveCapability?.configured || liveCapability.remainingRequests < 1} onChange={(event) => setLiveConsent(event.target.checked)} /><span>同意将当前图片与 {referenceFiles.length} 张商品真值图发送至阿里云百炼。</span></label>
                <button className="primary-button" type="button" disabled={processing || !candidate || !liveConsent || !liveCapability?.configured || liveCapability.remainingRequests < 1} onClick={() => void onRunLive()}>
                  {liveRunning ? `正在分析 ${completed + 1}/${batchCandidates.length}` : "开始 AI 判断"}
                </button>
                <small>服务端不留存原图，结果仍需人工确认。</small>
              </div>
            </details>
          )}
        </section>

      </div>
    </details>
  );
}

function DeliveryWorkspace({
  batchCandidates,
  assets: deliveryAssets,
  auditEntries,
  sourceLabel,
  customerProfile,
  toggleBatchSelection,
  downloadSelectedOriginals,
  downloadBatchReport,
  onReview,
}: {
  batchCandidates: BatchCandidate[];
  assets: EvaluatedAsset[];
  auditEntries: AuditEntry[];
  sourceLabel: string;
  customerProfile: CustomerProfileInput;
  toggleBatchSelection: (id: number) => void;
  downloadSelectedOriginals: () => Promise<void>;
  downloadBatchReport: () => void;
  onReview: () => void;
}) {
  const selectedCount = batchCandidates.filter((item) => item.selected).length;
  const completedCount = batchCandidates.filter((item) => item.result).length;
  const failedCount = batchCandidates.filter((item) => item.status === "error").length;
  const reviewedCount = new Set(auditEntries.map((entry) => entry.assetId)).size;
  const isDemo = batchCandidates.length === 0;
  const readyForExport = !isDemo && selectedCount > 0;
  const marketingAsset = batchCandidates.find((item) => item.result)?.result ?? deliveryAssets[0];
  const marketingIssues = marketingAsset?.issues.map((issue) => issue.title) ?? [];
  const productExpression = marketingAsset && !isDemo
    ? projectLegacyCommercialMetrics({ scope: marketingAsset.productLabel, metrics: {} })
    : null;

  return (
    <section className="workspace-page delivery-page" aria-labelledby="delivery-title">
      <header className="page-heading">
        <div>
          <p className="page-context">第五步 · 营销交付</p>
          <h1 id="delivery-title">把评审结论变成可直接进入制作的交付包。</h1>
          <p>博主画像、平台文案、信息流视频大纲和视频模型提示词集中交付，客户素材与证据边界保持可追溯。</p>
        </div>
        <button className="quiet-button" type="button" onClick={onReview}>
          返回改图复审
        </button>
      </header>

      <MarketingDeliveryPack
        productName={marketingAsset?.productLabel ?? "待确认商品"}
        sourceLabel={sourceLabel}
        reviewIssues={marketingIssues}
        isDemo={isDemo}
        audienceSegments={customerProfile.audienceSegments}
        scenarios={customerProfile.scenarios}
        purchaseDrivers={customerProfile.purchaseDrivers}
        lockedAttributes={marketingAsset?.lockedAttributes.split("、").filter(Boolean) ?? []}
        productExpression={productExpression}
      />

      <section className="delivery-status-sheet" aria-labelledby="delivery-status-title">
        <div>
          <span>{sourceLabel}</span>
          <h2 id="delivery-status-title">
            {isDemo
              ? "示例项目仅供体验，交付动作保持关闭。"
              : completedCount === batchCandidates.length && failedCount === 0
                ? "问题诊断已完成，等待人工终审与修正处理。"
                : "当前图片尚未完成诊断，不生成完整交付结论。"}
          </h2>
        </div>
        <dl>
          <div>
            <dt>候选图</dt>
            <dd>{batchCandidates.length || deliveryAssets.length}</dd>
          </div>
          <div>
            <dt>诊断完成</dt>
            <dd>{isDemo ? "示例" : completedCount}</dd>
          </div>
          <div>
            <dt>人工记录</dt>
            <dd>{reviewedCount}</dd>
          </div>
          <div>
            <dt>下载选择</dt>
            <dd>{selectedCount}</dd>
          </div>
        </dl>
      </section>

      <div className="delivery-layout">
        <section className="delivery-selection" aria-labelledby="delivery-selection-title">
          <div className="section-title-row">
            <div>
              <span>文件选择</span>
              <h2 id="delivery-selection-title">交付清单</h2>
            </div>
            <strong>{isDemo ? "示例预览" : `已选 ${selectedCount}`}</strong>
          </div>
          <div className="delivery-file-list">
            {isDemo
              ? deliveryAssets.slice(0, 6).map((asset) => (
                  <article key={asset.id}>
                    <SafeImage src={asset.src} alt={asset.productLabel} />
                    <div>
                      <strong>{asset.productLabel}</strong>
                      <span>内置示例图 {String(asset.id).padStart(3, "0")}</span>
                    </div>
                    <Status value={asset.decision} />
                  </article>
                ))
              : batchCandidates.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleBatchSelection(item.id)}
                    />
                    <SafeImage src={item.src} alt={item.file.name} />
                    <div>
                      <strong>{item.file.name}</strong>
                      <span>{item.result ? displayDecision(item.result.decision) : "等待有效结果"}</span>
                    </div>
                    <span className={`queue-status ${item.status}`}>
                      {item.status === "done"
                        ? "已评分"
                        : item.status === "error"
                          ? "失败"
                          : item.status === "running"
                            ? "评分中"
                            : "等待"}
                    </span>
                  </label>
                ))}
          </div>
        </section>

        <aside className="delivery-checklist" aria-labelledby="delivery-checklist-title">
          <span>交付 Gate</span>
          <h2 id="delivery-checklist-title">四项确认，缺一项就不扩大结论。</h2>
          <dl>
            <div>
              <dt>参考范围</dt>
              <dd>{isDemo ? "示例项目，不构成 FULL_SKU" : "以本批输入为准"}</dd>
            </div>
            <div>
              <dt>人工终审</dt>
              <dd>{reviewedCount > 0 ? `已有 ${reviewedCount} 张记录` : "尚未完成"}</dd>
            </div>
            <div>
              <dt>返工漂移</dt>
              <dd>生成式返工后必须复验非目标区域</dd>
            </div>
            <div>
              <dt>客户确认</dt>
              <dd>采用、拒绝与再次提交需要真实记录</dd>
            </div>
          </dl>
          <div className="delivery-download-actions">
            <button
              className="primary-button"
              type="button"
              disabled={!readyForExport}
              onClick={() => void downloadSelectedOriginals()}
            >
              下载选中原图 ZIP
            </button>
            <button
              className="quiet-button"
              type="button"
              disabled={completedCount === 0}
              onClick={downloadBatchReport}
            >
              下载评审 CSV
            </button>
          </div>
          <p>CSV 包含内部评分、质量维度、Gate、人工结论与返工 Prompt。未完成的图片不会写入。</p>
        </aside>
      </div>

      <section className="commercial-evidence-status" aria-labelledby="commercial-evidence-title">
        <div>
          <span>商业证据</span>
          <h2 id="commercial-evidence-title">当前仍是内部产品验证，不是商业成功。</h2>
        </div>
        <dl>
          <div>
            <dt>真实付款</dt>
            <dd>0</dd>
          </div>
          <div>
            <dt>客户采用</dt>
            <dd>未记录</dd>
          </div>
          <div>
            <dt>再次提交</dt>
            <dd>未记录</dd>
          </div>
        </dl>
        <p>至少完成 3 个真实付费批次并记录采用证据后，再讨论协助式 SaaS 与订阅产品化。</p>
      </section>
    </section>
  );
}

function GridWorkspace({
  assets: visibleAssets,
  selectedId,
  setSelectedId,
  openEvidence,
  openOverride,
  commitDecision,
  copyPrompt,
  selected,
  auditEntries,
  allAssets,
  onRepair,
}: {
  assets: EvaluatedAsset[];
  selectedId: number;
  setSelectedId: (id: number) => void;
  openEvidence: () => void;
  openOverride: (decision: Decision) => void;
  commitDecision: (decision: Decision, input?: OverrideInput) => void;
  copyPrompt: (prompt: string) => void;
  selected: EvaluatedAsset;
  auditEntries: AuditEntry[];
  allAssets: EvaluatedAsset[];
  onRepair: () => void;
}) {
  const allAssetsCount = allAssets.length;
  const diagnosisPending = selected.diagnosisReady === false;

  return (
    <section className="workspace" aria-label="图片问题与修正建议工作台">
      <section className="gallery">
        <div className="gallery-toolbar">
          <span className="toolbar-label">待修图片 · {allAssetsCount} 张</span>
          <span className="demo-source">先看具体问题与下一步，内部分析数据不作为客户结论</span>
        </div>
        {visibleAssets.length ? (
          <div className="image-grid" role="listbox" aria-label="候选图片">
            {visibleAssets.map((asset) => (
              <button
                className="asset-tile"
                key={asset.id}
                type="button"
                role="option"
                aria-selected={selectedId === asset.id}
                onClick={() => setSelectedId(asset.id)}
                onDoubleClick={() => {
                  if (asset.scoreAvailable !== false) openEvidence();
                }}
              >
                <SafeImage
                  src={asset.src}
                  alt={`待修图片 ${asset.id}，处理建议 ${displayDecision(asset.decision)}`}
                />
                <span className="asset-index mono">
                  {String(asset.id).padStart(3, "0")}
                </span>
                <span className="asset-status">
                  {asset.diagnosisReady === false ? "等待分析" : <Status value={asset.decision} />}
                </span>
                <span className="asset-score mono">
                  {asset.diagnosisReady === false
                    ? "未分析"
                    : asset.issues.length
                      ? `${asset.issues.length} 项问题`
                      : "未见主要问题"}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <aside className="inspector" aria-label="当前图片判断">
        <section className={`review-decision-brief ${selected.decision.toLowerCase()}`}>
          <span>修正判断</span>
          {diagnosisPending ? <strong>等待诊断</strong> : <Status value={selected.decision} />}
          <h2>
            {diagnosisPending
              ? "当前图片尚未形成真实问题结论"
              : selected.decision === "PASS"
              ? "商品与人物可进入人工交付复核"
              : selected.decision === "REVIEW"
                ? "先改图，再重新评审"
                : "停止使用，建议重新生成"}
          </h2>
          <p>
            {diagnosisPending
              ? selected.commercialAssessment
              : selected.issues[0]?.impact
              ?? "当前未记录阻断问题，但仍需人工核对商品一致性与授权范围。"}
          </p>
          <dl>
            <div><dt>最大问题</dt><dd>{diagnosisPending ? "尚未诊断" : selected.issues[0]?.title ?? "未发现主要问题"}</dd></div>
            <div><dt>适用范围</dt><dd>{selected.productLabel || "当前单图"}</dd></div>
            <div><dt>下一步</dt><dd>{diagnosisPending ? "完成当前图片诊断" : selected.decision === "PASS" ? "人工确认后交付" : selected.decision === "REVIEW" ? "进入修正与复验" : "重新生成模特草图"}</dd></div>
          </dl>
          <button className="text-button" type="button" disabled={diagnosisPending} onClick={openEvidence}>查看问题证据</button>
        </section>

        <details className="review-analysis-details">
          <summary>查看内部分析、Prompt 与审计细节</summary>
          <div className="review-analysis-content">
        <div className="inspector-section score-summary">
          <div>
            <p className="inspector-kicker">
              当前图片 · {String(selected.id).padStart(3, "0")} / {allAssetsCount}
            </p>
            <div className="overall-score">
              <strong className="mono">
                {selected.scoreAvailable === false ? "--" : selected.score}
              </strong>
              <span>{selected.scoreAvailable === false ? "未评估" : "/ 100"}</span>
            </div>
          </div>
          <div className="score-decision">
            <Status value={selected.decision} />
            <span>
              {selected.decision === "PASS"
                ? "可以进入人工交付复验"
                : selected.decision === "REVIEW"
                  ? "建议返工后复核"
                  : "建议重新生成"}
            </span>
          </div>
          <p className="calibration-note">
            {diagnosisPending
              ? "当前客户图片等待真实诊断 · 不显示示例结果"
              : selected.evaluationMode === LOCAL_EVALUATION_MODE
              ? "示例项目结果 · 不关联客户图片"
              : selected.evaluationMode === "SYNTHETIC_GROUND_TRUTH"
                ? "合成受控样例人工真值 · 非模型结果"
              : selected.evaluationMode === "LIVE_MODEL_CANARY"
                ? `AI 评分 · ${selected.modelSnapshot} · 人工终审`
              : selected.evaluationId
                ? `已保存评估 · ${selected.calibrationStatus} · ${selected.modelStatus}`
                : "示例项目结果 · 仅用于功能体验"}
          </p>
        </div>
        <div className="inspector-section">
          <div className="section-heading-row">
            <p className="inspector-kicker">四项质量维度</p>
            <span className="mono muted-label">权重</span>
          </div>
          <SkillScoreList skills={selected.skills} />
          <CommercialSummary
            result={selected.commercial}
            detailed
            source={diagnosisPending ? "pending" : selected.evaluationId ? "real" : "fixture"}
          />
        </div>
        <div className="inspector-section">
          <p className="inspector-kicker">
            {diagnosisPending
              ? "尚未形成问题诊断"
              : selected.issues.length
              ? `问题 ${String(selected.issues.length).padStart(2, "0")}`
              : "未发现阻断问题"}
          </p>
          <div className="issue-list">
            {selected.issues.length ? (
              selected.issues.map((issue) => (
                <button
                  className="issue-row"
                  key={issue.id}
                  type="button"
                  onClick={openEvidence}
                >
                  <span className="issue-number mono">{issue.id}</span>
                  <span>
                    <strong>{issue.title}</strong>
                    <span>
                      {issue.skill} · {issue.severity}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <p className="no-issues">{diagnosisPending ? "等待当前图片的真实问题证据。" : "当前图片未记录主要问题，仍建议进行人工确认。"}</p>
            )}
          </div>
          <button
            className="quiet-button"
            style={{ width: "100%", marginTop: "0.75rem" }}
            type="button"
            disabled={diagnosisPending}
            onClick={openEvidence}
          >
            打开证据详情
          </button>
        </div>
        <div className="inspector-section prompt-preview">
          <div className="section-heading-row">
            <p className="inspector-kicker">修复 Prompt</p>
            <button
              className="text-button"
              type="button"
              disabled={diagnosisPending || !selected.repairPrompt}
              onClick={() => copyPrompt(selected.repairPrompt)}
            >
              复制
            </button>
          </div>
          <p>{diagnosisPending ? "等待真实诊断完成后生成修正 Prompt。" : `${selected.repairPrompt.slice(0, 92)}……`}</p>
          <span className="demo-source">
            {diagnosisPending
              ? "未生成 · 不使用示例 Prompt 填充"
              : selected.evaluationMode === LOCAL_EVALUATION_MODE
              ? "示例 Prompt · 不关联客户图片"
              : selected.evaluationMode === "LIVE_MODEL_CANARY"
                ? "基于 AI 观察与评分规则生成"
              : selected.evaluationId
                ? selected.promptProvenance
                  ? "来自已保存评估"
                  : "当前评估未返回 Prompt"
                : "示例 Prompt · 仅用于功能体验"}
          </span>
          {selected.promptProvenance && (
            <span className="demo-source">
              Prompt 来源：{selected.promptProvenance}
            </span>
          )}
        </div>
        <div className="inspector-section audit-preview">
          <p className="inspector-kicker">人工审计记录</p>
          {auditEntries.find((entry) => entry.assetId === selected.id) ? (
            <p>
              最近记录：
              <span className="mono">
                {displayDecision(
                  auditEntries.find((entry) => entry.assetId === selected.id)!
                    .originalDecision,
                )}
                {" → "}
                {displayDecision(
                  auditEntries.find((entry) => entry.assetId === selected.id)!
                    .humanDecision,
                )}
              </span>
              {" · "}
              {auditEntries.find((entry) => entry.assetId === selected.id)
                ?.storage === "server"
                ? "服务端"
                : "本地降级"}
              {auditEntries.find((entry) => entry.assetId === selected.id)
                ?.candidateTraceId && (
                <>
                  {" · "}
                  <span className="mono">
                    {
                      auditEntries.find(
                        (entry) => entry.assetId === selected.id,
                      )?.candidateTraceId
                    }
                  </span>
                </>
              )}
            </p>
          ) : (
            <p>当前图片暂无人工改判记录。</p>
          )}
          <span className="demo-source">
            本地候选反馈写入版本化浏览器记录；正式评估优先写服务端
          </span>
        </div>
          </div>
        </details>
        <div className="inspector-actions">
          <div className="human-warning">
            <span className="status-dot review" aria-hidden="true" />
            验证期 PASS 需 100% 人工复核
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={diagnosisPending}
            onClick={() => commitDecision(selected.decision)}
          >
            确认 {displayDecision(selected.decision)}
          </button>
          <button
            className="decision-button"
            type="button"
            disabled={diagnosisPending}
            onClick={() =>
              openOverride(selected.decision === "REJECT" ? "REVIEW" : "REJECT")
            }
          >
            人工改判
          </button>
          <button className="quiet-button" type="button" disabled={diagnosisPending} onClick={onRepair}>
            进入修正与复验
          </button>
        </div>
      </aside>
    </section>
  );
}

function CommercialSummary({
  result,
  detailed = false,
  source = "fixture",
}: {
  result: CommercialResult;
  detailed?: boolean;
  source?: "fixture" | "real" | "pending";
}) {
  const template = commercialTemplates.find(
    (item) => item.id === result.templateId,
  );
  return (
    <div className={detailed ? "commercial-summary detailed" : "commercial-summary"}>
      <div className="commercial-summary-head">
        <div>
          <span className="commercial-template-name">{result.templateName}</span>
          <span className="demo-source">
            {template?.status}
          </span>
        </div>
        <div className="commercial-fit">
          <strong className="mono">
            {Number.isFinite(result.fitScore) ? result.fitScore : "--"}
          </strong>
          <span>
            {Number.isFinite(result.fitScore) ? "/100" : "未评分"} · {result.fitLevel}
          </span>
        </div>
      </div>
      <p>{result.summary}</p>
      {detailed && (
        <>
          <div className="commercial-metrics">
            {result.metrics.map((metric) => (
              <div className="commercial-metric-row" key={metric.id}>
                <span>{metric.label}</span>
                <span className="score-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${Number.isFinite(metric.score) ? metric.score : 0}%`,
                    }}
                  />
                </span>
                <strong className="mono">
                  {Number.isFinite(metric.score) ? metric.score : "--"}
                </strong>
              </div>
            ))}
          </div>
          <div className="commercial-evidence">
            <div>
              <strong>已成立</strong>
              <span>{result.strengths.join("；")}</span>
            </div>
            <div>
              <strong>相对差距</strong>
              <span>{result.gaps.join("；")}</span>
            </div>
          </div>
        </>
      )}
      <span className="demo-source">
        {source === "pending"
          ? "等待当前图片的真实诊断 · 不使用示例相对分"
          : source === "real"
          ? "基于当前客户标准的相对贴合度 · 需人工终审"
          : "示例项目中的模板相对分 · 不代表客户真实结果"}
      </span>
    </div>
  );
}

function SkillScoreList({
  skills,
  compact = false,
}: {
  skills: SkillScore[];
  compact?: boolean;
}) {
  return (
    <div className={compact ? "skill-scores compact" : "skill-scores"}>
      {skills.map((skill) => (
        <div className="skill-score-row" key={skill.id}>
          <span className="skill-id mono">{skill.id}</span>
          <span className="skill-label">{skill.label}</span>
          <span className="score-track" aria-hidden="true">
            <span
              style={{ width: `${Number.isFinite(skill.score) ? skill.score : 0}%` }}
            />
          </span>
          <strong className="mono">
            {Number.isFinite(skill.score) ? skill.score : "--"}
          </strong>
          {!compact && <span className="skill-weight mono">{skill.weight}</span>}
        </div>
      ))}
    </div>
  );
}

function EvidenceWorkspace({
  selected,
  setSelectedId,
  back,
  openOverride,
  commitDecision,
  copyPrompt,
  auditEntries,
  allAssets,
}: {
  selected: EvaluatedAsset;
  setSelectedId: (id: number) => void;
  back: () => void;
  openOverride: (decision: Decision) => void;
  commitDecision: (decision: Decision, input?: OverrideInput) => void;
  copyPrompt: (prompt: string) => void;
  auditEntries: AuditEntry[];
  allAssets: EvaluatedAsset[];
}) {
  return (
    <>
      <section className="evidence-layout" aria-label="单图证据详情">
        <nav className="filmstrip" aria-label="批次图片">
          {allAssets.slice(0, 8).map((asset) => (
            <button
              key={asset.id}
              type="button"
              aria-pressed={selected.id === asset.id}
              aria-label={`查看候选图 ${asset.id}`}
              onClick={() => setSelectedId(asset.id)}
            >
              <SafeImage src={asset.src} alt="" />
            </button>
          ))}
        </nav>
        <section className="hero-inspection" aria-label="候选图与证据区域">
          <SafeImage src={selected.src} alt={`候选图 ${selected.id}`} />
          {selected.markerAvailable !== false &&
            selected.issues.map((issue) => (
              <span
                className="evidence-marker mono"
                key={issue.id}
                style={{
                  left: `${issue.marker.x}%`,
                  top: `${issue.marker.y}%`,
                }}
              >
                {issue.id}
              </span>
            ))}
          <span className="marker-disclaimer">
            {selected.evaluationMode === LOCAL_EVALUATION_MODE
              ? "示例项目未提供精确证据位置"
              : selected.evaluationMode === "LIVE_MODEL_CANARY"
                ? "AI 未返回精确证据位置"
              : selected.markerAvailable === false
                ? "当前评估未返回精确证据位置"
                : "问题位置用于辅助人工复核"}
          </span>
        </section>
        <aside className="evidence-panel">
          <section className={`review-decision-brief ${selected.decision.toLowerCase()}`}>
            <span>证据页结论</span>
            <Status value={selected.decision} />
            <h2>
              {selected.decision === "PASS"
                ? "可进入人工发布复核"
                : selected.decision === "REVIEW"
                  ? "先修复主要问题"
                  : "停止使用当前素材"}
            </h2>
            <p>{selected.issues[0]?.impact ?? "未记录主要问题，仍需核对商品一致性与授权范围。"}</p>
          </section>
          <section className="report-summary">
            <div className="report-score">
              <span>综合评分</span>
              <strong className="mono">
                {selected.scoreAvailable === false ? "--" : selected.score}
              </strong>
              <small>{selected.scoreAvailable === false ? "未评估" : "/100"}</small>
            </div>
            <div className="report-decision">
              <Status value={selected.decision} />
              <span>门禁结论优先于总分</span>
            </div>
            <SkillScoreList skills={selected.skills} compact />
            <p className="calibration-note">
              {selected.evaluationMode === LOCAL_EVALUATION_MODE
                ? "当前为示例项目，分数与结论不关联任何客户图片。"
                : selected.evaluationMode === "LIVE_MODEL_CANARY"
                  ? `由 ${selected.modelSnapshot} 提供图像观察，系统生成评分、发布建议与优化 Prompt；结果必须人工终审。`
                : selected.evaluationId
                  ? `已保存评估 · ${selected.calibrationStatus} · ${selected.modelStatus}`
                  : "当前为示例项目，评分仅用于体验产品功能。"}
            </p>
          </section>
          {selected.evaluationMode === LOCAL_EVALUATION_MODE && (
            <section className="local-fixture-warning" role="note">
              <strong>示例项目</strong>
              <p>
                以下分项、问题证据、商业判断和优化 Prompt 仅用于展示完整工作流，
                不关联客户上传图片，也不能作为真实审核结论。
              </p>
            </section>
          )}
          {selected.evaluationMode === "LIVE_MODEL_CANARY" && (
            <section className="live-model-warning" role="note">
              <strong>AI 评分结果</strong>
              <p>
                当前图片已由 {selected.modelSnapshot} 分析；本应用未保存图片。本结果尚未完成客户数据标定，
                不可自动发布，必须由现场人员确认或改判。
              </p>
            </section>
          )}
          <section className="reference-section">
            <div className="section-heading-row">
              <h2 className="panel-heading">商品参考</h2>
              <span className="demo-source">
                {selected.evaluationMode === "LIVE_MODEL_CANARY"
                  ? `已引用 ${selected.referenceCount ?? 0} 张历史参考`
                  : "示例参考"}
              </span>
            </div>
            {selected.evaluationMode === "LIVE_MODEL_CANARY" ? (
              <p className="no-issues">
                {selected.referenceCount
                  ? `本次评估已将 ${selected.referenceCount} 张客户历史优秀图作为风格、材质与商业表达参考。SKU 链接仅作为文字背景，商品一致性仍需人工核对。`
                  : "本次评估未上传历史参考图，涉及商品一致性与客户风格的结论需要人工重点复核。"}
              </p>
            ) : (
              <div className="fixture-reference-note">
                <SafeImage src={selected.src} alt="示例项目当前正面图" />
                <p>
                  示例项目只提供当前视觉功能参考，不把同一张图片重复标成正面、背面和细节。
                  因此参考范围不能视为完整 SKU。
                </p>
              </div>
            )}
          </section>
          <section className="evidence-section">
            <p className="inspector-kicker">
              {selected.issues.length
                ? `证据问题 · ${String(selected.issues.length).padStart(2, "0")}`
                : "证据问题 · 00"}
            </p>
            {selected.issues.length ? (
              selected.issues.map((issue, index) => (
                <article
                  className="evidence-card"
                  aria-current={index === 0 ? "true" : undefined}
                  key={issue.id}
                >
                  <h3>
                    <span
                      className={`status-dot ${
                        issue.severity === "Blocker" ? "reject" : "review"
                      }`}
                      aria-hidden="true"
                    />
                    {issue.title}
                  </h3>
                  <dl className="evidence-meta">
                    <dt>可观察事实</dt>
                    <dd>{issue.observation}</dd>
                    <dt>影响</dt>
                    <dd>{issue.impact}</dd>
                    <dt>证据区域</dt>
                    <dd>图中 {issue.id}</dd>
                    <dt>Skill / 规则</dt>
                    <dd>
                      {issue.skill} · <span className="mono">{issue.rule}</span>
                    </dd>
                  </dl>
                </article>
              ))
            ) : (
              <p className="no-issues">
                当前图片未记录主要问题，高分候选仍需人工确认。
              </p>
            )}
          </section>
          <section className="commercial-section">
            <div className="section-heading-row">
              <h2 className="panel-heading">商业模板贴合度</h2>
              <span className="demo-source">模板切换只影响第四层</span>
            </div>
            <CommercialSummary
              result={selected.commercial}
              detailed
              source={selected.evaluationId ? "real" : "fixture"}
            />
          </section>
          <section className="repair-section">
            <div className="section-heading-row">
              <h2 className="panel-heading">可执行修复 Prompt</h2>
              <button
                className="text-button"
                type="button"
                onClick={() => copyPrompt(selected.repairPrompt)}
              >
                复制 Prompt
              </button>
            </div>
            <div className="repair-prompt">{selected.repairPrompt}</div>
            <p className="prompt-scope">
              锁定项：{selected.lockedAttributes}不得改变。
            </p>
            <p className="prompt-scope">
              {selected.evaluationMode === LOCAL_EVALUATION_MODE
                ? "来源：示例项目，不关联客户图片。"
                : selected.evaluationMode === "LIVE_MODEL_CANARY"
                  ? `来源：${selected.modelSnapshot} 图像观察与 VisionQA 评分规则；必须人工终审。`
                : selected.evaluationId
                  ? selected.promptProvenance
                    ? `来源：${selected.promptProvenance}`
                    : "当前评估未返回 Prompt 来源。"
                  : "来源：示例项目，不关联客户图片。"}
            </p>
          </section>
          <section className="audit-detail">
            <div className="section-heading-row">
              <h2 className="panel-heading">人工审计记录</h2>
              <span className="mono">{auditEntries.length} 条</span>
            </div>
            <p>
              {selected.evaluationMode === "LIVE_MODEL_CANARY"
                ? "当前评估与人工改判仅保存在本浏览器。本地验收通过并接入正式数据库后，才会进入团队审计记录。"
                : "示例项目的人工操作仅保存在本浏览器，不会写入客户审计记录。"}
            </p>
            {auditEntries.length > 0 ? (
              <ol className="audit-log" aria-label="最近人工反馈">
                {auditEntries.slice(0, 10).map((entry) => (
                  <li key={entry.id}>
                    <span className="mono">
                      {entry.candidateTraceId ??
                        `sample-${String(entry.assetId).padStart(3, "0")}`}
                    </span>
                    <span>
                      {displayDecision(entry.originalDecision)} → {displayDecision(entry.humanDecision)}
                    </span>
                    <span>{entry.reasonCode ?? "历史记录"}</span>
                    <time dateTime={entry.createdAt}>
                      {new Date(entry.createdAt).toLocaleString("zh-CN")}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="no-issues">尚无人工反馈。确认或改判后会在这里生成追踪记录。</p>
            )}
          </section>
        </aside>
      </section>
      <footer className="bottom-actions">
        <button className="quiet-button" type="button" onClick={back}>
          返回批次
        </button>
        <div className="human-warning">
          <span className="status-dot review" aria-hidden="true" />
          验证期 PASS 需 100% 人工复核
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => commitDecision(selected.decision)}
        >
          确认 {displayDecision(selected.decision)}
        </button>
        <button
          className="decision-button"
          type="button"
          onClick={() => openOverride("PASS")}
        >
          改为 PASS
        </button>
        <button
          className="decision-button"
          type="button"
          onClick={() => openOverride("REJECT")}
        >
          改为 REGENERATE
        </button>
      </footer>
    </>
  );
}

function OverridePanel({
  original,
  target,
  close,
  save,
}: {
  original: Decision;
  target: Decision;
  close: () => void;
  save: (input: OverrideInput) => void;
}) {
  const reasons = [
    { code: "BLOCKER_MISSED", label: "系统漏掉阻断问题" },
    { code: "SEVERITY_WRONG", label: "严重度判断错误" },
    { code: "RULE_NOT_APPLICABLE", label: "商品规则不适用" },
    { code: "REFERENCE_CHANGED", label: "参考材料发生变化" },
  ];
  const [reasonCode, setReasonCode] = useState(reasons[0].code);
  const [evidenceNote, setEvidenceNote] = useState(
    "商品参考图的袖口结构与候选图不一致，属于关键结构偏差。",
  );

  return (
    <aside className="override-panel" aria-labelledby="override-title">
      <h2 id="override-title">
        将 {displayDecision(original)} 改为 {displayDecision(target)}
      </h2>
      <p>改判会保留系统原结论；D1 可用时写入服务端，否则明确降级到本地。</p>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="panel-heading">选择改判原因</legend>
        <div className="reason-list">
          {reasons.map((reason) => (
            <label key={reason.code}>
              <input
                type="radio"
                name="override-reason"
                checked={reasonCode === reason.code}
                onChange={() => setReasonCode(reason.code)}
              />
              {reason.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="panel-heading" htmlFor="evidence-note">
        业务证据
      </label>
      <textarea
        id="evidence-note"
        value={evidenceNote}
        onChange={(event) => setEvidenceNote(event.target.value)}
        style={{
          width: "100%",
          minHeight: "8rem",
          marginBottom: "1.5rem",
          padding: "0.75rem",
          border: "1px solid var(--line-strong)",
          borderRadius: "var(--radius-sm)",
          resize: "vertical",
          font: "inherit",
        }}
      />
      <div className="override-actions">
        <button className="quiet-button" type="button" onClick={close}>
          保留原判断
        </button>
        <button
          className="primary-button"
          type="button"
          disabled={!evidenceNote.trim()}
          onClick={() =>
            save({ reasonCode, evidenceNote: evidenceNote.trim() })
          }
        >
          保存改判并继续
        </button>
      </div>
    </aside>
  );
}
