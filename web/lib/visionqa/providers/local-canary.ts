import {
  buildQwenCompatibleRequestBody,
  classifyQwenBusinessError,
  parseQwenObservationDraft,
} from "./qwen.ts";
import {
  QWEN_BAILIAN_DEFINITION,
  QWEN_BAILIAN_MODEL_SNAPSHOT,
} from "./registry.ts";
import {
  VisionProviderError,
  type ProviderEvaluationInput,
  type ProviderObservationEnvelope,
  type VisionProviderAdapter,
} from "./types.ts";

export const LOCAL_CANARY_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const LOCAL_CANARY_MAX_REFERENCE_IMAGES = 4;
export const LOCAL_CANARY_MAX_TOTAL_IMAGE_BYTES = 14 * 1024 * 1024;
export const LOCAL_CANARY_MAX_TOTAL_REQUESTS = 10;
export const LOCAL_CANARY_MAX_CONCURRENCY = 1;
export const LOCAL_CANARY_BUDGET_MINOR_UNITS = 2_000;

type Environment = Record<string, string | undefined>;

export type LocalCanaryReadiness = {
  configured: boolean;
  providerId: string;
  modelSnapshot: string;
  maxImageBytes: number;
  maxTotalRequests: number;
  budgetCurrency: "CNY";
  budgetMinorUnits: number;
  missing: string[];
};

type LocalCanaryOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
};

let activeRequests = 0;
let dispatchedRequests = 0;

function configuredApiKey(env: Environment): string {
  return (
    env.VISION_CN_ALIYUN_BAILIAN_API_KEY?.trim() ||
    env.DASHSCOPE_API_KEY?.trim() ||
    ""
  );
}

export function getLocalCanaryReadiness(
  env: Environment,
): LocalCanaryReadiness {
  const requiredExact: Record<string, string> = {
    VISION_LOCAL_CANARY_ENABLED: "true",
    VISION_PAID_CALLS_ENABLED: "true",
    VISION_DATA_PROCESSING_APPROVED: "true",
    EXPLICIT_RUN_APPROVAL: "true",
    VISION_MODEL: QWEN_BAILIAN_MODEL_SNAPSHOT,
    VISION_BUDGET_CURRENCY: "CNY",
    VISION_BUDGET_LIMIT_MINOR_UNITS: String(
      LOCAL_CANARY_BUDGET_MINOR_UNITS,
    ),
    VISION_LOCAL_CANARY_MAX_TOTAL_REQUESTS: String(
      LOCAL_CANARY_MAX_TOTAL_REQUESTS,
    ),
    VISION_MAX_CONCURRENCY: String(LOCAL_CANARY_MAX_CONCURRENCY),
  };
  const missing = Object.entries(requiredExact)
    .filter(([name, expected]) => env[name] !== expected)
    .map(([name]) => name);
  if (!configuredApiKey(env)) missing.push("DASHSCOPE_API_KEY");

  return {
    configured: missing.length === 0,
    providerId: QWEN_BAILIAN_DEFINITION.providerId,
    modelSnapshot: QWEN_BAILIAN_MODEL_SNAPSHOT,
    maxImageBytes: LOCAL_CANARY_MAX_IMAGE_BYTES,
    maxTotalRequests: LOCAL_CANARY_MAX_TOTAL_REQUESTS,
    budgetCurrency: "CNY",
    budgetMinorUnits: LOCAL_CANARY_BUDGET_MINOR_UNITS,
    missing,
  };
}

function assertLocalCanaryEnvironment(env: Environment): string {
  const readiness = getLocalCanaryReadiness(env);
  if (!readiness.configured) {
    throw new VisionProviderError(
      "CONFIGURATION",
      "The local Qwen canary is not fully authorized or configured.",
    );
  }
  return configuredApiKey(env);
}

function base64ImageBytes(url: string): number {
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  if (!match) {
    throw new VisionProviderError(
      "UNSUPPORTED_MEDIA",
      "The local canary requires JPEG, PNG, or WebP Base64 data URLs.",
    );
  }
  const payload = match[2];
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

function assertBase64Images(input: ProviderEvaluationInput): void {
  if (input.references.length > LOCAL_CANARY_MAX_REFERENCE_IMAGES) {
    throw new VisionProviderError(
      "PAYLOAD_TOO_LARGE",
      `The local canary accepts at most ${LOCAL_CANARY_MAX_REFERENCE_IMAGES} reference images.`,
    );
  }
  const sizes = [input.candidate, ...input.references].map((image) =>
    base64ImageBytes(image.url),
  );
  if (
    sizes.some((size) => size <= 0 || size > LOCAL_CANARY_MAX_IMAGE_BYTES) ||
    sizes.reduce((sum, size) => sum + size, 0) > LOCAL_CANARY_MAX_TOTAL_IMAGE_BYTES
  ) {
    throw new VisionProviderError(
      "PAYLOAD_TOO_LARGE",
      "The local canary image payload exceeds the governed limit.",
    );
  }
}

function classifyHttpError(status: number): VisionProviderError {
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
      { status, retryable: true },
    );
  }
  if (status >= 500) {
    return new VisionProviderError(
      "PROVIDER_UNAVAILABLE",
      "Qwen provider is temporarily unavailable.",
      { status, retryable: true },
    );
  }
  return new VisionProviderError(
    "INVALID_OUTPUT",
    "Qwen rejected the request.",
    { status },
  );
}

class LocalCanaryQwenAdapter implements VisionProviderAdapter {
  readonly providerId = QWEN_BAILIAN_DEFINITION.providerId;
  readonly adapterVersion = "qwen-local-base64-canary-0.1.0";
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LocalCanaryOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async evaluate(
    input: ProviderEvaluationInput,
    signal: AbortSignal,
  ): Promise<ProviderObservationEnvelope> {
    assertBase64Images(input);
    if (activeRequests >= LOCAL_CANARY_MAX_CONCURRENCY) {
      throw new VisionProviderError(
        "RATE_LIMITED",
        "Another local canary request is already running.",
        { retryable: true },
      );
    }
    if (dispatchedRequests >= LOCAL_CANARY_MAX_TOTAL_REQUESTS) {
      throw new VisionProviderError(
        "QUOTA_EXHAUSTED",
        "The local canary request cap has been reached.",
      );
    }

    activeRequests += 1;
    dispatchedRequests += 1;
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await this.fetchImpl(QWEN_BAILIAN_DEFINITION.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "X-DashScope-Request-Id": input.requestId,
        },
        body: JSON.stringify(buildQwenCompatibleRequestBody(input)),
        signal,
      });
    } catch (error) {
      if (signal.aborted) {
        throw new VisionProviderError("ABORTED", "Qwen request was aborted.", {
          cause: error,
        });
      }
      throw new VisionProviderError(
        "NETWORK",
        "Qwen network request failed.",
        { cause: error, retryable: true },
      );
    } finally {
      activeRequests -= 1;
    }

    if (!response.ok) throw classifyHttpError(response.status);
    const body = (await response.json()) as {
      id?: string;
      request_id?: string;
      model?: string;
      code?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
      };
    };
    const businessError = classifyQwenBusinessError(body.code);
    if (businessError) throw businessError;
    if (body.code) {
      throw new VisionProviderError(
        "INVALID_OUTPUT",
        "Qwen returned an unknown business error.",
      );
    }
    if (body.model && body.model !== QWEN_BAILIAN_MODEL_SNAPSHOT) {
      throw new VisionProviderError(
        "INVALID_OUTPUT",
        "Qwen responded with an unexpected model snapshot.",
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
      modelSnapshot: QWEN_BAILIAN_MODEL_SNAPSHOT,
      providerRequestId: body.id ?? body.request_id ?? null,
      latencyMs: Date.now() - startedAt,
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? null,
        outputTokens: body.usage?.completion_tokens ?? null,
      },
      warnings: ["LOCAL_CANARY_BASE64_NO_APP_PERSISTENCE"],
      observationDraft: parseQwenObservationDraft(outputText),
    };
  }
}

export function createLocalCanaryQwenAdapter(
  env: Environment,
  options: { fetchImpl?: typeof fetch } = {},
): VisionProviderAdapter {
  return new LocalCanaryQwenAdapter({
    apiKey: assertLocalCanaryEnvironment(env),
    fetchImpl: options.fetchImpl,
  });
}
