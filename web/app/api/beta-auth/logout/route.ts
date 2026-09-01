import { clearBetaSessionCookie } from "../../../../lib/beta/contracts";

export function POST(request: Request) {
  return Response.json(
    { ok: true },
    { headers: { "cache-control": "no-store", "set-cookie": clearBetaSessionCookie(request.url) } },
  );
}
