import type {
  Assessability,
  CommercialMetricId,
  ObservationV03,
} from "../contracts.ts";

export type ProviderErrorCode =
  | "CONFIGURATION"
  | "AUTHENTICATION"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NETWORK"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_OUTPUT"
  | "POLICY_BLOCKED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA"
  | "QUOTA_EXHAUSTED"
  | "ABORTED";

export class VisionProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    code: ProviderErrorCode,
    message: string,
    options: { retryable?: boolean; status?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "VisionProviderError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

export interface ProviderImageInput {
  url: string;
  role: "candidate" | "reference";
  mimeType?: "image/jpeg" | "image/png" | "image/webp";
  access?: "short_lived_private";
  expiresAt?: string;
  privateEnvelope?: {
    version: "v1";
    issuer: "visionqa-staging-asset-signer-v1";
    nonce: string;
    assetSha256: string;
    byteSize: number;
    urlHost: string;
    urlPathSha256: string;
    urlSha256: string;
    signature: string;
  };
}

export interface ProviderEvaluationInput {
  requestId: string;
  runId: string;
  assetId: string;
  scene: string;
  placement: string;
  candidate: ProviderImageInput;
  references: ProviderImageInput[];
  lockedAttributes: string[];
  taxonomyVersion: string;
  commercialTemplate: {
    id: string;
    version: string;
    assessmentScope: string;
  };
  promptVersion: string;
}

export interface ProviderSkillDraft {
  score: number | null;
  assessability: Assessability;
  evidence: string[];
  summary: string;
}

export interface ProviderCommercialMetricDraft {
  score: number | null;
  assessability: Assessability;
  evidence: string[];
  summary: string;
}

export interface ProviderObservationDraft {
  observations: ObservationV03[];
  skillAssessments: Record<
    "human_realism" | "photography_realism" | "material_realism",
    ProviderSkillDraft
  >;
  commercialAssessment: {
    assessability: Assessability;
    metrics: Record<CommercialMetricId, ProviderCommercialMetricDraft>;
    strengths: string[];
    gaps: string[];
    summary: string;
  };
  requiredHumanChecks: string[];
}

export interface ProviderObservationEnvelope {
  providerId: string;
  adapterVersion: string;
  modelSnapshot: string;
  providerRequestId: string | null;
  latencyMs: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
  };
  warnings: string[];
  observationDraft: ProviderObservationDraft;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const ASSESSABILITY_VALUES = new Set([
  "FULL",
  "LIMITED",
  "NOT_ASSESSABLE",
  "NOT_APPLICABLE",
]);

function isDraftScore(value: unknown): boolean {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100)
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  );
}

function isAssessmentDraft(value: unknown): boolean {
  return (
    isObject(value) &&
    isDraftScore(value.score) &&
    ASSESSABILITY_VALUES.has(value.assessability) &&
    isStringArray(value.evidence) &&
    typeof value.summary === "string"
  );
}

export function assertProviderObservationDraft(
  value: unknown,
): asserts value is ProviderObservationDraft {
  if (!isObject(value)) {
    throw new VisionProviderError("INVALID_OUTPUT", "Provider draft must be an object.");
  }
  if (!Array.isArray(value.observations)) {
    throw new VisionProviderError(
      "INVALID_OUTPUT",
      "Provider draft observations must be an array.",
    );
  }
  for (const observation of value.observations) {
    if (!isObject(observation)) throw new VisionProviderError("INVALID_OUTPUT", "Provider observation must be an object.");
    for (const key of ["candidateEvidence", "referenceEvidence", "candidateImageIndex", "referenceImageIndex", "candidateCount", "referenceCount", "changeType"] as const) {
      if (!(key in observation) || observation[key] === undefined) continue;
      const valid = key === "changeType"
        ? ["ADDED", "MISSING", "CHANGED"].includes(String(observation[key]))
        : key.endsWith("Index") || key.endsWith("Count")
          ? Number.isInteger(observation[key]) && Number(observation[key]) > 0
          : typeof observation[key] === "string" && Boolean(String(observation[key]).trim());
      if (!valid) throw new VisionProviderError("INVALID_OUTPUT", `Provider observation ${key} is invalid.`);
    }
  }
  if (!isObject(value.skillAssessments)) {
    throw new VisionProviderError(
      "INVALID_OUTPUT",
      "Provider draft skillAssessments must be an object.",
    );
  }
  for (const skillId of [
    "human_realism",
    "photography_realism",
    "material_realism",
  ]) {
    const skill = value.skillAssessments[skillId];
    if (!isAssessmentDraft(skill)) {
      throw new VisionProviderError(
        "INVALID_OUTPUT",
        `Provider draft skill ${skillId} is invalid.`,
      );
    }
  }
  if (!isObject(value.commercialAssessment)) {
    throw new VisionProviderError(
      "INVALID_OUTPUT",
      "Provider draft commercialAssessment must be an object.",
    );
  }
  const commercial = value.commercialAssessment;
  if (
    !isObject(commercial.metrics) ||
    !ASSESSABILITY_VALUES.has(commercial.assessability) ||
    !isStringArray(commercial.strengths) ||
    !isStringArray(commercial.gaps) ||
    typeof commercial.summary !== "string"
  ) {
    throw new VisionProviderError(
      "INVALID_OUTPUT",
      "Provider commercial assessment fields are invalid.",
    );
  }
  for (const metricId of [
    "product_prominence",
    "selling_point_clarity",
    "promotion_hierarchy",
    "information_legibility",
    "click_motivation",
    "channel_placement_fit",
  ]) {
    const metric = commercial.metrics[metricId];
    if (!isAssessmentDraft(metric)) {
      throw new VisionProviderError(
        "INVALID_OUTPUT",
        `Provider commercial metric ${metricId} is invalid.`,
      );
    }
  }
  if (!isStringArray(value.requiredHumanChecks)) {
    throw new VisionProviderError(
      "INVALID_OUTPUT",
      "Provider draft requiredHumanChecks must be an array.",
    );
  }
}

export interface VisionProviderAdapter {
  readonly providerId: string;
  readonly adapterVersion: string;
  evaluate(
    input: ProviderEvaluationInput,
    signal: AbortSignal,
  ): Promise<ProviderObservationEnvelope>;
}

export interface RetryOptions {
  maxAttempts?: number;
  attemptTimeoutMs?: number;
  baseDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
}

export async function evaluateWithRetry(
  adapter: VisionProviderAdapter,
  input: ProviderEvaluationInput,
  signal: AbortSignal,
  options: RetryOptions = {},
): Promise<ProviderObservationEnvelope> {
  const maxAttempts = options.maxAttempts ?? 3;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? 35_000;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const sleep =
    options.sleep ??
    ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const random = options.random ?? Math.random;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (signal.aborted) {
      throw new VisionProviderError("ABORTED", "Vision evaluation was aborted.");
    }

    const attemptController = new AbortController();
    const abortAttempt = () => attemptController.abort(signal.reason);
    signal.addEventListener("abort", abortAttempt, { once: true });
    const timeout = setTimeout(() => attemptController.abort("attempt-timeout"), attemptTimeoutMs);

    try {
      return await adapter.evaluate(input, attemptController.signal);
    } catch (error) {
      lastError =
        attemptController.signal.aborted && !signal.aborted
          ? new VisionProviderError("TIMEOUT", "Vision provider attempt timed out.", {
              retryable: true,
              cause: error,
            })
          : error;
      const retryable =
        lastError instanceof VisionProviderError && lastError.retryable;
      if (!retryable || attempt === maxAttempts) throw lastError;

      const jitter = 0.75 + random() * 0.5;
      await sleep(Math.round(baseDelayMs * 2 ** (attempt - 1) * jitter));
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abortAttempt);
    }
  }

  throw lastError;
}
