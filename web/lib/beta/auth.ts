import { cookies } from "next/headers";
import {
  BETA_SESSION_COOKIE,
  CustomerVisibleError,
  readCookie,
  type BetaSessionView,
} from "./contracts";
import { getBetaBackend } from "./backend";
import {
  getTrialAccountFromSessionToken,
  TRIAL_SESSION_COOKIE_NAME,
} from "../visionqa/trial-auth";

export async function getBetaSessionFromPage(): Promise<BetaSessionView | null> {
  const cookieStore = await cookies();
  return getBetaBackend().resolveSession(cookieStore.get(BETA_SESSION_COOKIE)?.value);
}

export async function requireBetaSessionFromRequest(request: Request): Promise<BetaSessionView> {
  const session = await getBetaBackend().resolveSession(readCookie(request, BETA_SESSION_COOKIE));
  if (!session) {
    throw new CustomerVisibleError(
      "AUTHENTICATION_REQUIRED",
      "当前邀请会话已经失效。",
      401,
      "请使用新的邀请链接重新进入内测。",
    );
  }
  return session;
}

export function requireInternalSession(session: BetaSessionView): BetaSessionView {
  if (session.role !== "admin" && session.role !== "developer") {
    throw new CustomerVisibleError(
      "FORBIDDEN",
      "当前账号不能访问开发者工作台。",
      403,
      "请返回客户项目首页。",
    );
  }
  return session;
}

export async function requireInternalActorFromRequest(request: Request): Promise<{
  actorId: string;
  betaSession: BetaSessionView | null;
}> {
  const beta = await getBetaBackend().resolveSession(readCookie(request, BETA_SESSION_COOKIE));
  if (beta?.role === "admin" || beta?.role === "developer") {
    return { actorId: beta.userId, betaSession: beta };
  }
  if (process.env.NODE_ENV !== "production") {
    const trial = getTrialAccountFromSessionToken(readCookie(request, TRIAL_SESSION_COOKIE_NAME));
    if (trial) return { actorId: trial.id, betaSession: null };
  }
  throw new CustomerVisibleError(
    "FORBIDDEN",
    "当前账号不能执行内部管理操作。",
    403,
    "请使用开发者账号进入内部工作台。",
  );
}
