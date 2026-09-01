import { betaSessionCookie, customerErrorResponse } from "../../../../lib/beta/contracts";
import { getBetaService } from "../../../../lib/beta/service";

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 16 * 1024) {
      return Response.json({ error: { code: "INVITE_INVALID", message: "邀请信息无效。", next_action: "请重新打开邀请链接。" } }, { status: 413 });
    }
    const input = (await request.json()) as { token?: unknown };
    const token = typeof input.token === "string" ? input.token.trim() : "";
    const result = await getBetaService().consumeInvite(token);
    return Response.json(
      { session: result.session, redirect_to: "/workspace" },
      {
        headers: {
          "cache-control": "no-store",
          "set-cookie": betaSessionCookie(result.sessionToken, request.url),
        },
      },
    );
  } catch (error) {
    return customerErrorResponse(error);
  }
}
