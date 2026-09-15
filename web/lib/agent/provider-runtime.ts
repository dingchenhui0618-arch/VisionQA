import { ModelCallLedger, type ModelCallImage, type ModelCallTokens } from "./model-call-ledger.ts";
import { createMemoryDispatchClaimStore, type DispatchClaimStore } from "./dispatch-claim-store.ts";

export type ProviderOperation = "TEXT" | "IMAGE" | (string & {});

export type ProviderRequest = {
  request: string;
  project?: string | null;
  conversation?: string | null;
  operation: ProviderOperation;
  provider?: string;
  model?: string;
  idempotency: string;
  input?: unknown;
  image?: ModelCallImage | null;
  cost?: number | null;
  confirmed?: boolean;
  retry?: number;
  tenantId?: string;
};

export type ProviderUsage = { token?: ModelCallTokens | null; image?: ModelCallImage | null; cost?: number | null };
export type ProviderErrorCode = "BLOCKED" | "INVALID_REQUEST" | "NOT_CONFIGURED" | "CONFIGURATION" | "AUTHENTICATION" | "QUOTA" | "NETWORK" | "RATE_LIMITED" | "INVALID_INPUT" | "INVALID_OUTPUT" | "OUTPUT_FETCH" | "UPSTREAM" | "UNKNOWN";
export type ProviderError = { code: ProviderErrorCode; message: string; retryable: boolean; status?: number; detail?: string };
export type ProviderResult<T = unknown> = {
  ok: true;
  request: string;
  operation: ProviderOperation;
  provider: string;
  model: string;
  output: T;
  usage: ProviderUsage;
} | {
  ok: false;
  request: string;
  operation: ProviderOperation;
  provider: string;
  model: string;
  error: ProviderError;
};

export type ProviderOperationRequest = ProviderRequest;
export type ProviderOperationResult<T = unknown> = ProviderResult<T>;
export type ProviderOperationError = ProviderError;

export type ProviderExecutor = (request: Readonly<ProviderRequest>) => Promise<unknown> | unknown;
export interface ProviderRuntime {
  readonly mode: "mock" | "real";
  dispatch<T = unknown>(request: ProviderRequest): Promise<ProviderResult<T>>;
  execute<T = unknown>(request: ProviderRequest): Promise<ProviderResult<T>>;
}

function errorResult<T>(request: ProviderRequest, error: ProviderError): ProviderResult<T> {
  return { ok: false, request: request.request, operation: request.operation, provider: request.provider ?? "unknown", model: request.model ?? "unknown", error };
}

function normalizeError(error: unknown): ProviderError {
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const code = typeof value.code === "string" ? value.code.toUpperCase() : "UNKNOWN";
    const allowed: ProviderErrorCode[] = ["BLOCKED", "INVALID_REQUEST", "NOT_CONFIGURED", "CONFIGURATION", "AUTHENTICATION", "QUOTA", "NETWORK", "RATE_LIMITED", "INVALID_INPUT", "INVALID_OUTPUT", "OUTPUT_FETCH", "UPSTREAM", "UNKNOWN"];
    return {
      code: allowed.includes(code as ProviderErrorCode) ? code as ProviderErrorCode : "UPSTREAM",
      message: typeof value.message === "string" ? value.message.slice(0, 500) : "Provider execution failed.",
      retryable: value.retryable === true,
      status: typeof value.status === "number" ? value.status : undefined,
    };
  }
  return { code: "UPSTREAM", message: error instanceof Error ? error.message.slice(0, 500) : "Provider execution failed.", retryable: false };
}

function validate(request: ProviderRequest): ProviderError | null {
  if (!request.request?.trim() || !request.idempotency?.trim() || !request.provider?.trim() || !request.model?.trim()) return { code: "INVALID_REQUEST", message: "request, provider, model and idempotency are required.", retryable: false };
  if (request.operation === "IMAGE" && request.confirmed !== true) return { code: "BLOCKED", message: "Image generation requires explicit confirmation.", retryable: false };
  return null;
}

class Runtime implements ProviderRuntime {
  readonly mode: "mock" | "real";
  private readonly executor: ProviderExecutor;
  private readonly ledger?: ModelCallLedger;
  private readonly defaultProvider?: string;
  private readonly defaultModel?: string;
  private readonly defaultTenantId?: string;
  private readonly completed = new Map<string, { fingerprint: string; result: ProviderResult }>();
  private readonly claims: DispatchClaimStore;

  constructor(
    mode: "mock" | "real",
    executor: ProviderExecutor,
    ledger?: ModelCallLedger,
    defaults: { provider?: string; model?: string; tenantId?: string; claims?: DispatchClaimStore } = {},
  ) {
    this.mode = mode;
    this.executor = executor;
    this.ledger = ledger;
    this.defaultProvider = defaults.provider;
    this.defaultModel = defaults.model;
    this.defaultTenantId = defaults.tenantId;
    this.claims = defaults.claims ?? createMemoryDispatchClaimStore();
  }

  async dispatch<T = unknown>(request: ProviderRequest): Promise<ProviderResult<T>> {
    const resolved = { ...request, provider: request.provider ?? this.defaultProvider, model: request.model ?? this.defaultModel };
    const invalid = validate(resolved);
    if (invalid) {
      // A local policy rejection is not an external model dispatch. Keep it in
      // the operation result without consuming the dispatch idempotency key.
      return errorResult(resolved, invalid) as ProviderResult<T>;
    }
    const fingerprint = JSON.stringify({ request: resolved.request, project: resolved.project ?? null, conversation: resolved.conversation ?? null, operation: resolved.operation, provider: resolved.provider, model: resolved.model, idempotency: resolved.idempotency, image: resolved.image ?? null });
    const prior = this.completed.get(resolved.idempotency);
    if (prior) {
      if (prior.fingerprint !== fingerprint) return errorResult(resolved, { code: "INVALID_REQUEST", message: "idempotency key was already used for a different request.", retryable: false }) as ProviderResult<T>;
      return prior.result as ProviderResult<T>;
    }
    let claim;
    try {
      claim = await this.claims.claim({
        tenantId: resolved.tenantId ?? this.defaultTenantId ?? defaultsTenant(this.mode),
        idempotencyKey: resolved.idempotency,
        requestId: resolved.request,
        fingerprint,
        projectId: resolved.project ?? null,
        conversationId: resolved.conversation ?? null,
        operation: resolved.operation,
        providerId: resolved.provider!,
        modelSnapshot: resolved.model!,
      });
    } catch {
      return errorResult(resolved, { code: "INVALID_REQUEST", message: "idempotency key was already used for a different request.", retryable: false }) as ProviderResult<T>;
    }
    if (!claim.acquired) {
      return errorResult(resolved, { code: "BLOCKED", message: `provider dispatch already ${claim.status.toLowerCase()}; query the original task instead.`, retryable: false }) as ProviderResult<T>;
    }
    const started = Date.now();
    let execution: unknown;
    try {
      execution = await this.executor({ ...resolved, input: resolved.input });
    } catch (error) {
      const normalized = normalizeError(error);
      const result = errorResult(resolved, normalized) as ProviderResult<T>;
      this.completed.set(resolved.idempotency, { fingerprint, result });
      try {
        await this.claims.complete(resolved.tenantId ?? this.defaultTenantId ?? defaultsTenant(this.mode), resolved.idempotency, {
          status: "FAILED", errorCode: normalized.code, latencyMs: Date.now() - started,
          inputImageCount: resolved.image?.inputCount ?? null,
        });
      } catch {
        // A missing final status must remain non-retryable under the existing claim.
      }
      try {
        this.ledger?.record({ request: resolved.request, project: resolved.project ?? null, conversation: resolved.conversation ?? null, operation: resolved.operation, provider: resolved.provider!, model: resolved.model!, status: "FAILED", cost: null, token: null, image: resolved.image ?? null, latency: Date.now() - started, retry: resolved.retry ?? 0, idempotency: resolved.idempotency, errorCode: normalized.code });
      } catch {
        // The durable dispatch claim is authoritative in production.
      }
      return result;
    }
    const wrapped = execution && typeof execution === "object" && "output" in (execution as Record<string, unknown>) ? execution as { output: unknown; usage?: ProviderUsage } : null;
    const usage: ProviderUsage = wrapped?.usage ?? {};
    try {
      await this.claims.complete(resolved.tenantId ?? this.defaultTenantId ?? defaultsTenant(this.mode), resolved.idempotency, {
        status: "SUCCEEDED",
        cost: usage.cost ?? resolved.cost ?? null,
        inputTokens: usage.token?.input ?? null,
        outputTokens: usage.token?.output ?? null,
        inputImageCount: usage.image?.inputCount ?? resolved.image?.inputCount ?? null,
        outputImageCount: usage.image?.outputCount ?? resolved.image?.outputCount ?? null,
        latencyMs: Date.now() - started,
      });
    } catch {
      const result = errorResult(resolved, { code: "UPSTREAM", message: "provider completed but dispatch state could not be persisted; query the original task.", retryable: false }) as ProviderResult<T>;
      this.completed.set(resolved.idempotency, { fingerprint, result });
      return result;
    }
    try {
      this.ledger?.record({ request: resolved.request, project: resolved.project ?? null, conversation: resolved.conversation ?? null, operation: resolved.operation, provider: resolved.provider!, model: resolved.model!, status: "SUCCEEDED", cost: usage.cost ?? resolved.cost ?? null, token: usage.token ?? null, image: usage.image ?? resolved.image ?? null, latency: Date.now() - started, retry: resolved.retry ?? 0, idempotency: resolved.idempotency });
    } catch {
      // The durable dispatch claim is authoritative in production.
    }
    const result: ProviderResult<T> = { ok: true, request: resolved.request, operation: resolved.operation, provider: resolved.provider!, model: resolved.model!, output: (wrapped?.output ?? execution) as T, usage };
    this.completed.set(resolved.idempotency, { fingerprint, result });
    return result;
  }

  execute<T = unknown>(request: ProviderRequest): Promise<ProviderResult<T>> { return this.dispatch<T>(request); }
}

function defaultsTenant(mode: "mock" | "real"): string {
  return mode === "mock" ? "mock-local" : "local-development";
}

export function createMockProviderRuntime(options: { ledger?: ModelCallLedger; respond?: ProviderExecutor } = {}): ProviderRuntime {
  return new Runtime("mock", options.respond ?? ((request) => ({ mock: true, operation: request.operation, request: request.request })), options.ledger, { provider: "mock", model: "mock-v1" });
}

export function createRealProviderRuntime(options: { provider: string; model: string; executor: ProviderExecutor; ledger?: ModelCallLedger; tenantId?: string; claims?: DispatchClaimStore }): ProviderRuntime {
  if (typeof options.executor !== "function") throw new Error("real provider runtime requires an injected executor");
  return new Runtime("real", options.executor, options.ledger, { provider: options.provider, model: options.model, tenantId: options.tenantId, claims: options.claims });
}

export const createMockRuntime = createMockProviderRuntime;
export const createRealRuntime = createRealProviderRuntime;
