export class VisionQaApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly requestId: string | null;
  readonly details: unknown;

  constructor(
    message: string,
    code: string,
    retryable: boolean,
    requestId: string | null = null,
    details: unknown = null,
  ) {
    super(message);
    this.name = "VisionQaApiError";
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
    this.details = details;
  }
}

export async function parseVisionQaApiError(
  response: Response,
): Promise<VisionQaApiError> {
  const body = (await response.json().catch(() => null)) as
    | {
        error?: {
          code?: string;
          message?: string;
          retryable?: boolean;
          request_id?: string;
          details?: unknown;
        };
      }
    | null;
  return new VisionQaApiError(
    body?.error?.message || `API 请求失败（HTTP ${response.status}）`,
    body?.error?.code || "API_REQUEST_FAILED",
    Boolean(body?.error?.retryable),
    body?.error?.request_id || null,
    body?.error?.details ?? null,
  );
}
