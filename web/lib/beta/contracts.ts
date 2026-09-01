export const BETA_SESSION_COOKIE = "visionqa_beta_session";
export const BETA_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const INVITE_VALID_DAYS = 7;
export const ASSET_RETENTION_DAYS = 7;
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
export const INITIAL_BETA_CREDITS = 5;
export const SCREENING_MAX_TRUTH_IMAGES = 4;
export const SCREENING_MAX_CANDIDATES = 10;
export const ASSET_MAX_BYTES = 10 * 1024 * 1024;

export type BetaRole = "customer" | "admin" | "developer";
export type ScreeningDecision =
  | "NEEDS_ATTENTION"
  | "NO_OBVIOUS_ISSUE"
  | "NEEDS_MANUAL_CHECK";
export type RepairAttemptStatus =
  | "HELD"
  | "RUNNING"
  | "CAPTURED"
  | "RELEASED";
export type CreditEntryType = "GRANT" | "HOLD" | "CAPTURE" | "RELEASE" | "ADJUSTMENT";
export type PaymentProvider = "disabled" | "test" | "wechat" | "alipay";

export type BetaSessionView = {
  userId: string;
  tenantId: string;
  membershipId: string;
  role: BetaRole;
  displayName: string;
  expiresAt: string;
};

export type CreditBalance = {
  available: number;
  held: number;
  captured: number;
  label: "内测额度";
};

export type BetaProject = {
  id: string;
  tenantId: string;
  name: string;
  status: "DRAFT" | "SCREENING" | "REPAIRING" | "COMPLETED";
  candidateCount: number;
  attentionCount: number;
  repairedCount: number;
  isExample: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type BetaAsset = {
  id: string;
  tenantId: string;
  projectId: string;
  role: "TRUTH" | "CANDIDATE" | "REPAIR_OUTPUT";
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  width: number;
  height: number;
  sha256: string | null;
  objectKey: string;
  uploadStatus: "PENDING" | "READY" | "DELETED";
  retentionUntil: string;
  createdAt: string;
};

export type ScreeningItem = {
  id: string;
  tenantId: string;
  batchId: string;
  assetId: string;
  decision: ScreeningDecision;
  primaryIssue: string | null;
  visibleEvidence: string;
  repairPrompt: string | null;
  issueRegion: { x: number; y: number; width: number; height: number } | null;
  customerReviewedAt: string | null;
};

export type ScreeningBatch = {
  id: string;
  tenantId: string;
  projectId: string;
  skuName: string;
  truthAssetIds: string[];
  candidateAssetIds: string[];
  status: "RUNNING" | "COMPLETED" | "FAILED";
  items: ScreeningItem[];
  createdAt: string;
  completedAt: string | null;
};

export type RepairAttempt = {
  id: string;
  tenantId: string;
  projectId: string;
  screeningItemId: string;
  sourceAssetId: string;
  outputAssetId: string | null;
  issue: string;
  issueRegion: { x: number; y: number; width: number; height: number };
  lockedRegions: Array<{ x: number; y: number; width: number; height: number }>;
  status: RepairAttemptStatus;
  holdId: string;
  gateVersion: string;
  gateResult: "PENDING" | "PASSED" | "BLOCKED";
  idempotencyKey: string;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "INVITE_INVALID"
  | "INVITE_EXPIRED"
  | "INVITE_ALREADY_USED"
  | "PROJECT_NOT_FOUND"
  | "ASSET_NOT_FOUND"
  | "ASSET_TOO_LARGE"
  | "ASSET_INVALID"
  | "BATCH_INVALID"
  | "INSUFFICIENT_CREDITS"
  | "MODEL_UNAVAILABLE"
  | "MODEL_FAILED"
  | "GATE_BLOCKED"
  | "BUDGET_PAUSED"
  | "SERVICE_NOT_READY"
  | "FORBIDDEN";

export class CustomerVisibleError extends Error {
  readonly code: CustomerErrorCode;
  readonly status: number;
  readonly nextAction: string;

  constructor(code: CustomerErrorCode, message: string, status: number, nextAction: string) {
    super(message);
    this.name = "CustomerVisibleError";
    this.code = code;
    this.status = status;
    this.nextAction = nextAction;
  }
}

export function customerErrorResponse(error: unknown): Response {
  if (error instanceof CustomerVisibleError) {
    return Response.json(
      { error: { code: error.code, message: error.message, next_action: error.nextAction } },
      { status: error.status, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    {
      error: {
        code: "MODEL_FAILED",
        message: "本次操作没有完成，且没有扣除内测额度。",
        next_action: "请稍后重试；如果仍然失败，请把当前 SKU 名称发给内测管理员。",
      },
    },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}

export function betaSessionCookie(token: string, requestUrl: string): string {
  const secure = new URL(requestUrl).protocol === "https:";
  return [
    `${BETA_SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : null,
    `Max-Age=${BETA_SESSION_MAX_AGE_SECONDS}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearBetaSessionCookie(requestUrl: string): string {
  const secure = new URL(requestUrl).protocol === "https:";
  return [
    `${BETA_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : null,
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
}

export function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
