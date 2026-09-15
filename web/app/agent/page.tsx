import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AgentWorkspace } from "./workspace";
import { MockWorkspace } from "./mock-workspace";
import { localMockEnabled, MOCK_COOKIE } from "../../lib/agent/mock-mode";

export default async function AgentPage() {
  if (process.env.NODE_ENV === "production") notFound();
  if (localMockEnabled()) {
    if ((await cookies()).get(MOCK_COOKIE)?.value !== "1") redirect("/login");
    return <MockWorkspace />;
  }
  return <AgentWorkspace />;
}
