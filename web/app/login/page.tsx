import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getBetaSessionFromPage } from "../../lib/beta/auth";
import { LoginClient } from "./login-client";
import { MockLogin } from "./mock-login";
import { localAgentEnabled, localMockEnabled } from "../../lib/agent/mock-mode";

export const metadata: Metadata = {
  title: "接受 VisionQA 内测邀请",
  description: "使用一次性邀请链接进入 VisionQA 客户内测工作区。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const params = await searchParams;
  const initialInvite = typeof params.invite === "string" ? params.invite.slice(0, 512) : "";
  // Mock is an explicit preview mode. A normal local run keeps the same
  // login design but authenticates into the real local AgentWorkspace.
  if (localMockEnabled()) return <MockLogin />;
  if (localAgentEnabled()) {
    if (await getBetaSessionFromPage()) redirect("/agent");
    return <LoginClient initialInvite={initialInvite} allowLocalInvite redirectTo="/agent" />;
  }
  const session = await getBetaSessionFromPage();
  if (session) redirect("/workspace");
  return (
    <LoginClient
      initialInvite={initialInvite}
      allowLocalInvite={process.env.NODE_ENV !== "production"}
    />
  );
}
