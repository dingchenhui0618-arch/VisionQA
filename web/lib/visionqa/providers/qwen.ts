import { assertProviderImages } from "./image-preflight.ts";
import {
  assertQwenGovernance,
  type VisionProviderEnvironment,
} from "./governance.ts";
import {
  QWEN_BAILIAN_DEFINITION,
} from "./registry.ts";
import { LIVE_EVALUATION_MAX_COMPLETION_TOKENS } from "../live-evaluation-contract.ts";
import {
  assertProviderObservationDraft,
  VisionProviderError,
  type ProviderEvaluationInput,
  type ProviderObservationDraft,
  type ProviderObservationEnvelope,
  type VisionProviderAdapter,
} from "./types.ts";

interface QwenVisionAdapterOptions {
  apiKey: string;
  imageEnvelopeHmacSecret: string;
  maxConcurrency: number;
  fetchImpl?: typeof fetch;
}

let activeQwenRequests = 0;

function buildStrictPrompt(input: ProviderEvaluationInput): string {
  const repairTruthInstructions = input.commercialTemplate.id === "ai_model_image_repair"
    ? [
        `Image order: image 1 is the candidate under review; images 2-${input.references.length + 1} are authoritative customer-approved SKU truth references, not style inspiration. Treat visible SKU facts in those references as the source of truth.`,
        "Before scoring aesthetics, compare the candidate against SKU truth item by item: garment color, silhouette, neckline, sleeve and hem structure, exact button count, pockets, zippers, prints, embroidery, Logo/wordmark count, shape and placement, material texture and visible construction details.",
        "Duplicated, missing, added, moved or malformed SKU details in the candidate are primary merchandise-consistency defects. Report each visible mismatch directly; do not reinterpret an extra duplicated embroidery or print as a minor style-position preference.",
        "When describing left/right, state both image-side and wearer-side when confidently visible. Never report a truth-reference defect as a candidate defect.",
      ]
    : [
        `Image order: image 1 is the candidate under review; images 2-${input.references.length + 1} are customer-approved historical references. Do not report reference-image defects as candidate-image defects.`,
      ];
  return [
    "You are the VisionQA visual observation layer.",
    "All user-facing text must be written in Simplified Chinese, including observation, impact, evidence, summary, strengths, gaps, and requiredHumanChecks. Only machine fields such as issue_code and enum values may remain in English.",
    "Return only one JSON object. Do not include markdown, prose, comments, final gate decisions, weights, overall scores, score bands, or repair prompts.",
    `Scene: ${input.scene}`,
    `Placement: ${input.placement}`,
    `Commercial template: ${input.commercialTemplate.id}@${input.commercialTemplate.version}`,
    `Assessment scope: ${input.commercialTemplate.assessmentScope}`,
    `Locked attributes: ${input.lockedAttributes.join(", ") || "none"}`,
    ...repairTruthInstructions,
    "Use only visible evidence from the input image. Do not guess or fabricate evidence. 不得猜测或补造证据。If evidence is insufficient, set score to null and explain the missing evidence in summary or requiredHumanChecks.",
    "Apply this strict calibration scale to every scored field: 90-100 is exceptional and requires concrete visible evidence that the image has almost no meaningful gap for the stated placement; 80-89 is strong professional commercial work with normal improvable gaps; 70-79 is usable but needs clear optimization; below 70 needs substantial rework. A polished or attractive image is not automatically 90+.",
    "The human calibration reference distribution for strong, already-used apparel commercial images is typically 82-91. Do not compress most good images into 90-100. Lifestyle campaign images require the same strict evidence standard for 90+ as product main images.",
    "The JSON object must match this exact shape:",
    "{",
    "  \"observations\": [",
    "    {",
    "      \"observation_id\": \"obs_001\",",
    "      \"issue_code\": \"short_snake_case_or_information_only\",",
    "      \"primary_skill\": \"HUM|PHO|MAT|COM|null\",",
    "      \"severity\": \"blocker|major|minor|information_insufficient\",",
    "      \"status\": \"detected|suspected|not_assessable\",",
    "      \"observation\": \"visible fact, not advice\",",
    "      \"impact\": \"business or quality impact\"",
    "    }",
    "  ],",
    "  \"skillAssessments\": {",
    "    \"human_realism\": { \"score\": 0, \"assessability\": \"FULL|LIMITED|NOT_ASSESSABLE|NOT_APPLICABLE\", \"evidence\": [\"visible evidence\"], \"summary\": \"short summary\" },",
    "    \"photography_realism\": { \"score\": 0, \"assessability\": \"FULL|LIMITED|NOT_ASSESSABLE|NOT_APPLICABLE\", \"evidence\": [\"visible evidence\"], \"summary\": \"short summary\" },",
    "    \"material_realism\": { \"score\": 0, \"assessability\": \"FULL|LIMITED|NOT_ASSESSABLE|NOT_APPLICABLE\", \"evidence\": [\"visible evidence\"], \"summary\": \"short summary\" }",
    "  },",
    "  \"commercialAssessment\": {",
    "    \"assessability\": \"FULL|LIMITED|NOT_ASSESSABLE|NOT_APPLICABLE\",",
    "    \"metrics\": {",
    "      \"product_prominence\": { \"score\": 0, \"assessability\": \"FULL|LIMITED|NOT_ASSESSABLE|NOT_APPLICABLE\", \"evidence\": [\"visible evidence\"], \"summary\": \"short summary\" },",
    "      \"selling_point_clarity\": { \"score\": 0, \"assessability\": \"FULL|LIMITED|NOT_ASSESSABLE|NOT_APPLICABLE\", \"evidence\": [\"visible evidence\"], \"summary\": \"short summary\" },",
    "      \"promotion_hierarchy\": { \"score\": 0, \"assessability\": \"FULL|LIMITED|NOT_ASSESSABLE|NOT_APPLICABLE\", \"evidence\": [\"visible evidence\"], \"summary\": \"short summary\" },",
    "      \"information_legibility\": { \"score\": 0, \"assessability\": \"FULL|LIMITED|NOT_ASSESSABLE|NOT_APPLICABLE\", \"evidence\": [\"visible evidence\"], \"summary\": \"short summary\" },",
    "      \"click_motivation\": { \"score\": 0, \"assessability\": \"FULL|LIMITED|NOT_ASSESSABLE|NOT_APPLICABLE\", \"evidence\": [\"visible evidence\"], \"summary\": \"short summary\" },",
    "      \"channel_placement_fit\": { \"score\": 0, \"assessability\": \"FULL|LIMITED|NOT_ASSESSABLE|NOT_APPLICABLE\", \"evidence\": [\"visible evidence\"], \"summary\": \"short summary\" }",
    "    },",
    "    \"strengths\": [\"visible commercial strength\"],",
    "    \"gaps\": [\"visible commercial gap\"],",
    "    \"summary\": \"short commercial summary\"",
    "  },",
    "  \"requiredHumanChecks\": [\"human check needed\"]",
    "}",
    "Scores must be numbers from 0 to 100 or null. Every non-null score must have at least one concrete evidence string.",
    "For a metric that the stated placement does not require, use score null with assessability NOT_APPLICABLE. Do not penalize a lifestyle, ordinary product, or aesthetic-reference image for lacking promotion text when the assessment scope says promotion is not required.",
    "For ai_model_image_repair, the absence of price, discount, CTA, campaign copy, or other promotion overlays is expected and must never become an observation, gap, repair action, low score, or Gate reason. Mark promotion_hierarchy and information_legibility null with NOT_APPLICABLE unless the scope explicitly says that supplied overlay content must be preserved.",
    "information_legibility evaluates overlaid commercial information such as price, promotion, selling-point copy, CTA, or brand lockup. Garment prints, incidental scene text, copyright marks, or background signs do not make this metric applicable. If no required commercial overlay exists, return null and NOT_APPLICABLE.",
    "Exception for platform_promotion_main_image: promotion hierarchy and commercial information legibility are required. If the overlay is missing, score those required metrics 0-30 with assessability FULL or LIMITED; never mark them NOT_APPLICABLE merely because the required content is absent.",
  ].join("\n");
}

function unwrapJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  const unfenced = fenced ? fenced[1].trim() : trimmed;
  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");
  return firstBrace >= 0 && lastBrace > firstBrace
    ? unfenced.slice(firstBrace, lastBrace + 1)
    : unfenced;
}

const COMMERCIAL_METRIC_IDS = [
  "product_prominence",
  "selling_point_clarity",
  "promotion_hierarchy",
  "information_legibility",
  "click_motivation",
  "channel_placement_fit",
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

const OBSERVATION_LOCALIZATIONS: Record<
  string,
  { observation: string; impact: string }
> = {
  no_promotion_overlay: {
    observation:
      "图片未包含平台促销主图要求的价格、促销标签、卖点文案、行动按钮或品牌锁定等商业叠加信息。",
    impact: "不满足平台促销主图的必要信息要求，无法清晰传达优惠并推动转化。",
  },
  garment_logo_visible: {
    observation: "服装上的品牌标识清晰可见，可用于核对 Logo 忠实度。",
    impact: "能够支持品牌标识一致性判断，但不能抵消促销信息层缺失等其他问题。",
  },
  fabric_texture_visible: {
    observation: "画面中可见面料纹理、褶皱或透光变化，可用于材质真实性判断。",
    impact: "能够支持材质真实性评估；若缺少近景参考，仍需人工核验纺织细节。",
  },
};

function normalizeObservation(value: unknown) {
  const source = asRecord(value);
  const issueCode = String(source.issue_code ?? "unclassified_issue").trim();
  const localized = OBSERVATION_LOCALIZATIONS[issueCode];
  return {
    observation_id: String(source.observation_id ?? "obs_unclassified").trim(),
    issue_code: issueCode,
    primary_skill: source.primary_skill ?? null,
    severity: source.severity ?? "information_insufficient",
    status: source.status ?? "not_assessable",
    observation:
      localized?.observation ??
      (typeof source.observation === "string" && source.observation.trim()
        ? source.observation.trim()
        : "证据不足，需人工复核。"),
    impact:
      localized?.impact ??
      (typeof source.impact === "string" && source.impact.trim()
        ? source.impact.trim()
        : "当前证据不足，不能直接形成业务结论。"),
  };
}

function asScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
    ? parsed
    : null;
}

function asAssessability(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
  return ["FULL", "LIMITED", "NOT_ASSESSABLE", "NOT_APPLICABLE"].includes(
    normalized,
  )
    ? normalized
    : "NOT_ASSESSABLE";
}

function normalizeAssessment(value: unknown) {
  const source = asRecord(value);
  const evidence = asStringArray(source.evidence);
  return {
    score: asScore(source.score),
    assessability: asAssessability(source.assessability),
    evidence,
    summary:
      typeof source.summary === "string" && source.summary.trim()
        ? source.summary.trim()
        : evidence[0] ?? "Evidence is insufficient; human review required.",
  };
}

function normalizeProviderDraft(value: unknown): unknown {
  const source = asRecord(value);
  const skills = asRecord(source.skillAssessments);
  const commercial = asRecord(source.commercialAssessment);
  const metrics = asRecord(commercial.metrics);
  const normalizedMetrics = Object.fromEntries(
    COMMERCIAL_METRIC_IDS.map((metricId) => [
      metricId,
      normalizeAssessment(metrics[metricId]),
    ]),
  );
  return {
    observations: Array.isArray(source.observations)
      ? source.observations.map(normalizeObservation)
      : [],
    skillAssessments: {
      human_realism: normalizeAssessment(skills.human_realism),
      photography_realism: normalizeAssessment(skills.photography_realism),
      material_realism: normalizeAssessment(skills.material_realism),
    },
    commercialAssessment: {
      assessability: asAssessability(commercial.assessability),
      metrics: normalizedMetrics,
      strengths: asStringArray(commercial.strengths),
      gaps: asStringArray(commercial.gaps),
      summary:
        typeof commercial.summary === "string" && commercial.summary.trim()
          ? commercial.summary.trim()
          : "Commercial evidence is insufficient; human review required.",
    },
    requiredHumanChecks: asStringArray(source.requiredHumanChecks),
  };
}

export function parseQwenObservationDraft(
  text: string,
): ProviderObservationDraft {
  try {
    const normalized = unwrapJsonObject(text);
    const value: unknown = normalizeProviderDraft(JSON.parse(normalized));
    assertProviderObservationDraft(value);
    return value;
  } catch (error) {
    if (error instanceof VisionProviderError) throw error;
    throw new VisionProviderError(
      "INVALID_OUTPUT",
      "Qwen returned an invalid observation JSON object.",
      { cause: error },
    );
  }
}

function classifyQwenHttpError(status: number): VisionProviderError {
  if (status === 401 || status === 403) {
    return new VisionProviderError(
      "AUTHENTICATION",
      "Qwen provider authentication failed.",
      { status },
    );
  }
  if (status === 413) {
    return new VisionProviderError(
      "PAYLOAD_TOO_LARGE",
      "Qwen rejected an oversized request.",
      { status },
    );
  }
  if (status === 429) {
    return new VisionProviderError(
      "RATE_LIMITED",
      "Qwen provider rate limit reached.",
      { retryable: true, status },
    );
  }
  if (status >= 500) {
    return new VisionProviderError(
      "PROVIDER_UNAVAILABLE",
      "Qwen provider is temporarily unavailable.",
      { retryable: true, status },
    );
  }
  return new VisionProviderError(
    "INVALID_OUTPUT",
    "Qwen rejected the request.",
    { status },
  );
}

export function classifyQwenBusinessError(
  code: string | undefined,
): VisionProviderError | null {
  if (!code) return null;
  const normalized = code.toLowerCase();
  if (normalized.includes("throttl") || normalized.includes("ratelimit")) {
    return new VisionProviderError(
      "RATE_LIMITED",
      "Qwen provider rate limit reached.",
      { retryable: true },
    );
  }
  if (
    normalized.includes("datainspection") ||
    normalized.includes("content") ||
    normalized.includes("inappropriate")
  ) {
    return new VisionProviderError(
      "POLICY_BLOCKED",
      "Qwen content policy blocked the request.",
    );
  }
  if (
    normalized.includes("quota") ||
    normalized.includes("arrear") ||
    normalized.includes("balance")
  ) {
    return new VisionProviderError(
      "QUOTA_EXHAUSTED",
      "Qwen account quota is unavailable.",
    );
  }
  if (normalized.includes("model")) {
    return new VisionProviderError(
      "CONFIGURATION",
      "The approved Qwen model is unavailable.",
    );
  }
  return null;
}

class QwenBailianVisionAdapter implements VisionProviderAdapter {
  readonly providerId: string;
  readonly adapterVersion = "qwen-bailian-compatible-adapter-0.1.0";
  private readonly options: QwenVisionAdapterOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: QwenVisionAdapterOptions) {
    this.options = options;
    this.providerId = QWEN_BAILIAN_DEFINITION.providerId;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async evaluate(
    input: ProviderEvaluationInput,
    signal: AbortSignal,
  ): Promise<ProviderObservationEnvelope> {
    await assertProviderImages(
      input,
      QWEN_BAILIAN_DEFINITION,
      this.options.imageEnvelopeHmacSecret,
    );
    if (activeQwenRequests >= this.options.maxConcurrency) {
      throw new VisionProviderError(
        "CONFIGURATION",
        "Qwen concurrency limit reached before network dispatch.",
      );
    }

    const startedAt = Date.now();
    let response: Response;
    activeQwenRequests += 1;
    try {
      response = await this.fetchImpl(QWEN_BAILIAN_DEFINITION.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
          "X-DashScope-Request-Id": input.requestId,
        },
        body: JSON.stringify(buildQwenCompatibleRequestBody(input)),
        signal,
      });
    } catch (error) {
      if (signal.aborted) {
        throw new VisionProviderError(
          "ABORTED",
          "Qwen request was aborted.",
          { cause: error },
        );
      }
      throw new VisionProviderError(
        "NETWORK",
        "Qwen network request failed.",
        { retryable: true, cause: error },
      );
    } finally {
      activeQwenRequests -= 1;
    }

    if (!response.ok) throw classifyQwenHttpError(response.status);
    const body = (await response.json()) as {
      id?: string;
      request_id?: string;
      code?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
      };
      model?: string;
    };
    const businessError = classifyQwenBusinessError(body.code);
    if (businessError) throw businessError;
    if (
      body.model &&
      body.model !== QWEN_BAILIAN_DEFINITION.modelSnapshot
    ) {
      throw new VisionProviderError(
        "INVALID_OUTPUT",
        "Qwen responded with an unapproved model snapshot.",
      );
    }
    const outputText = body.choices?.[0]?.message?.content;
    if (typeof outputText !== "string") {
      throw new VisionProviderError(
        "INVALID_OUTPUT",
        "Qwen response has no observation JSON.",
      );
    }
    return {
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      modelSnapshot: QWEN_BAILIAN_DEFINITION.modelSnapshot,
      providerRequestId: body.id ?? body.request_id ?? null,
      latencyMs: Date.now() - startedAt,
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? null,
        outputTokens: body.usage?.completion_tokens ?? null,
      },
      warnings: [],
      observationDraft: parseQwenObservationDraft(outputText),
    };
  }
}

export function buildQwenCompatibleRequestBody(
  input: ProviderEvaluationInput,
): Record<string, unknown> {
  return {
    model: QWEN_BAILIAN_DEFINITION.modelSnapshot,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildStrictPrompt(input) },
          ...[input.candidate, ...input.references].map((image) => ({
            type: "image_url",
            image_url: { url: image.url },
          })),
        ],
      },
    ],
    response_format: { type: "json_object" },
    enable_thinking: false,
    max_completion_tokens: LIVE_EVALUATION_MAX_COMPLETION_TOKENS,
  };
}

/**
 * The only production construction seam. It re-runs the full governance gate
 * internally, so importing this module cannot bypass Factory approval checks.
 */
export function createGovernedQwenBailianAdapter(
  env: VisionProviderEnvironment,
  options: { fetchImpl?: typeof fetch } = {},
): VisionProviderAdapter {
  const governance = assertQwenGovernance(env);
  return new QwenBailianVisionAdapter({
    apiKey: governance.apiKey,
    imageEnvelopeHmacSecret: governance.imageEnvelopeHmacSecret,
    maxConcurrency: governance.maxConcurrency,
    fetchImpl: options.fetchImpl,
  });
}
