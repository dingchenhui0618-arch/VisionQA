import { buildQwenCompatibleRequestBody, parseQwenObservationDraft } from "./qwen.ts";
import {
  VisionProviderError,
  type ProviderEvaluationInput,
  type ProviderObservationEnvelope,
  type VisionProviderAdapter,
} from "./types.ts";

export const MULTIMODAL_ENABLED_ENV = "VISION_MULTIMODAL_ENABLED" as const;
export const MULTIMODAL_ENDPOINT_ENV = "VISION_MULTIMODAL_ENDPOINT" as const;
export const MULTIMODAL_API_KEY_ENV = "VISION_MULTIMODAL_API_KEY" as const;
export const MULTIMODAL_MODEL_ENV = "VISION_MULTIMODAL_MODEL" as const;
export const MULTIMODAL_PROVIDER_ID_ENV = "VISION_MULTIMODAL_PROVIDER_ID" as const;
export const MULTIMODAL_MAX_TOTAL_REQUESTS_ENV = "VISION_MULTIMODAL_MAX_TOTAL_REQUESTS" as const;

const DEFAULT_MAX_TOTAL_REQUESTS = 15;
const DEFAULT_PROVIDER_ID = "user-multimodal";
const MAX_ENDPOINT_LENGTH = 500;
const MAX_MODEL_LENGTH = 160;

type Environment = Record<string, string | undefined>;

export type MultimodalReadiness = {
  configured: boolean;
  protocol: "openai_compatible_chat";
  endpoint: string | null;
  providerId: string;
  model: string | null;
  maxTotalRequests: number;
  dispatchedRequests: number;
  remainingRequests: number;
  missing: string[];
};

type MultimodalAdapterOptions = {
  apiKey: string;
  endpoint: string;
  model: string;
  providerId: string;
  maxTotalRequests: number;
  fetchImpl?: typeof fetch;
};

let activeRequests = 0;
let dispatchedRequests = 0;

function readMaxRequests(env: Environment): number {
  const parsed = Number(env[MULTIMODAL_MAX_TOTAL_REQUESTS_ENV] ?? DEFAULT_MAX_TOTAL_REQUESTS);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 100 ? parsed : DEFAULT_MAX_TOTAL_REQUESTS;
}

function endpointIsAllowed(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  } catch {
    return false;
  }
}

function configuredEndpoint(env: Environment): string {
  return (env[MULTIMODAL_ENDPOINT_ENV] ?? "").trim().slice(0, MAX_ENDPOINT_LENGTH);
}

function configuredModel(env: Environment): string {
  return (env[MULTIMODAL_MODEL_ENV] ?? "").trim().slice(0, MAX_MODEL_LENGTH);
}

function configuredProviderId(env: Environment): string {
  const value = (env[MULTIMODAL_PROVIDER_ID_ENV] ?? DEFAULT_PROVIDER_ID).trim().slice(0, 100);
  return /^[A-Za-z0-9._-]{1,100}$/.test(value) ? value : DEFAULT_PROVIDER_ID;
}

function configuredApiKey(env: Environment): string {
  const direct = env[MULTIMODAL_API_KEY_ENV]?.trim();
  if (direct) return direct;
  // DeepSeek is the first named Provider profile. Keep one canonical secret
  // for its planner and visual adapter instead of copying the same key into
  // two environment variables that can drift apart.
  if (configuredProviderId(env) === "deepseek") return env.DEEPSEEK_API_KEY?.trim() ?? "";
  return "";
}

export function getMultimodalReadiness(env: Environment): MultimodalReadiness {
  const endpoint = configuredEndpoint(env);
  const model = configuredModel(env);
  const providerId = configuredProviderId(env);
  const missing: string[] = [];
  if (env[MULTIMODAL_ENABLED_ENV] !== "true") missing.push(MULTIMODAL_ENABLED_ENV);
  if (!configuredApiKey(env)) missing.push(providerId === "deepseek" ? "DEEPSEEK_API_KEY" : MULTIMODAL_API_KEY_ENV);
  if (!endpoint || !endpointIsAllowed(endpoint)) missing.push(MULTIMODAL_ENDPOINT_ENV);
  if (!model) missing.push(MULTIMODAL_MODEL_ENV);
  const maxTotalRequests = readMaxRequests(env);
  return {
    configured: missing.length === 0,
    protocol: "openai_compatible_chat",
    endpoint: endpoint || null,
    providerId,
    model: model || null,
    maxTotalRequests,
    dispatchedRequests,
    remainingRequests: Math.max(0, maxTotalRequests - dispatchedRequests),
    missing,
  };
}

function classifyHttpError(status: number): VisionProviderError {
  if (status === 401 || status === 403) return new VisionProviderError("AUTHENTICATION", "用户多模态 API 鉴权失败。", { status });
  if (status === 413) return new VisionProviderError("PAYLOAD_TOO_LARGE", "用户多模态 API 拒绝了过大的图片请求。", { status });
  if (status === 429) return new VisionProviderError("RATE_LIMITED", "用户多模态 API 达到速率限制。", { status, retryable: true });
  if (status >= 500) return new VisionProviderError("PROVIDER_UNAVAILABLE", "用户多模态 API 暂时不可用。", { status, retryable: true });
  return new VisionProviderError("INVALID_OUTPUT", "用户多模态 API 拒绝了这次请求。", { status });
}

function textFromMessageContent(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const text = content
    .map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : ""))
    .filter(Boolean)
    .join("\n");
  return text || null;
}

function assertConfigured(options: MultimodalAdapterOptions): void {
  if (!options.apiKey || !endpointIsAllowed(options.endpoint) || !options.model) {
    throw new VisionProviderError("CONFIGURATION", "用户多模态 API 尚未完成服务端配置。", { retryable: false });
  }
}

class OpenAICompatibleMultimodalAdapter implements VisionProviderAdapter {
  readonly providerId: string;
  readonly adapterVersion = "openai-compatible-multimodal-0.1.1";
  private readonly options: MultimodalAdapterOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MultimodalAdapterOptions) {
    assertConfigured(options);
    this.options = options;
    this.providerId = options.providerId;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async evaluate(input: ProviderEvaluationInput, signal: AbortSignal): Promise<ProviderObservationEnvelope> {
    if (activeRequests >= 1) throw new VisionProviderError("RATE_LIMITED", "当前已有视觉评审请求运行中。", { retryable: true });
    if (dispatchedRequests >= this.options.maxTotalRequests) throw new VisionProviderError("QUOTA_EXHAUSTED", "用户多模态 API 的本地请求上限已达到。", { retryable: false });
    activeRequests += 1;
    dispatchedRequests += 1;
    const startedAt = Date.now();
    const body = buildMultimodalRequestBody(
      input,
      this.providerId,
      this.options.model,
    );
    let response: Response;
    try {
      response = await this.fetchImpl(this.options.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
          "X-VisionQA-Request-Id": input.requestId,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw new VisionProviderError("ABORTED", "用户多模态 API 请求被中止。", { cause: error });
      throw new VisionProviderError("NETWORK", "用户多模态 API 网络请求失败。", { retryable: true, cause: error });
    } finally {
      activeRequests -= 1;
    }
    if (!response.ok) throw classifyHttpError(response.status);
    const payload = await response.json() as {
      id?: string;
      model?: string;
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const outputText = textFromMessageContent(payload.choices?.[0]?.message?.content);
    if (!outputText) throw new VisionProviderError("INVALID_OUTPUT", "用户多模态 API 没有返回可解析的视觉观察。", { retryable: false });
    return {
      providerId: this.providerId,
      adapterVersion: this.adapterVersion,
      modelSnapshot: payload.model || this.options.model,
      providerRequestId: payload.id ?? null,
      latencyMs: Date.now() - startedAt,
      usage: { inputTokens: payload.usage?.prompt_tokens ?? null, outputTokens: payload.usage?.completion_tokens ?? null },
      warnings: ["BYOK_SERVER_ONLY_NO_PERSISTENCE"],
      observationDraft: parseQwenObservationDraft(outputText),
    };
  }
}

/**
 * Keep the shared visual prompt/body compatible with the existing Qwen
 * adapter, but normalize fields that are Provider-specific before dispatch.
 * In particular, DeepSeek's current Chat Completions contract uses the
 * `thinking` object; `enable_thinking` is a Qwen-only field and must not be
 * sent to a DeepSeek endpoint.
 */
export function buildMultimodalRequestBody(
  input: ProviderEvaluationInput,
  providerId: string,
  model: string,
): Record<string, unknown> {
  const body = buildQwenCompatibleRequestBody(input);
  body.model = model;
  if (providerId.trim().toLowerCase() === "deepseek") {
    delete body.enable_thinking;
    body.thinking = { type: "disabled" };
  }
  return body;
}

export function createMultimodalAdapterFromEnv(env: Environment, options: { fetchImpl?: typeof fetch } = {}): VisionProviderAdapter {
  const readiness = getMultimodalReadiness(env);
  if (!readiness.configured) throw new VisionProviderError("CONFIGURATION", "用户多模态 API 尚未完成服务端配置。", { retryable: false });
  return new OpenAICompatibleMultimodalAdapter({
    apiKey: configuredApiKey(env),
    endpoint: readiness.endpoint!,
    model: readiness.model!,
    providerId: readiness.providerId,
    maxTotalRequests: readiness.maxTotalRequests,
    fetchImpl: options.fetchImpl,
  });
}
