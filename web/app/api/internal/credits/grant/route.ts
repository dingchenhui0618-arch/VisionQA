import { requireInternalActorFromRequest } from "../../../../../lib/beta/auth";
import { customerErrorResponse } from "../../../../../lib/beta/contracts";
import { getBetaService } from "../../../../../lib/beta/service";

export async function POST(request: Request) {
  try {
    const actor = await requireInternalActorFromRequest(request);
    const input = (await request.json()) as Record<string, unknown>;
    const balance = actor.betaSession
      ? getBetaService().grantCredits(
          actor.betaSession,
          String(input.tenant_id ?? ""),
          Number(input.amount),
          String(input.reason ?? "质量申诉补回"),
        )
      : getBetaService().grantCreditsByInternalActor(
          String(input.tenant_id ?? ""),
          Number(input.amount),
          String(input.reason ?? "质量申诉补回"),
          actor.actorId,
        );
    return Response.json({ balance }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return customerErrorResponse(error);
  }
}
