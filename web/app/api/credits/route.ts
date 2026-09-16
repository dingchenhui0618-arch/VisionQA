import { requireBetaSessionFromRequest } from "../../../lib/beta/auth";
import { customerErrorResponse } from "../../../lib/beta/contracts";
import { getBetaBackend } from "../../../lib/beta/backend";

export async function GET(request: Request) {
  try {
    const session = await requireBetaSessionFromRequest(request);
    return Response.json(await getBetaBackend().getCredits(session), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return customerErrorResponse(error);
  }
}
