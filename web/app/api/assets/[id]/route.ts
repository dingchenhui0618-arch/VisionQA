import { requireBetaSessionFromRequest } from "../../../../lib/beta/auth";
import { verifySignedDownloadUrl } from "../../../../lib/beta/asset-urls";
import { ASSET_MAX_BYTES, CustomerVisibleError, customerErrorResponse } from "../../../../lib/beta/contracts";
import { getBetaService } from "../../../../lib/beta/service";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    const session = await requireBetaSessionFromRequest(request);
    const { id } = await context.params;
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > ASSET_MAX_BYTES) {
      throw new CustomerVisibleError(
        "ASSET_TOO_LARGE",
        `这张图片（${(contentLength / 1024 / 1024).toFixed(2)} MB）超过单张 10 MB 限制。`,
        413,
        "请压缩后重新上传。",
      );
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    const asset = await getBetaService().putAsset(session, id, bytes);
    return Response.json({ asset_id: asset.id, status: asset.uploadStatus }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return customerErrorResponse(error);
  }
}

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireBetaSessionFromRequest(request);
    const { id } = await context.params;
    const { asset, bytes } = getBetaService().readAsset(session, id);
    const url = new URL(request.url);
    const download = url.searchParams.get("download") === "1";
    if (download) await verifySignedDownloadUrl(session, id, url);
    return new Response(bytes, {
      headers: {
        "content-type": asset.mimeType,
        "content-length": String(bytes.byteLength),
        "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return customerErrorResponse(error);
  }
}
