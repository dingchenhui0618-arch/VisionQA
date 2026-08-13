import {
  assertProviderObservationDraft,
  VisionProviderError,
  type ProviderEvaluationInput,
  type ProviderObservationDraft,
  type ProviderObservationEnvelope,
  type VisionProviderAdapter,
} from "./types.ts";

export interface OpenAIVisionAdapterOptions {
  apiKey: string;
  model: string;
  maxConcurrency: number;
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

const MAX_PRIVATE_URL_TTL_MS = 15 * 60 * 1000;
let activeOpenAIRequests = 0;

function assertShortLivedPrivateImages(input: ProviderEvaluationInput): void {
  const now = Date.now();
  for (const image of [input.candidate, ...input.references]) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(image.url);
    } catch {
      throw new VisionProviderError(
        "CONFIGURATION",
        "Live provider image inputs must use valid private HTTPS URLs.",
      );
    }
    const expiresAt = Date.parse(image.expiresAt ?? "");
    if (
      parsedUrl.protocol !== "https:" ||
      image.access !== "short_lived_private" ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now ||
      expiresAt - now > MAX_PRIVATE_URL_TTL_MS
    ) {
      throw new VisionProviderError(
        "CONFIGURATION",
        "Live provider image inputs require private HTTPS URLs expiring within 15 minutes.",
      );
    }
  }
}

function extractOutputText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const response = body as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof response.output_text === "string") return response.output_text;
  for (const output of response.output ?? []) {
    for (const content of output.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

function parseDraft(text: string): ProviderObservationDraft {
  try {
    const value: unknown = JSON.parse(text);
    assertProviderObservationDraft(value);
    return value;
  } catch (error) {
    if (error instanceof VisionProviderError) throw error;
    throw new VisionProviderError("INVALID_OUTPUT", "Provider returned invalid JSON.", {
      cause: error,
    });
  }
}

function classifyHttpError(status: number): VisionProviderError {
  if (status === 401 || status === 403) {
    return new VisionProviderError(
      "AUTHENTICATION",
      "Vision provider authentication failed.",
      { status },
    );
  }
  if (status === 429) {
    return new VisionProviderError("RATE_LIMITED", "Vision provider rate limit reached.", {
      retryable: true,
      status,
    });
  }
  if (status >= 500) {
    return new VisionProviderError(
      "PROVIDER_UNAVAILABLE",
      "Vision provider is temporarily unavailable.",
      { retryable: true, status },
    );
  }
  return new VisionProviderError("INVALID_OUTPUT", "Vision provider rejected the request.", {
    status,
  });
}

function buildPrompt(input: ProviderEvaluationInput): string {
  return [
    "你是 VisionQA 的模型观察层，只描述图片中有证据支持的观察，不决定 PASS/REVIEW/REJECT。",
    `场景：${input.scene}；图位：${input.placement}。`,
    `商业模板：${input.commercialTemplate.id}@${input.commercialTemplate.version}。`,
    `评估范围：${input.commercialTemplate.assessmentScope}`,
    `锁定商品属性：${input.lockedAttributes.join("、") || "未提供"}。`,
    "输出严格 JSON，字段为 observations、skillAssessments、commercialAssessment、requiredHumanChecks。",
    "商业六项字段必须为 product_prominence、selling_point_clarity、promotion_hierarchy、information_legibility、click_motivation、channel_placement_fit。",
    "每个非空分数都必须给出可在输入图片中复核的 evidence；证据不足时 score=null、assessability=LIMITED 或 NOT_ASSESSABLE，禁止猜测。",
    "不得输出最终 Gate、综合分、分档或修复 Prompt。",
  ].join("\n");
}

export class OpenAIResponsesVisionAdapter implements VisionProviderAdapter {
  readonly providerId = "openai";
  readonly adapterVersion = "openai-responses-adapter-0.1.0";
  private readonly options: OpenAIVisionAdapterOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly endpoint: string;

  constructor(options: OpenAIVisionAdapterOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.endpoint = options.endpoint ?? "https://api.openai.com/v1/responses";
  }

  async evaluate(
    input: ProviderEvaluationInput,
    signal: AbortSignal,
  ): Promise<ProviderObservationEnvelope> {
    const startedAt = Date.now();
    assertShortLivedPrivateImages(input);
    if (activeOpenAIRequests >= this.options.maxConcurrency) {
      throw new VisionProviderError(
        "CONFIGURATION",
        "Live provider concurrency limit reached before network dispatch.",
      );
    }
    const imageContent = [input.candidate, ...input.references].map((image) => ({
      type: "input_image",
      image_url: image.url,
      detail: "high",
    }));

    let response: Response;
    activeOpenAIRequests += 1;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
          "X-Client-Request-Id": input.requestId,
        },
        body: JSON.stringify({
          model: this.options.model,
          store: false,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: buildPrompt(input) },
                ...imageContent,
              ],
            },
          ],
        }),
        signal,
      });
    } catch (error) {
      if (signal.aborted) {
        throw new VisionProviderError("ABORTED", "Vision provider request was aborted.", {
          cause: error,
        });
      }
      throw new VisionProviderError("NETWORK", "Vision provider network request failed.", {
        retryable: true,
        cause: error,
      });
    } finally {
      activeOpenAIRequests -= 1;
    }

    if (!response.ok) throw classifyHttpError(response.status);
    const body = (await response.json()) as {
      id?: string;
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const outputText = extractOutputText(body);
    if (!outputText) {
      throw new VisionProviderError("INVALID_OUTPUT", "Provider response has no output text.");
    }

    return {
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      modelSnapshot: this.options.model,
      providerRequestId: body.id ?? null,
      latencyMs: Date.now() - startedAt,
      usage: {
        inputTokens: body.usage?.input_tokens ?? null,
        outputTokens: body.usage?.output_tokens ?? null,
      },
      warnings: [],
      observationDraft: parseDraft(outputText),
    };
  }
}
