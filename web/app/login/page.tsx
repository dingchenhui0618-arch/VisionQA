import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getTrialAccountFromSessionToken,
  TRIAL_SESSION_COOKIE_NAME,
} from "../../lib/visionqa/trial-auth";
import { LoginClient } from "./login-client";

export const metadata: Metadata = {
  title: "登录 VisionQA · 受邀试用",
  description: "使用受邀试用账号进入 VisionQA 服饰电商 AI 模特图修正工作台。",
};

export default async function LoginPage() {
  const cookieStore = await cookies();
  const account = getTrialAccountFromSessionToken(
    cookieStore.get(TRIAL_SESSION_COOKIE_NAME)?.value,
  );
  if (account) redirect("/workspace");
  return <LoginClient />;
}
