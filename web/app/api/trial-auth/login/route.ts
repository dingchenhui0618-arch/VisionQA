import {
  authenticateTrialAccount,
  trialSessionCookie,
} from "../../../../lib/visionqa/trial-auth";

const MAX_REQUEST_BYTES = 2048;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, { count: number; startedAt: number }>();

function errorResponse(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function attemptKey(request: Request, phone: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwarded || "unknown"}:${phone}`;
}

function consumeAttempt(key: string): boolean {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || now - current.startedAt >= ATTEMPT_WINDOW_MS) {
    attempts.set(key, { count: 1, startedAt: now });
    return true;
  }
  if (current.count >= MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) {
    return errorResponse(413, "TRIAL_LOGIN_REQUEST_TOO_LARGE", "登录请求无效。");
  }

  let body: { phone?: unknown; password?: unknown };
  try {
    body = (await request.json()) as { phone?: unknown; password?: unknown };
  } catch {
    return errorResponse(400, "TRIAL_LOGIN_INVALID_JSON", "登录请求无效。");
  }

  if (typeof body.phone !== "string" || typeof body.password !== "string") {
    return errorResponse(400, "TRIAL_LOGIN_INVALID_INPUT", "请输入手机号和密码。");
  }

  const phone = body.phone.replace(/\s+/g, "");
  if (!/^1\d{10}$/.test(phone)) {
    return errorResponse(400, "TRIAL_LOGIN_INVALID_PHONE", "请输入正确的手机号。");
  }

  const key = attemptKey(request, phone);
  if (!consumeAttempt(key)) {
    return errorResponse(429, "TRIAL_LOGIN_RATE_LIMITED", "尝试次数过多，请稍后再试。");
  }

  const authenticated = await authenticateTrialAccount(phone, body.password);
  if (!authenticated) {
    return errorResponse(401, "TRIAL_LOGIN_REJECTED", "手机号或密码不正确。");
  }

  attempts.delete(key);
  return Response.json(
    { authenticated: true, account: authenticated.account },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": trialSessionCookie(authenticated.sessionToken, request.url),
      },
    },
  );
}
