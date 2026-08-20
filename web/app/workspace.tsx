"use client";

import Link from "next/link";
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
import { WorkspaceLogin } from "./workspace-login";
import { WorkspaceBaseline } from "./workspace-overview";
import { RepairWorkspace } from "./workspace-repair";
import { projectLegacyCommercialMetrics } from "../lib/visionqa/product-expression";

type Decision = "PASS" | "REVIEW" | "REJECT";
type View = "grid" | "evidence";
type WorkspaceArea = "baseline" | "intake" | "review" | "repair" | "delivery";
type CommercialTemplateId = "platform-promotion" | "brand-flagship";

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
  promptProvenance?: string | null;
  calibrationStatus?: "DEMO" | "UNCALIBRATED" | "CALIBRATED";
  modelStatus?: string;
  markerAvailable?: boolean;
  evaluationMode?: typeof LOCAL_EVALUATION_MODE | "LIVE_MODEL_CANARY";
  fixtureCaseId?: string;
  persistedEvaluation?: boolean;
  providerId?: string;
  modelSnapshot?: string;
  providerLatencyMs?: number;
  referenceCount?: number;
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
  | { kind: "live-error"; candidateName: string; message: string }
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
  evaluationMode?: typeof LOCAL_EVALUATION_MODE | "LIVE_MODEL_CANARY";
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
};

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
    id: "platform-promotion",
    name: "平台商品表达",
    version: "0.2",
    status: "视觉重心、商品细节与真实使用标准",
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
    templateId === "platform-promotion"
      ? baseScore
      : clampScore(baseScore + flagshipOffsets[asset.id - 1]);
  const metricOffsets =
    templateId === "platform-promotion"
      ? [6, -3, 2, 4, -7, 1]
      : [3, 5, -12, 8, -4, 6];
  const fitLevel = fitScore >= 90 ? "高" : fitScore >= 70 ? "中" : "低";
  const template = commercialTemplates.find((item) => item.id === templateId)!;
  const gaps =
    templateId === "platform-promotion"
      ? ["关键商品细节还不够集中", "原商品一致性需要结合基准图人工确认"]
      : ["场景对商品的支撑关系偏弱", "品牌表达与商品细节需要重新平衡"];
  const strengths =
    templateId === "platform-promotion"
      ? ["视觉重心落在商品主体", "主要轮廓具备识别效率"]
      : ["人物与商品关系清楚", "场景没有覆盖商品主要结构"];

  return {
    templateId,
    templateVersion: template.version,
    templateName: template.name,
    fitScore,
    fitLevel,
    summary:
      templateId === "platform-promotion"
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

function buildApiAsset(
  patch: UiEvaluationPatch,
  options: {
    src?: string;
    productLabel?: string;
    persistedEvaluation?: boolean;
    evaluationMode?: typeof LOCAL_EVALUATION_MODE | "LIVE_MODEL_CANARY";
    providerId?: string;
    modelSnapshot?: string;
    providerLatencyMs?: number;
    id?: number;
    referenceCount?: number;
  } = {},
): EvaluatedAsset {
  const fixture = assets[0];
  return {
    ...fixture,
    id: options.id ?? 1,
    src: options.src ?? "",
    productLabel:
      options.productLabel ?? `正式评估 · ${patch.evaluationId}`,
    score: patch.score ?? Number.NaN,
    scoreAvailable: patch.score !== null,
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

function DataSourceBadge({ state }: { state: DataState }) {
  const label =
    state.kind === "live"
      ? "AI 评分完成"
      : state.kind === "live-loading"
        ? "AI 评分中"
        : state.kind === "live-error"
          ? "评分失败"
          : state.kind === "real"
      ? "已保存评估"
      : state.kind === "local"
        ? "批次待评分"
      : state.kind === "loading"
        ? "正在读取评估"
        : state.kind === "fallback"
          ? "评估读取失败"
          : "示例项目";
  return (
    <span className={`data-source-badge ${state.kind}`} role="status">
      {label}
    </span>
  );
}

function DataStateNotice({ state }: { state: DataState }) {
  if (state.kind === "fixture") {
    return (
      <div className="data-state-notice">
        当前打开的是示例项目，用于体验评分、证据和优化 Prompt。上传自己的批次后，
        示例结果不会进入客户评估。
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
        正在分析 {state.candidateName}。图片会发送至阿里云百炼，本应用不保存图片。
      </div>
    );
  }
  if (state.kind === "live-error") {
    return (
      <div className="data-state-notice error" role="alert">
        {state.candidateName} 未形成有效评分：{state.message}。未完成图片仍保留在批次队列中，
        可以重新发起评分。
      </div>
    );
  }
  if (state.kind === "local") {
    return (
      <div className="data-state-notice local" role="status">
        已载入 {state.candidateName}。候选图正在本机等待，尚未发送到模型，也没有生成任何评分。
        确认客户画像和授权后即可开始批次评分。
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
        AI 评分已完成 · {state.modelSnapshot} · 最近一张耗时{" "}
        {(state.latencyMs / 1000).toFixed(1)} 秒。系统已生成评分、发布建议与优化 Prompt；
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

export function Workspace() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [area, setArea] = useState<WorkspaceArea>("baseline");
  const [view, setView] = useState<View>("grid");
  const [commercialTemplateId, setCommercialTemplateId] =
    useState<CommercialTemplateId>("platform-promotion");
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
    placement: "平台主图",
    referenceStatus: "complete",
    provenanceStatus: "unknown",
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
  const localObjectUrl = useRef<string | null>(null);
  const candidateFileRef = useRef<File | null>(null);

  const evaluatedAssets = useMemo(
    () => {
      const batchResults = batchCandidates.flatMap((item) =>
        item.result ? [item.result] : [],
      );
      return batchResults.length > 0
        ? batchResults
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

  const loadBatchCandidates = async (files: File[]) => {
    if (files.length === 0) {
      setIntakeState({ kind: "error", message: "尚未选择候选图。" });
      return;
    }
    const limited = files.slice(0, liveCapability?.maxTotalRequests ?? 10);
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
    setLocalCandidate(null);
    candidateFileRef.current = null;
    setLiveConsent(false);
    setSelectedId(1);
    setDataState({ kind: "fixture" });
    setIntakeState({ kind: "idle" });
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
      let completed = 0;
      for (const item of queue) {
        setBatchCandidates((current) => current.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, status: "running", error: undefined }
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
          });
          lastResult = result;
          completed += 1;
          setBatchCandidates((current) => current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, status: "done", result, traceId: live.candidateTraceId }
              : candidate,
          ));
          setApiAsset(result);
          setSelectedId(item.id);
        } catch (error) {
          const message = error instanceof VisionQaApiError
            ? `${error.code}：${error.message}`
            : "真实模型分析失败";
          setBatchCandidates((current) => current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, status: "error", error: message }
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
          message: "所有图片均未形成有效结果",
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
      setToast("选中的图片还没有真实评分结果。");
      return;
    }
    downloadBlob(createBatchCsv(rows), "VisionQA-批次评分报告.csv");
    setToast(`已下载 ${rows.length} 张图片的评分报告。`);
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
        selected.evaluationMode === LOCAL_EVALUATION_MODE
          ? localCandidate?.fixtureCaseId
          : undefined,
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
      ? `客户批次 · ${batchCandidates.length} 张`
      : "夏季服饰示例项目";
  const sourceLabel =
    dataState.kind === "fixture"
      ? "内置示例项目"
      : dataState.kind === "live"
        ? "AI 评分完成，等待人工终审"
        : dataState.kind === "local"
          ? "客户图片仅在本机等待"
          : dataState.kind === "live-loading"
            ? "AI 评分进行中"
            : dataState.kind === "live-error"
              ? "当前批次评分失败"
              : "已保存评估";
  const areaLabel: Record<WorkspaceArea, string> = {
    baseline: "商品基准",
    intake: "待评审素材",
    review: "质量评审",
    repair: "改图复审",
    delivery: "营销交付",
  };

  if (!previewOpen) {
    return <WorkspaceLogin onEnterPreview={() => setPreviewOpen(true)} />;
  }

  return (
    <main className="vision-workbench-shell">
      <aside className="workspace-rail-nav">
        <Link className="workspace-brand" href="/" aria-label="返回 VisionQA 首页">
          <span aria-hidden="true">VQ</span>
          <strong>VisionQA</strong>
        </Link>
        <div className="rail-project">
          <span>当前项目</span>
          <strong>{batchTitle}</strong>
          <small>{sourceLabel}</small>
        </div>
        <nav aria-label="工作台导航">
          {(Object.keys(areaLabel) as WorkspaceArea[]).map((item, index) => (
            <button
              key={item}
              type="button"
              aria-current={area === item ? "page" : undefined}
              onClick={() => setArea(item)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {areaLabel[item]}
            </button>
          ))}
        </nav>
        <div className="rail-governance" role="note">
          <span>交付规则</span>
          <strong>人工终审始终开启</strong>
          <p>自动放行关闭。参考范围不会从局部通过扩张为完整 SKU 通过。</p>
        </div>
      </aside>

      <section className="workspace-frame">
        <header className="workspace-topbar">
          <div>
            <span>{areaLabel[area]}</span>
            <strong>{batchTitle}</strong>
          </div>
          <div className="topbar-actions">
            {area === "review" && (
              <label className="template-control">
                <span>评估模板</span>
                <select
                  value={commercialTemplateId}
                  disabled={
                    dataState.kind === "real" ||
                    dataState.kind === "local" ||
                    dataState.kind === "live" ||
                    dataState.kind === "live-loading"
                  }
                  onChange={(event) =>
                    setCommercialTemplateId(event.target.value as CommercialTemplateId)
                  }
                >
                  {commercialTemplates.map((template) => (
                    <option value={template.id} key={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <DataSourceBadge state={dataState} />
            {area === "review" && (
              <div className="view-switch" aria-label="评审视图">
                <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")}>
                  批次
                </button>
                <button type="button" aria-pressed={view === "evidence"} onClick={() => setView("evidence")}>
                  证据
                </button>
              </div>
            )}
            <button
              className="icon-button"
              type="button"
              aria-label="退出内部预览"
              onClick={() => setPreviewOpen(false)}
            >
              退
            </button>
          </div>
        </header>

        <nav className="workspace-mobile-nav" aria-label="移动端工作台导航">
          {(Object.keys(areaLabel) as WorkspaceArea[]).map((item) => (
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
            <section className="review-page" aria-label="质量评审">
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
                referenceFiles={referenceFiles}
                setReferenceFiles={setReferenceFiles}
                customerProfile={customerProfile}
                setCustomerProfile={setCustomerProfile}
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
              isDemo={batchCandidates.length === 0}
              onBack={() => setArea("review")}
              onContinue={() => setArea("delivery")}
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
      <h2>{running ? "正在生成首张评分" : errorCount > 0 ? "当前批次尚无有效结果" : "批次已准备好"}</h2>
      <p>
        {running
          ? `系统正在按顺序分析 ${count} 张候选图，首张结果完成后会在这里显示。`
          : errorCount > 0
            ? "请查看上方队列中的失败原因，确认后可以重新发起评分。"
            : `已载入 ${count} 张候选图。完成客户画像和授权后，点击“开始真实批次评分”。`}
      </p>
      <small>在真实评分完成前，本区域不会显示示例分数或模拟结论。</small>
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
  referenceFiles,
  setReferenceFiles,
  customerProfile,
  setCustomerProfile,
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
  referenceFiles: File[];
  setReferenceFiles: (files: File[]) => void;
  customerProfile: CustomerProfileInput;
  setCustomerProfile: Dispatch<SetStateAction<CustomerProfileInput>>;
  batchCandidates: BatchCandidate[];
  toggleBatchSelection: (id: number) => void;
}) {
  const styleOptions = ["简约通勤", "轻奢质感", "甜酷潮流", "自然松弛", "高级极简"];
  const audienceOptions = ["18-24 岁年轻女性", "25-35 岁都市女性", "35-45 岁品质女性", "大码人群"];
  const toggleProfileTag = (field: "styles" | "audiences", value: string) => {
    setCustomerProfile((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value],
    }));
  };
  const completed = batchCandidates.filter((item) => item.status === "done").length;
  const failed = batchCandidates.filter((item) => item.status === "error").length;
  const selectedCount = batchCandidates.filter((item) => item.selected).length;
  const processing = state.kind === "processing" || liveRunning;

  return (
    <details className="customer-workflow" open={batchCandidates.length > 0}>
      <summary className="workflow-header">
        <div>
          <span>第三步 · 质量评审</span>
          <h2 id="customer-workflow-title">确认批次并开始真实质量评审</h2>
          <p>系统先检查硬性 Gate，再生成评分、证据和返工建议。</p>
        </div>
        <strong>{batchCandidates.length > 0 ? `${batchCandidates.length} 张素材已载入` : "展开评审准备"}</strong>
      </summary>

      <div className="workflow-sections">
        <section className="workflow-block">
          <header><span className="workflow-step mono">01</span><div><h2>历史参考与 SKU</h2><p>最多 4 张历史优秀图会随候选图进入模型。</p></div></header>
          <div className="workflow-actions">
            <label className="secondary-file-button">
              <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={processing}
                onChange={(event) => {
                  setReferenceFiles(Array.from(event.currentTarget.files ?? []).slice(0, 4));
                  event.currentTarget.value = "";
                }} />
              选择历史参考图
            </label>
            <span className="context-count">已引用 {referenceFiles.length} 张参考</span>
          </div>
          {referenceFiles.length > 0 && (
            <ul className="compact-file-list">{referenceFiles.map((file) => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}</ul>
          )}
          <label className="field-stack">
            <span>商品 SKU 链接，每行一个</span>
            <textarea rows={2} value={customerProfile.skuLinks.join("\n")}
              placeholder="https://detail.tmall.com/item.htm?id=..."
              onChange={(event) => setCustomerProfile((current) => ({
                ...current,
                skuLinks: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 20),
              }))} />
          </label>
          <label className="csv-import">
            导入 SKU CSV
            <input type="file" accept=".csv,text/csv" onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              const values = (await file.text()).split(/[\r\n,]+/).map((item) => item.trim()).filter((item) => /^https?:\/\//i.test(item));
              setCustomerProfile((current) => ({ ...current, skuLinks: values.slice(0, 20) }));
              event.currentTarget.value = "";
            }} />
          </label>
        </section>

        <section className="workflow-block">
          <header><span className="workflow-step mono">02</span><div><h2>客户画像</h2><p>用于校准商业价值，不替代可见证据。</p></div></header>
          <fieldset className="tag-field"><legend>目标风格</legend><div>{styleOptions.map((option) => (
            <button type="button" key={option} aria-pressed={customerProfile.styles.includes(option)} onClick={() => toggleProfileTag("styles", option)}>{option}</button>
          ))}</div></fieldset>
          <div className="price-range">
            <label><span>最低价</span><input inputMode="numeric" value={customerProfile.priceMin} onChange={(event) => setCustomerProfile((current) => ({ ...current, priceMin: event.target.value.replace(/[^0-9.]/g, "") }))} /></label>
            <span>至</span>
            <label><span>最高价</span><input inputMode="numeric" value={customerProfile.priceMax} onChange={(event) => setCustomerProfile((current) => ({ ...current, priceMax: event.target.value.replace(/[^0-9.]/g, "") }))} /></label>
          </div>
          <fieldset className="tag-field"><legend>目标人群</legend><div>{audienceOptions.map((option) => (
            <button type="button" key={option} aria-pressed={customerProfile.audiences.includes(option)} onClick={() => toggleProfileTag("audiences", option)}>{option}</button>
          ))}</div></fieldset>
          <p className="profile-summary">当前画像：{customerProfile.styles.join("、") || "未选择风格"} · {customerProfile.priceMin || "?"}-{customerProfile.priceMax || "?"} 元 · {customerProfile.audiences.join("、") || "未选择人群"}</p>
        </section>

        <section className="workflow-block workflow-block-wide">
          <header><span className="workflow-step mono">评审</span><div><h2>评审范围与启动</h2><p>按顺序逐张分析，最多 10 张，不会自动放行。</p></div></header>
          <div className="submission-context compact-context">
            <label>渠道<input value={submissionContext.channel} onChange={(event) => setSubmissionContext((current) => ({ ...current, channel: event.target.value }))} disabled={processing} /></label>
            <label>图位<input value={submissionContext.placement} onChange={(event) => setSubmissionContext((current) => ({ ...current, placement: event.target.value }))} disabled={processing} /></label>
            <label>素材来源<select value={submissionContext.provenanceStatus} onChange={(event) => setSubmissionContext((current) => ({ ...current, provenanceStatus: event.target.value as SubmissionContext["provenanceStatus"] }))} disabled={processing}><option value="confirmed_ai">确认 AI 生成</option><option value="confirmed_real">确认真人／实拍</option><option value="unknown">暂不确定</option></select></label>
          </div>
          <div className="workflow-actions">
            <label className={`file-button ${processing ? "disabled" : ""}`}>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={processing}
                onChange={(event) => { void onSelect(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
              {state.kind === "processing" ? "正在建立批次" : batchCandidates.length ? "更换批次" : "选择候选图片"}
            </label>
            <button className="primary-button" type="button" disabled={processing || !candidate || !liveConsent || !liveCapability?.configured} onClick={() => void onRunLive()}>
              {liveRunning ? `正在评分 ${completed + 1}/${batchCandidates.length}` : "开始真实批次评分"}
            </button>
            {batchCandidates.length > 0 && <button className="quiet-button" type="button" disabled={processing} onClick={onRestore}>清空批次</button>}
          </div>
          {batchCandidates.length > 0 && (
            <div className="batch-queue" aria-live="polite">
              <div className="batch-summary"><span>共 {batchCandidates.length} 张</span><span>完成 {completed}</span><span>失败 {failed}</span><span>已选 {selectedCount}</span></div>
              <ul>{batchCandidates.map((item) => (
                <li key={item.id}>
                  <label><input type="checkbox" checked={item.selected} onChange={() => toggleBatchSelection(item.id)} /><SafeImage src={item.src} alt={item.file.name} /><span title={item.file.name}>{item.file.name}</span></label>
                  <span className={`queue-status ${item.status}`}>{item.status === "ready" ? "等待评分" : item.status === "running" ? "评分中" : item.status === "done" ? `${item.result?.scoreAvailable === false ? "未评估" : item.result?.score} · ${item.result?.decision}` : "失败"}</span>
                  {item.error && <small>{item.error}</small>}
                </li>
              ))}</ul>
            </div>
          )}
          <label className="live-consent"><input type="checkbox" checked={liveConsent} disabled={liveRunning || !liveCapability?.configured} onChange={(event) => setLiveConsent(event.target.checked)} /><span>我确认本批候选图与 {referenceFiles.length} 张历史参考可发送至阿里云百炼。应用不保存图片，所有结果必须人工终审。</span></label>
        </section>

      </div>
      <p className="data-processing-note">
        隐私与授权：只有确认授权并点击开始评分后，候选图与历史参考图才会发送至阿里云百炼。
        本页面不保存原图；当前验收环境中的评分与人工改判仅保存在本浏览器。
      </p>
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
                ? "批次评分已完成，等待人工终审与客户选择。"
                : "批次尚未完成，不生成完整交付结论。"}
          </h2>
        </div>
        <dl>
          <div>
            <dt>候选图</dt>
            <dd>{batchCandidates.length || deliveryAssets.length}</dd>
          </div>
          <div>
            <dt>评分完成</dt>
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

  return (
    <section className="workspace" aria-label="批次审核工作台">
      <section className="gallery">
        <div className="gallery-toolbar">
          <span className="toolbar-label">评分与门禁 · {allAssetsCount} 张</span>
          <span className="demo-source">按严重程度和上传顺序查看，不启用复杂筛选</span>
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
                onDoubleClick={openEvidence}
              >
                <SafeImage
                  src={asset.src}
                  alt={`候选图 ${asset.id}，系统建议 ${displayDecision(asset.decision)}`}
                />
                <span className="asset-index mono">
                  {String(asset.id).padStart(3, "0")}
                </span>
                <span className="asset-status">
                  <Status value={asset.decision} />
                </span>
                <span className="asset-score mono">
                  {asset.scoreAvailable === false ? "--" : asset.score}
                  <small>{asset.scoreAvailable === false ? "" : "/100"}</small>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <aside className="inspector" aria-label="当前图片判断">
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
                ? "高分发布候选"
                : selected.decision === "REVIEW"
                  ? "建议返工后复核"
                  : "建议重新生成"}
            </span>
          </div>
          <p className="calibration-note">
            {selected.evaluationMode === LOCAL_EVALUATION_MODE
              ? "示例项目结果 · 不关联客户图片"
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
            source={selected.evaluationId ? "real" : "fixture"}
          />
        </div>
        <div className="inspector-section">
          <p className="inspector-kicker">
            {selected.issues.length
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
              <p className="no-issues">
                当前图片未记录主要问题，仍建议进行人工确认。
              </p>
            )}
          </div>
          <button
            className="quiet-button"
            style={{ width: "100%", marginTop: "0.75rem" }}
            type="button"
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
              onClick={() => copyPrompt(selected.repairPrompt)}
            >
              复制
            </button>
          </div>
          <p>{selected.repairPrompt.slice(0, 92)}……</p>
          <span className="demo-source">
            {selected.evaluationMode === LOCAL_EVALUATION_MODE
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
        <div className="inspector-actions">
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
            onClick={() =>
              openOverride(selected.decision === "REJECT" ? "REVIEW" : "REJECT")
            }
          >
            人工改判
          </button>
          <button className="quiet-button" type="button" onClick={onRepair}>
            进入改图复审
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
  source?: "fixture" | "real";
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
        {source === "real"
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
