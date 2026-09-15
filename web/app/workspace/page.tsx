import { redirect } from "next/navigation";
import { CustomerWorkspace } from "../customer/customer-workspace";
import { getBetaSessionFromPage } from "../../lib/beta/auth";
import { getBetaService } from "../../lib/beta/service";
import { localMockEnabled } from "../../lib/agent/mock-mode";

export default async function WorkspacePage() {
  if (localMockEnabled()) redirect("/login");
  const session = await getBetaSessionFromPage();
  if (!session) redirect("/login");
  const service = getBetaService();
  return (
    <CustomerWorkspace
      session={session}
      initialCredits={service.getCredits(session)}
      initialProjects={service.listProjects(session)}
    />
  );
}
