import { requireBetaSessionFromRequest } from "../../../../lib/beta/auth";
import { customerErrorResponse } from "../../../../lib/beta/contracts";
import { getBetaService } from "../../../../lib/beta/service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireBetaSessionFromRequest(request);
    const { id } = await context.params;
    const service = getBetaService();
    return Response.json(
      {
        project: service.getProject(session, id),
        batch: service.latestBatchForProject(session, id),
        repair: service.latestRepairForProject(session, id),
        credits: service.getCredits(session),
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
    getBetaService().deleteProject(session, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return customerErrorResponse(error);
  }
}
