import { requireBetaSessionFromRequest } from "../../../../lib/beta/auth";
import { getBetaBackend } from "../../../../lib/beta/backend";
import { customerErrorResponse } from "../../../../lib/beta/contracts";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return Response.json({ error: "此入口仅供本地开发。" }, { status: 404 });
  }
  try {
    const session = await requireBetaSessionFromRequest(request);
    const service = getBetaBackend();
    const id = url.searchParams.get("project") ?? "";
    return Response.json({ assets: await service.listProjectAssets(session, id), batch: await service.latestBatchForProject(session, id), items: await service.listProjectScreeningItems(session, id), repairs: await service.listProjectRepairs(session, id), credits: await service.getCredits(session) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return customerErrorResponse(error); }
}
