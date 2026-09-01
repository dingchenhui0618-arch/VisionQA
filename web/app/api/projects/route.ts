import { requireBetaSessionFromRequest } from "../../../lib/beta/auth";
import { customerErrorResponse } from "../../../lib/beta/contracts";
import { getBetaService } from "../../../lib/beta/service";

export async function GET(request: Request) {
  try {
    const session = await requireBetaSessionFromRequest(request);
    const service = getBetaService();
    return Response.json(
      { projects: service.listProjects(session), credits: service.getCredits(session) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return customerErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireBetaSessionFromRequest(request);
    const input = (await request.json()) as { name?: unknown; is_example?: unknown };
    const project = getBetaService().createProject(
      session,
      typeof input.name === "string" ? input.name : "",
      input.is_example === true,
    );
    return Response.json({ project }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return customerErrorResponse(error);
  }
}
