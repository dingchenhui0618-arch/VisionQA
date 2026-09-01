import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Workspace, type WorkspaceAccountIdentity } from "../workspace";
import { getBetaSessionFromPage } from "../../lib/beta/auth";
import {
  getTrialAccountFromSessionToken,
  TRIAL_SESSION_COOKIE_NAME,
} from "../../lib/visionqa/trial-auth";
import { InternalBetaConsole } from "./internal-beta-console";

export const metadata: Metadata = {
  title: "VisionQA 开发者工作台",
  description: "模型路由、Prompt、原始响应、Gate、预算、测试素材和内部审计。",
};

export default async function InternalPage() {
  const beta = await getBetaSessionFromPage();
  if (beta?.role === "admin" || beta?.role === "developer") {
    const account: WorkspaceAccountIdentity = {
      id: beta.userId,
      label: `${beta.displayName} · 开发者`,
      phoneMasked: "内部权限",
      storageScope: beta.tenantId.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 32),
    };
    return <><InternalBetaConsole /><Workspace initialAccount={account} logoutEndpoint="/api/beta-auth/logout" /></>;
  }

  if (process.env.NODE_ENV !== "production") {
    const cookieStore = await cookies();
    const trial = getTrialAccountFromSessionToken(cookieStore.get(TRIAL_SESSION_COOKIE_NAME)?.value);
    if (trial) return <><InternalBetaConsole /><Workspace initialAccount={trial} /></>;
    redirect("/internal/login");
  }
  redirect("/workspace");
}
