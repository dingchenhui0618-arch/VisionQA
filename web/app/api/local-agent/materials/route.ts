import { requireBetaSessionFromRequest } from "../../../../lib/beta/auth";
import { getBetaService } from "../../../../lib/beta/service";
import { customerErrorResponse } from "../../../../lib/beta/contracts";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return Response.json({ error: "此入口仅供本地开发。" }, { status: 404 });
  }
  try {
    const session = await requireBetaSessionFromRequest(request);
    const service = getBetaService();
    const id = url.searchParams.get("project") ?? "";
    return Response.json({ assets: service.listProjectAssets(session, id), batch: service.latestBatchForProject(session, id) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return customerErrorResponse(error); }
}
