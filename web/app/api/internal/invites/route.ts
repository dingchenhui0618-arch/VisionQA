import { requireInternalActorFromRequest } from "../../../../lib/beta/auth";
import { customerErrorResponse } from "../../../../lib/beta/contracts";
import { getBetaBackend } from "../../../../lib/beta/backend";

export async function POST(request: Request) {
  try {
    await requireInternalActorFromRequest(request);
    const input = (await request.json()) as Record<string, unknown>;
    const invite = await getBetaBackend().createInvite({
      label: String(input.label ?? "受邀客户"),
      role: input.role === "admin" || input.role === "developer" ? input.role : "customer",
      initialCredits: Number.isInteger(input.initial_credits) ? Number(input.initial_credits) : 5,
      validDays: Number.isInteger(input.valid_days) ? Number(input.valid_days) : 7,
    });
    return Response.json(
      { ...invite, invite_url: `${new URL(request.url).origin}/login?invite=${encodeURIComponent(invite.token)}` },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return customerErrorResponse(error);
  }
}
