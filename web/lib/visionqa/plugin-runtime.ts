import {
  createMockVisualReview,
  parseVisualReviewRequest,
  parseVisualReviewResponse,
  type VisualReviewRequest,
  type VisualReviewResponse,
} from "./visual-review-contract.ts";
import { createLocalCanaryQwenAdapter } from "./providers/local-canary.ts";
import { createMultimodalAdapterFromEnv, getMultimodalReadiness } from "./providers/multimodal.ts";
import { orchestrateVisionEvaluation, type VisionEvaluationOutcome } from "./providers/orchestrator.ts";
import {
  VisionProviderError,
  type ProviderEvaluationInput,
  type ProviderImageInput,
  type VisionProviderAdapter,
} from "./providers/types.ts";
import {
  parseCodeReviewV01Request,
  parseCodeReviewV01Response,
  parseVisualReviewV02Request,
  parseVisualReviewV02Response,
  type CodeReviewV01Request,
  type CodeReviewV01Response,
  type EvidenceAnchor,
  type VisualReviewV02Request,
  type VisualReviewV02Response,
} from "./review-contract-v0.2.ts";
import { resolveReviewProfile } from "./review-profiles.ts";

export const PLUGIN_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const PLUGIN_MAX_REFERENCE_IMAGES = 4;
export const PLUGIN_MAX_TOTAL_IMAGE_BYTES = 14 * 1024 * 1024;
export const PLUGIN_REVIEW_TIMEOUT_MS = 120_000;

export type PluginProvider = "mock" | "auto" | "qwen";
export type PluginImage = {
  bytes: ArrayBuffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  role: "candidate" | "reference";
  name: string;
};

export type PluginReviewResult = {
  contract: VisualReviewResponse;
  provider: {
    providerId: string;
    adapterVersion: string;
    modelSnapshot: string;
    providerRequestId: string | null;
    latencyMs: number;
    usage: { inputTokens: number | null; outputTokens: number | null };
    warnings: string[];
  };
};

/**
 * M2's offline contract runtime.  This is intentionally separate from the
 * legacy image runtime below: v0.1 keeps its provider and e-commerce
 * compatibility behaviour, while these helpers exercise the generic v0.2
 * Visual/Code/Linked contract without making a network or model call.
 */
export type PluginReviewV02Request = VisualReviewV02Request | CodeReviewV01Request;
export type PluginReviewV02Response = VisualReviewV02Response | CodeReviewV01Response;

export type PluginMockProvider = {
  providerId: "fixture";
  adapterVersion: "fixture-review-runtime-0.2.0";
  modelSnapshot: "fixture-review-v0.2";
  providerRequestId: null;
  latencyMs: 0;
  usage: { inputTokens: 0; outputTokens: 0 };
  warnings: readonly string[];
};

export type PluginReviewV02Result = {
  contract: PluginReviewV02Response;
  provider: PluginMockProvider;
};

const V02_FIXTURE_WARNING = "FIXTURE_ONLY_NOT_A_REAL_MODEL_RESULT";
const V02_NO_NETWORK_WARNING = "MOCK_RUNTIME_NO_PROVIDER_OR_NETWORK_CALL";

function fixtureProvider(requestId: string): PluginMockProvider {
  return {
    providerId: "fixture",
    adapterVersion: "fixture-review-runtime-0.2.0",
    modelSnapshot: "fixture-review-v0.2",
    providerRequestId: null,
    latencyMs: 0,
    usage: { inputTokens: 0, outputTokens: 0 },
    warnings: Object.freeze([
      V02_FIXTURE_WARNING,
      V02_NO_NETWORK_WARNING,
      `request_id=${requestId}`,
    ]),
  };
}

function fixtureEvidence(description: string): EvidenceAnchor {
  // A text_range anchor makes the fixture provenance explicit.  It does not
  // pretend that a pixel/DOM/source location was observed by a real provider.
  return {
    id: "fixture-context",
    kind: "text_range",
    text: "fixture-context",
    description,
  };
}

function assertProfileMode(
  request: VisualReviewV02Request | CodeReviewV01Request,
  expectedMode: "visual" | "code" | "linked",
) {
  const profile = resolveReviewProfile({ requested: request.profile }).profile;
  if (profile.review_mode !== expectedMode) {
    throw new VisionProviderError(
      "CONFIGURATION",
      `请求 profile ${profile.profile.id}@${profile.profile.version} 与 ${expectedMode} 评审模式不匹配。`,
      { retryable: false },
    );
  }
  if ("review_mode" in request && request.review_mode !== expectedMode) {
    throw new VisionProviderError(
      "CONFIGURATION",
      `请求 review_mode=${request.review_mode} 与 profile 的 ${expectedMode} 模式不匹配。`,
      { retryable: false },
    );
  }
  return profile;
}

function visualFixtureResult(
  request: VisualReviewV02Request,
  mode: "visual" | "linked",
): VisualReviewV02Response {
  const profile = assertProfileMode(request, mode);
  const artifactEvidence = Boolean(
    request.artifact.screenshot_ref ||
      request.artifact.source_ref ||
      request.artifact.structure_ref ||
      request.artifact.evidence_anchors.length ||
      request.artifacts?.some((artifact) =>
        Boolean(
          artifact.screenshot_ref ||
            artifact.source_ref ||
            artifact.structure_ref ||
            artifact.evidence_anchors.length,
        ),
      ),
  );
  const evidence = fixtureEvidence(
    artifactEvidence
      ? "当前输入已通过 VisualReview v0.2 契约，但 Mock 不读取像素、DOM 或源码。"
      : "当前输入没有截图、结构或证据引用，Mock 无法判断视觉产物。",
  );
  const notAssessable = {
    id: "mock-visual-not-assessable",
    dimension: "provider_evidence",
    statement: artifactEvidence
      ? "Mock 运行时仅确认输入契约，不产生真实视觉观察。"
      : "缺少可评审的视觉产物或证据引用。",
    status: "not_assessable" as const,
    severity: "observation" as const,
    confidence: 1,
    evidence: [evidence],
    recommendation: "接入授权的视觉 Provider，或提供人工评审结果后再形成结论。",
    profile: profile.profile,
  };
  return parseVisualReviewV02Response({
    schema_version: "visual-review-v0.2",
    request_id: request.request_id,
    revision_id: request.revision_id,
    decision: artifactEvidence ? "NOT_ASSESSABLE" : "NEEDS_CONTEXT",
    summary: artifactEvidence
      ? "Mock 已接收视觉评审上下文，但没有调用真实模型，因此不会伪造视觉、审美或交互结论。"
      : "还没有收到可评审的视觉产物。请提供截图、图片或可读取的结构引用。",
    observations: {
      schema_version: "observation-envelope-v0.1",
      review_mode: mode,
      profile: profile.profile,
      observations: [notAssessable],
    },
    issues: [],
    repair_plan: {
      type: "none",
      requires_approval: true,
      operations: [],
    },
    verification: {
      required: true,
      checks: [
        "确认已使用真实视觉 Provider 或人工评审，而非 Mock 结果。",
        "确认截图、DOM/结构和当前 revision 仍对应同一份视觉产物。",
        "任何写回操作都必须经过用户明确批准。",
      ],
    },
    usage: {
      mode: "mock",
      provider: "fixture",
      model: "fixture-review-v0.2",
      input_images: 0,
      estimated_cost_minor_units: 0,
      latency_ms: 0,
    },
  });
}

function codeFixtureResult(request: CodeReviewV01Request): CodeReviewV01Response {
  const profile = assertProfileMode(request, "code");
  const evidence = fixtureEvidence(
    "当前输入已通过 CodeReview v0.1 契约，但 Mock 不读取源码、AST、Diff 或测试结果。",
  );
  return parseCodeReviewV01Response({
    schema_version: "code-review-v0.1",
    request_id: request.request_id,
    decision: "NOT_ASSESSABLE",
    summary: "Mock 已接收代码评审上下文，但没有读取源码或执行静态检查，因此不会伪造代码质量结论。",
    observations: {
      schema_version: "observation-envelope-v0.1",
      review_mode: "code",
      profile: profile.profile,
      observations: [{
        id: "mock-code-not-assessable",
        dimension: "provider_evidence",
        statement: "Mock 运行时仅确认 source artifact 元数据，不产生真实代码观察。",
        status: "not_assessable",
        severity: "observation",
        confidence: 1,
        evidence: [evidence],
        recommendation: "接入离线静态检查或授权的代码 Provider 后再形成结论。",
        profile: profile.profile,
      }],
    },
    issues: [],
    repair_plan: {
      type: "none",
      requires_approval: true,
      operations: [],
    },
    verification: {
      required: true,
      checks: [
        "确认源码、Diff、AST 和测试上下文已实际读取。",
        "运行确定性 lint、typecheck 或 test 后再接受代码结论。",
        "任何源码写回都必须经过用户明确批准。",
      ],
    },
    usage: {
      mode: "mock",
      provider: "fixture",
      model: "fixture-review-v0.2",
      estimated_cost_minor_units: 0,
      latency_ms: 0,
    },
  });
}

/** Run a VisualReview v0.2 fixture without invoking a provider or network. */
export function runVisualReviewV02Mock(request: VisualReviewV02Request): PluginReviewV02Result {
  const parsed = parseVisualReviewV02Request(request);
  return { contract: visualFixtureResult(parsed, "visual"), provider: fixtureProvider(parsed.request_id) };
}

/** Run a CodeReview v0.1 fixture without reading source or executing commands. */
export function runCodeReviewV01Mock(request: CodeReviewV01Request): PluginReviewV02Result {
  const parsed = parseCodeReviewV01Request(request);
  return { contract: codeFixtureResult(parsed), provider: fixtureProvider(parsed.request_id) };
}

/** Run the linked visual/source fixture; no source write is ever performed. */
export function runLinkedReviewMock(request: VisualReviewV02Request): PluginReviewV02Result {
  const parsed = parseVisualReviewV02Request(request);
  if (parsed.review_mode !== "linked") {
    throw new VisionProviderError(
      "CONFIGURATION",
      "Linked Mock 必须使用 review_mode=linked。",
      { retryable: false },
    );
  }
  return { contract: visualFixtureResult(parsed, "linked"), provider: fixtureProvider(parsed.request_id) };
}

/** Dispatch a typed v0.2 request to one of the three offline fixtures. */
export function runReviewMock(request: PluginReviewV02Request): PluginReviewV02Result {
  if (request.schema_version === "code-review-v0.1") return runCodeReviewV01Mock(request);
  if (request.review_mode === "linked") return runLinkedReviewMock(request);
  return runVisualReviewV02Mock(request);
}

const allowedMimeTypes = new Set<PluginImage["mimeType"]>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const toDataUrl = (image: PluginImage) =>
  `data:${image.mimeType};base64,${toBase64(image.bytes)}`;

function assertImages(candidate: PluginImage | undefined, references: PluginImage[]) {
  if (!candidate) {
    throw new VisionProviderError("UNSUPPORTED_MEDIA", "请选择一张要评审的图片。", {
      retryable: false,
    });
  }
  if (references.length > PLUGIN_MAX_REFERENCE_IMAGES) {
    throw new VisionProviderError(
      "PAYLOAD_TOO_LARGE",
      `参考图片最多 ${PLUGIN_MAX_REFERENCE_IMAGES} 张。`,
    );
  }
  const all: PluginImage[] = [candidate, ...references];
  for (const image of all) {
    if (!allowedMimeTypes.has(image.mimeType)) {
      throw new VisionProviderError(
        "UNSUPPORTED_MEDIA",
        "仅支持 JPG、PNG 和 WebP 图片。",
      );
    }
    if (image.bytes.byteLength <= 0 || image.bytes.byteLength > PLUGIN_MAX_IMAGE_BYTES) {
      throw new VisionProviderError(
        "PAYLOAD_TOO_LARGE",
        `单张图片不能超过 ${Math.round(PLUGIN_MAX_IMAGE_BYTES / 1024 / 1024)} MB。`,
      );
    }
  }
  if (all.reduce((sum, image) => sum + image.bytes.byteLength, 0) > PLUGIN_MAX_TOTAL_IMAGE_BYTES) {
    throw new VisionProviderError("PAYLOAD_TOO_LARGE", "本次图片总大小超过 14 MB。", {
      retryable: false,
    });
  }
}

function makeProviderInput(
  request: VisualReviewRequest,
  candidate: PluginImage,
  references: PluginImage[],
  contextSummary?: string,
): ProviderEvaluationInput {
  const imageInput = (image: PluginImage): ProviderImageInput => ({
    url: toDataUrl(image),
    role: image.role,
    mimeType: image.mimeType,
  });
  return {
    requestId: request.request_id,
    runId: `plugin_${request.request_id}`,
    assetId: request.artifact.name || candidate.name || "plugin-candidate",
    scene: request.artifact.type === "web_page" ? "网页与界面视觉评审" : "通用视觉评审插件",
    placement: request.intent.platform || request.host.type,
    candidate: imageInput(candidate),
    references: references.map(imageInput),
    lockedAttributes: request.constraints?.must_keep ?? [],
    taxonomyVersion: "visionqa-plugin-taxonomy-0.1.0",
    commercialTemplate: {
      id: request.artifact.type === "web_page" ? "web_visual_review" : "visual_baseline",
      version: "0.1.0",
      assessmentScope:
        request.artifact.type === "web_page"
          ? "根据截图、DOM 摘要、对话目标和保留约束评估网页或界面的层级、可读性、对齐、对比度、交互可见性和响应式风险；截图本身就是待评视觉产物，参考图可选；证据不足时必须要求人工复核。"
          : "根据视觉产物、目标受众、平台和保留约束评估层级、构图、留白、对齐、字体、对比、一致性、审美完成度和交互可见性（适用于界面时）；参考图仅作为可选上下文，证据不足时必须要求人工复核，不把审美偏好冒充事实。",
    },
    promptVersion: "visionqa-plugin-observer-0.1.1",
    reviewMode: request.artifact.type === "web_page" ? "web_page" : "asset",
    contextSummary,
  };
}

function toEvidence(outcome: VisionEvaluationOutcome["result"]["model_evaluation"]["observations"][number]) {
  return [
    outcome.candidateEvidence
      ? { source: "pixel" as const, description: outcome.candidateEvidence }
      : null,
    outcome.referenceEvidence
      ? { source: "comparison" as const, description: outcome.referenceEvidence }
      : null,
  ].filter((item): item is { source: "pixel" | "comparison"; description: string } => Boolean(item));
}

function mapOutcomeToContract(
  request: VisualReviewRequest,
  outcome: VisionEvaluationOutcome,
  inputImageCount: number,
  executionMode: "byok" | "managed" = "managed",
): VisualReviewResponse {
  const result = outcome.result;
  const visualBaselineReview =
    request.artifact.type === "web_page" ||
    result.score_evaluation.commercial_assessment.template_id === "web_visual_review" ||
    ["visual_baseline", "plugin_visual_review"].includes(result.score_evaluation.commercial_assessment.template_id);
  const observations = result.model_evaluation.observations;
  const issues = observations.slice(0, 16).map((observation) => ({
    id: observation.observation_id,
    category: observation.issue_code,
    severity:
      observation.severity === "blocker"
        ? ("blocker" as const)
        : observation.severity === "major"
          ? ("high" as const)
          : observation.severity === "minor"
            ? ("medium" as const)
            : ("observation" as const),
    confidence:
      observation.status === "detected"
        ? 0.82
        : observation.status === "suspected"
          ? 0.58
          : 0.3,
    evidence: toEvidence(observation).length
      ? toEvidence(observation)
      : [{ source: "context" as const, description: "模型标记为证据不足，需人工复核。" }],
    suggested_fix: visualBaselineReview
      ? "先确认评审范围与目标，再决定是否调整页面结构、间距或交互提示。"
      : result.action_plan.repair_prompt?.prompt || "先核对证据，再决定是否进行局部修正。",
  }));
  const decision =
    result.gate_evaluation.decision === "PASS"
      ? "PASS"
      : result.gate_evaluation.decision === "REJECT"
        ? "NEEDS_REVISION"
        : "MANUAL_REVIEW";
  const operations = result.action_plan.repair_prompt
    ? [
        ...result.action_plan.repair_prompt.repair_actions.map((item) => ({
          action: item.action,
          reason: `来自 ${item.source_observation_ids.join("、")}`,
        })),
        ...result.action_plan.repair_prompt.commercial_actions.map((item) => ({
          action: item.action,
          reason: `来自 ${item.source_metric_ids.join("、")}`,
        })),
      ]
    : [];
  const contract = {
    schema_version: "visual-review-v0.1",
    request_id: request.request_id,
    decision,
    summary:
      `${result.gate_evaluation.decision_reason} ${result.score_evaluation.commercial_assessment.summary}`.trim() ||
      "已完成视觉评审，但当前证据不足以形成更具体的结论。",
    issues,
    repair_plan: {
      type: visualBaselineReview
        ? result.action_plan.repair_prompt
          ? "manual_plan"
          : "none"
        : result.action_plan.repair_prompt
          ? result.action_plan.repair_prompt.strategy === "MANUAL_REVIEW"
            ? "manual_plan"
            : "image_edit"
          : "none",
      requires_approval: true,
      operations: visualBaselineReview ? [] : operations,
    },
    verification: {
      required: true,
      checks: [
        ...result.action_plan.required_human_checks,
        "确认当前结果仍对应同一份宿主产物和 revision。",
        "下载或写回前由人工确认最终版本。",
      ].slice(0, 16),
    },
    usage: {
      mode: executionMode,
      provider: outcome.provider.providerId,
      model: outcome.provider.modelSnapshot,
      input_images: inputImageCount,
      estimated_cost_minor_units: undefined,
    },
  } satisfies VisualReviewResponse;
  try {
    return parseVisualReviewResponse(contract);
  } catch (error) {
    throw new VisionProviderError(
      "INVALID_OUTPUT",
      "视觉 Provider 的结果未通过 VisualReview Contract 校验。",
      { cause: error },
    );
  }
}

export function normalizePluginProvider(value: unknown): PluginProvider {
  if (value === "mock" || value === "auto" || value === "qwen") return value;
  if (value === undefined || value === null || value === "") return "auto";
  throw new VisionProviderError("CONFIGURATION", "当前仅支持 Mock 或用户多模态 API。", {
    retryable: false,
  });
}

function desktopProviderCallsDisabled(env: Record<string, string | undefined>): boolean {
  const mode = env.VISIONQA_DESKTOP_PROVIDER_MODE ?? env.VISIONQA_DESKTOP_MODE;
  return mode === "off";
}

export async function runVisualPluginReview(options: {
  request: VisualReviewRequest;
  provider: PluginProvider;
  candidate?: PluginImage;
  references?: PluginImage[];
  env?: Record<string, string | undefined>;
  adapter?: VisionProviderAdapter;
  contextSummary?: string;
  signal?: AbortSignal;
}): Promise<PluginReviewResult> {
  const references = options.references ?? [];
  if (options.provider === "mock") {
    const contract = parseVisualReviewRequest(options.request).artifact.screenshot_ref
      ? createMockVisualReview(options.request)
      : createMockVisualReview({
          ...options.request,
          artifact: { ...options.request.artifact, screenshot_ref: "plugin://context" },
        });
    return {
      contract,
      provider: {
        providerId: "fixture",
        adapterVersion: "fixture-adapter-0.1.0",
        modelSnapshot: "fixture-visual-review-v0.1",
        providerRequestId: null,
        latencyMs: 0,
        usage: { inputTokens: 0, outputTokens: 0 },
        warnings: ["FIXTURE_ONLY_NOT_A_REAL_MODEL_RESULT"],
      },
    };
  }

  const env = options.env ?? process.env;
  if (desktopProviderCallsDisabled(env)) {
    throw new VisionProviderError(
      "POLICY_BLOCKED",
      "桌面端 Provider 调用当前已关闭。请在桌面启动配置中显式开启 real 模式，并通过包外 secrets 文件注入服务端凭据。",
      { retryable: false },
    );
  }

  if (options.request.permissions?.can_call_model === false) {
    throw new VisionProviderError(
      "POLICY_BLOCKED",
      "当前请求未授予视觉模型调用权限。请在宿主侧确认本次调用。",
      { retryable: false },
    );
  }

  assertImages(options.candidate, references);
  let executionMode: "byok" | "managed" = "managed";
  let adapter = options.adapter;
  if (!adapter && options.provider === "auto") {
    const multimodal = getMultimodalReadiness(env);
    if (multimodal.configured) {
      adapter = createMultimodalAdapterFromEnv(env);
      executionMode = "byok";
    }
  }
  adapter ??= createLocalCanaryQwenAdapter(env);
  const outcome = await orchestrateVisionEvaluation(
    adapter,
    makeProviderInput(options.request, options.candidate!, references, options.contextSummary),
    options.signal ?? new AbortController().signal,
    { maxAttempts: 1, attemptTimeoutMs: PLUGIN_REVIEW_TIMEOUT_MS },
  );
  return { contract: mapOutcomeToContract(options.request, outcome, 1 + references.length, executionMode), provider: outcome.provider };
}

