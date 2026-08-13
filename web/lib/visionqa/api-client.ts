import {
  adaptEvaluationEnvelope,
  type EvaluationApiEnvelope,
  type UiEvaluationPatch,
} from "./ui-adapter";

export class VisionQaApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "VisionQaApiError";
  }
}

export type LiveModelCapability = {
  configured: boolean;
  providerId: string;
  modelSnapshot: string;
  maxImageBytes: number;
  maxTotalRequests: number;
  budgetCurrency: "CNY";
  budgetMinorUnits: number;
  imagePersistence: "NONE";
  resultPersistence: "BROWSER_ONLY";
  reviewPolicy: "HUMAN_REVIEW_REQUIRED";
  autoPassEnabled: false;
};

export type LiveEvaluationProvider = {
  providerId: string;
  adapterVersion: string;
  modelSnapshot: string;
  providerRequestId: string | null;
  latencyMs: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
  warnings: string[];
};

export type CustomerProfileInput = {
  styles: string[];
  priceMin: string;
  priceMax: string;
  audiences: string[];
  skuLinks: string[];
};

const LIVE_UPLOAD_TARGET_BYTES = 900 * 1024;
const LIVE_UPLOAD_MAX_DIMENSION = 1280;

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function prepareLiveUploadFile(file: File): Promise<File> {
  if (
    file.size <= LIVE_UPLOAD_TARGET_BYTES ||
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined"
  ) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(
      1,
      LIVE_UPLOAD_MAX_DIMENSION / bitmap.width,
      LIVE_UPLOAD_MAX_DIMENSION / bitmap.height,
      Math.sqrt(LIVE_UPLOAD_TARGET_BYTES / file.size),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      const blob = await canvasToBlob(canvas, "image/jpeg", quality);
      if (blob && blob.size > 0 && blob.size <= LIVE_UPLOAD_TARGET_BYTES) {
        const baseName = file.name.replace(/\.[^.]+$/, "") || "candidate";
        return new File([blob], `${baseName}-live-canary.jpg`, {
          type: "image/jpeg",
          lastModified: file.lastModified,
        });
      }
    }
  } finally {
    bitmap.close();
  }
  return file;
}

async function parseError(response: Response): Promise<VisionQaApiError> {
  const body = (await response.json().catch(() => null)) as
    | {
        error?: { code?: string; message?: string; retryable?: boolean };
      }
    | null;
  return new VisionQaApiError(
    body?.error?.message || `API 请求失败（HTTP ${response.status}）`,
    body?.error?.code || "API_REQUEST_FAILED",
    Boolean(body?.error?.retryable),
  );
}

export async function getEvaluation(
  evaluationId: string,
  signal?: AbortSignal,
): Promise<UiEvaluationPatch> {
  const response = await fetch(
    `/api/evaluations/${encodeURIComponent(evaluationId)}`,
    {
      signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!response.ok) throw await parseError(response);
  return adaptEvaluationEnvelope(
    (await response.json()) as EvaluationApiEnvelope,
  );
}

export async function getLiveModelCapability(): Promise<LiveModelCapability> {
  const response = await fetch("/api/live-evaluate", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw await parseError(response);
  const body = (await response.json()) as {
    configured: boolean;
    provider_id: string;
    model_snapshot: string;
    max_image_bytes: number;
    max_total_requests: number;
    budget_currency: "CNY";
    budget_minor_units: number;
    image_persistence: "NONE";
    result_persistence: "BROWSER_ONLY";
    review_policy: "HUMAN_REVIEW_REQUIRED";
    auto_pass_enabled: false;
  };
  return {
    configured: body.configured,
    providerId: body.provider_id,
    modelSnapshot: body.model_snapshot,
    maxImageBytes: body.max_image_bytes,
    maxTotalRequests: body.max_total_requests,
    budgetCurrency: body.budget_currency,
    budgetMinorUnits: body.budget_minor_units,
    imagePersistence: body.image_persistence,
    resultPersistence: body.result_persistence,
    reviewPolicy: body.review_policy,
    autoPassEnabled: body.auto_pass_enabled,
  };
}

export async function evaluateLiveCandidate(input: {
  file: File;
  references?: File[];
  customerProfile?: CustomerProfileInput;
  channel: string;
  placement: string;
  referenceStatus: "complete" | "missing";
  provenanceStatus: "known" | "unknown";
  commercialTemplateId: string;
  signal?: AbortSignal;
}): Promise<{
  patch: UiEvaluationPatch;
  provider: LiveEvaluationProvider;
  candidateTraceId: string;
}> {
  const candidate = await prepareLiveUploadFile(input.file);
  const references = await Promise.all(
    (input.references ?? []).slice(0, 4).map(prepareLiveUploadFile),
  );
  const form = new FormData();
  form.set("candidate", candidate);
  references.forEach((reference) => form.append("references", reference));
  form.set("channel", input.channel);
  form.set("placement", input.placement);
  form.set("referenceStatus", input.referenceStatus);
  form.set("provenanceStatus", input.provenanceStatus);
  form.set("commercialTemplateId", input.commercialTemplateId);
  form.set("customerProfile", JSON.stringify(input.customerProfile ?? {
    styles: [],
    priceMin: "",
    priceMax: "",
    audiences: [],
    skuLinks: [],
  }));
  form.set("consent", "confirmed");
  const response = await fetch("/api/live-evaluate", {
    method: "POST",
    body: form,
    signal: input.signal,
    cache: "no-store",
  });
  if (!response.ok) throw await parseError(response);
  const body = (await response.json()) as EvaluationApiEnvelope & {
    provider: LiveEvaluationProvider;
    candidate: { trace_id: string };
  };
  return {
    patch: adaptEvaluationEnvelope(body),
    provider: body.provider,
    candidateTraceId: body.candidate.trace_id,
  };
}

export async function createOverride(input: {
  evaluationId: string;
  baseEvaluationVersion: number;
  originalDecision: string;
  humanDecision: string;
  reasonCode: string;
  evidenceNote: string;
  commercialTemplateId: string;
  commercialTemplateVersion: string;
  systemFitScore: number | null;
}): Promise<{ overrideId: string; idempotentReplay: boolean }> {
  const response = await fetch(
    `/api/evaluations/${encodeURIComponent(input.evaluationId)}/overrides`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        originalDecision: input.originalDecision,
        humanDecision: input.humanDecision,
        reasonCode: input.reasonCode,
        evidenceNote: input.evidenceNote,
        baseEvaluationVersion: input.baseEvaluationVersion,
        commercialTemplateId: input.commercialTemplateId,
        commercialTemplateVersion: input.commercialTemplateVersion,
        systemFitScore: input.systemFitScore,
      }),
    },
  );
  if (!response.ok) throw await parseError(response);
  const body = (await response.json()) as {
    override_id: string;
    idempotent_replay: boolean;
  };
  return {
    overrideId: body.override_id,
    idempotentReplay: body.idempotent_replay,
  };
}
