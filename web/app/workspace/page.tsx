import { redirect } from "next/navigation";
import { CustomerWorkspace } from "../customer/customer-workspace";
import { getBetaSessionFromPage } from "../../lib/beta/auth";
import { getBetaBackend } from "../../lib/beta/backend";
import { localMockEnabled } from "../../lib/agent/mock-mode";

export default async function WorkspacePage() {
  if (localMockEnabled()) redirect("/login");
  const session = await getBetaSessionFromPage();
  if (!session) redirect("/login");
  const service = getBetaBackend();
  const [initialCredits, initialProjects] = await Promise.all([
    service.getCredits(session),
    service.listProjects(session),
  ]);
  return (
    <CustomerWorkspace
      session={session}
      initialCredits={initialCredits}
      initialProjects={initialProjects}
    />
  );
}
