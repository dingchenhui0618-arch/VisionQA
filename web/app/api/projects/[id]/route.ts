import { requireBetaSessionFromRequest } from "../../../../lib/beta/auth";
import { customerErrorResponse } from "../../../../lib/beta/contracts";
import { getBetaBackend } from "../../../../lib/beta/backend";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireBetaSessionFromRequest(request);
    const { id } = await context.params;
    const service = getBetaBackend();
    return Response.json(
      {
        project: await service.getProject(session, id),
        batch: await service.latestBatchForProject(session, id),
        repair: await service.latestRepairForProject(session, id),
        agent_events: await service.publicRepairEvolutionEventsForProject(session, id),
        credits: await service.getCredits(session),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return customerErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const session = await requireBetaSessionFromRequest(request);
    const { id } = await context.params;
    await getBetaBackend().deleteProject(session, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return customerErrorResponse(error);
  }
}
