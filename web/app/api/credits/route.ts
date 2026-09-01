import { requireBetaSessionFromRequest } from "../../../lib/beta/auth";
import { customerErrorResponse } from "../../../lib/beta/contracts";
import { getBetaService } from "../../../lib/beta/service";

export async function GET(request: Request) {
  try {
    const session = await requireBetaSessionFromRequest(request);
    return Response.json(getBetaService().getCredits(session), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return customerErrorResponse(error);
  }
}
