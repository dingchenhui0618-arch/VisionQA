/**
 * A deliberately small, append-only audit ledger for provider dispatches.
 * It stores metadata only: callers must never put prompts, credentials, or
 * image bytes in a record.
 */

export type ModelCallStatus = "DISPATCHED" | "SUCCEEDED" | "FAILED" | "BLOCKED";

export type ModelCallTokens = {
  input?: number | null;
  output?: number | null;
  total?: number | null;
};

export type ModelCallImage = {
  inputCount?: number;
  outputCount?: number;
  inputBytes?: number;
  outputBytes?: number;
  mimeTypes?: string[];
  width?: number | null;
  height?: number | null;
};

export type ModelCallRecord = {
  id: string;
  request: string;
  project: string | null;
  conversation: string | null;
  operation: string;
  provider: string;
  model: string;
  status: ModelCallStatus;
  cost: number | null;
  token: ModelCallTokens | null;
  image: ModelCallImage | null;
  latency: number | null;
  retry: number;
  idempotency: string;
  createdAt: string;
  errorCode?: string;
};

export type ModelCallRecordInput = Omit<ModelCallRecord, "id" | "createdAt" | "project" | "conversation"> & Partial<Pick<ModelCallRecord, "project" | "conversation">> & {
  id?: string;
  createdAt?: string;
};

function nonNegativeInt(value: unknown, fallback = 0): number {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
}

function cleanText(value: unknown, fallback: string | null = null): string | null {
  if (typeof value !== "string") return fallback;
  const text = value.trim().slice(0, 200);
  return text || fallback;
}

function requestIdentifier(value: unknown): string {
  const cleaned = cleanText(value, null);
  if (!cleaned || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(cleaned)) {
    throw new Error("model call request must be an opaque identifier, not free text");
  }
  const lower = cleaned.toLowerCase();
  if (lower.startsWith("sk-") || lower.includes("api_key") || lower.includes("api-key") || lower.includes("access_token") || lower.includes("authorization") || lower.includes("bearer") || lower.includes("://")) {
    throw new Error("model call request contains sensitive or URL-like content");
  }
  return cleaned;
}

function metadataOnlyImage(value: ModelCallImage | null | undefined): ModelCallImage | null {
  if (!value) return null;
  return {
    inputCount: nonNegativeInt(value.inputCount),
    outputCount: nonNegativeInt(value.outputCount),
    inputBytes: nonNegativeInt(value.inputBytes),
    outputBytes: nonNegativeInt(value.outputBytes),
    mimeTypes: Array.isArray(value.mimeTypes) ? value.mimeTypes.filter((x): x is string => typeof x === "string").slice(0, 8) : [],
    width: Number.isInteger(value.width) && Number(value.width) >= 0 ? Number(value.width) : null,
    height: Number.isInteger(value.height) && Number(value.height) >= 0 ? Number(value.height) : null,
  };
}

function normalize(input: ModelCallRecordInput, now: () => Date, id: () => string): ModelCallRecord {
  const request = requestIdentifier(input.request);
  if (!cleanText(input.provider, null) || !cleanText(input.model, null)) throw new Error("provider and model are required");
  if (!cleanText(input.operation, null)) throw new Error("operation is required");
  if (!cleanText(input.idempotency, null)) throw new Error("idempotency is required");
  return {
    id: cleanText(input.id, null) ?? id(),
    request,
    project: cleanText(input.project),
    conversation: cleanText(input.conversation),
    operation: cleanText(input.operation, "")!,
    provider: cleanText(input.provider, "")!,
    model: cleanText(input.model, "")!,
    status: input.status,
    cost: typeof input.cost === "number" && Number.isFinite(input.cost) && input.cost >= 0 ? input.cost : null,
    token: input.token ? {
      input: input.token.input == null ? null : nonNegativeInt(input.token.input),
      output: input.token.output == null ? null : nonNegativeInt(input.token.output),
      total: input.token.total == null ? null : nonNegativeInt(input.token.total),
    } : null,
    image: metadataOnlyImage(input.image),
    latency: typeof input.latency === "number" && Number.isFinite(input.latency) && input.latency >= 0 ? input.latency : null,
    retry: nonNegativeInt(input.retry),
    idempotency: cleanText(input.idempotency, "")!,
    createdAt: input.createdAt ?? now().toISOString(),
    ...(cleanText(input.errorCode) ? { errorCode: cleanText(input.errorCode)! } : {}),
  };
}

export class ModelCallLedger {
  private readonly records: ModelCallRecord[] = [];
  private readonly byIdempotency = new Map<string, ModelCallRecord>();
  private readonly now: () => Date;
  private readonly id: () => string;
  private readonly onChange?: (records: readonly ModelCallRecord[]) => void;

  constructor(options: { now?: () => Date; id?: () => string; initial?: readonly ModelCallRecord[]; onChange?: (records: readonly ModelCallRecord[]) => void } = {}) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => `mcl_${crypto.randomUUID()}`);
    this.onChange = options.onChange;
    for (const entry of options.initial ?? []) {
      const normalized = normalize(entry, this.now, this.id);
      if (this.byIdempotency.has(normalized.idempotency)) throw new Error("duplicate model call idempotency in snapshot");
      this.records.push(normalized);
      this.byIdempotency.set(normalized.idempotency, normalized);
    }
  }

  record(input: ModelCallRecordInput): ModelCallRecord {
    const next = normalize(input, this.now, this.id);
    const previous = this.byIdempotency.get(next.idempotency);
    if (previous) {
      if (JSON.stringify({ ...previous, id: undefined, createdAt: undefined }) !== JSON.stringify({ ...next, id: undefined, createdAt: undefined })) {
        throw new Error("model call idempotency conflict");
      }
      return { ...previous, token: previous.token ? { ...previous.token } : null, image: previous.image ? { ...previous.image, mimeTypes: [...(previous.image.mimeTypes ?? [])] } : null };
    }
    const stored = { ...next, token: next.token ? { ...next.token } : null, image: next.image ? { ...next.image, mimeTypes: [...(next.image.mimeTypes ?? [])] } : null };
    this.records.push(stored);
    this.byIdempotency.set(stored.idempotency, stored);
    this.onChange?.(this.list());
    return { ...stored, token: stored.token ? { ...stored.token } : null, image: stored.image ? { ...stored.image, mimeTypes: [...(stored.image.mimeTypes ?? [])] } : null };
  }

  list(): readonly ModelCallRecord[] {
    return this.records.map((entry) => ({ ...entry, token: entry.token ? { ...entry.token } : null, image: entry.image ? { ...entry.image, mimeTypes: [...(entry.image.mimeTypes ?? [])] } : null }));
  }

  get(id: string): ModelCallRecord | null {
    const entry = this.records.find((candidate) => candidate.id === id);
    return entry ? { ...entry, token: entry.token ? { ...entry.token } : null, image: entry.image ? { ...entry.image, mimeTypes: [...(entry.image.mimeTypes ?? [])] } : null } : null;
  }

  clear(): void { this.records.length = 0; this.byIdempotency.clear(); this.onChange?.([]); }
}

export function createModelCallLedger(options: ConstructorParameters<typeof ModelCallLedger>[0] = {}): ModelCallLedger {
  return new ModelCallLedger(options);
}
