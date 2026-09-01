import { requireBetaSessionFromRequest } from "../../../../lib/beta/auth";
import { customerErrorResponse, DOWNLOAD_URL_TTL_SECONDS } from "../../../../lib/beta/contracts";
import { getBetaService } from "../../../../lib/beta/service";

export async function POST(request: Request) {
  try {
    const session = await requireBetaSessionFromRequest(request);
    const input = (await request.json()) as Record<string, unknown>;
    const asset = getBetaService().createUploadIntent(session, {
      projectId: String(input.project_id ?? ""),
      role: input.role === "TRUTH" ? "TRUTH" : "CANDIDATE",
      fileName: String(input.file_name ?? ""),
      mimeType: String(input.mime_type ?? "") as "image/jpeg" | "image/png" | "image/webp",
      byteSize: Number(input.byte_size),
      width: Number(input.width),
      height: Number(input.height),
    });
    return Response.json(
      {
        asset_id: asset.id,
        upload: { method: "PUT", url: `/api/assets/${asset.id}`, expires_in: DOWNLOAD_URL_TTL_SECONDS },
      },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return customerErrorResponse(error);
  }
}
