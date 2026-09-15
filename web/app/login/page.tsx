import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getBetaSessionFromPage } from "../../lib/beta/auth";
import { LoginClient } from "./login-client";
import { MockLogin } from "./mock-login";
import { localMockEnabled } from "../../lib/agent/mock-mode";

export const metadata: Metadata = {
  title: "接受 VisionQA 内测邀请",
  description: "使用一次性邀请链接进入 VisionQA 客户内测工作区。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  if (localMockEnabled()) return <MockLogin />;
  const session = await getBetaSessionFromPage();
  if (session) redirect("/workspace");
  const params = await searchParams;
  return (
    <LoginClient
      initialInvite={typeof params.invite === "string" ? params.invite.slice(0, 512) : ""}
      allowLocalInvite={process.env.NODE_ENV !== "production"}
    />
  );
}
