import { getD1 } from "../../../db";
import { getApiContext } from "../../../lib/platform/api-context";
import {
  ASSET_ROLES,
  isDatabaseUnavailable,
  requiredIdempotencyKey,
  stableError,
  text,
} from "../../../lib/platform/contracts";
import {
  createBatch,
  PlatformConflictError,
} from "../../../lib/platform/repository";

type BatchAssetRequest = {
  id?: string;
  role?: string;
  position?: number;
  sha256?: string;
  sourceUrl?: string;
  productLabel?: string;
  mimeType?: string;
  byteSize?: number;
  r2Key?: string;
};

type BatchRequest = {
  scenario?: string;
  commercialTemplateId?: string;
  commercialTemplateVersion?: string;
  lockedAttributes?: string[];
  assets?: BatchAssetRequest[];
};

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const idempotencyKey = requiredIdempotencyKey(request);
  if (!idempotencyKey) {
    return stableError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "创建批次必须提供 Idempotency-Key",
      requestId,
      400,
    );
  }
  const auth = await getApiContext(requestId);
  if ("response" in auth) return auth.response;

  let payload: BatchRequest;
  try {
    payload = (await request.json()) as BatchRequest;
  } catch {
    return stableError(
      "INVALID_JSON",
      "请求体必须是有效 JSON",
      requestId,
      400,
    );
  }

  const scenario = text(payload.scenario, 120);
  const assets = Array.isArray(payload.assets) ? payload.assets : [];
  const candidateCount = assets.filter(
    (asset) => asset.role === "CANDIDATE",
  ).length;
  const invalidAsset = assets.some(
    (asset) =>
      !text(asset.id, 160) ||
      !ASSET_ROLES.has(text(asset.role, 20)) ||
      !Number.isInteger(asset.position) ||
      Number(asset.position) < 0 ||
      !/^[a-fA-F0-9]{64}$/.test(text(asset.sha256, 64)) ||
      !text(asset.sourceUrl, 1000),
  );
  if (
    scenario !== "fashion_ecommerce_ai_model_image" ||
    assets.length < 1 ||
    assets.length > 40 ||
    candidateCount < 1 ||
    invalidAsset
  ) {
    return stableError(
      "BATCH_REQUEST_INVALID",
      "批次必须包含 1–40 个合法资产且至少有一个 CANDIDATE",
      requestId,
      422,
    );
  }

  try {
    const saved = await createBatch(await getD1(), {
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      requestId,
      idempotencyKey,
      scenario,
      commercialTemplateId:
        text(payload.commercialTemplateId, 120) || null,
      commercialTemplateVersion:
        text(payload.commercialTemplateVersion, 40) || null,
      lockedAttributes: Array.isArray(payload.lockedAttributes)
        ? payload.lockedAttributes
            .map((value) => text(value, 160))
            .filter(Boolean)
        : [],
      assets: assets.map((asset) => ({
        id: text(asset.id, 160),
        role: text(asset.role, 20) as "CANDIDATE" | "REFERENCE",
        position: Number(asset.position),
        sha256: text(asset.sha256, 64),
        sourceUrl: text(asset.sourceUrl, 1000),
        productLabel: text(asset.productLabel, 240) || "未命名素材",
        mimeType: text(asset.mimeType, 120) || null,
        byteSize:
          typeof asset.byteSize === "number" &&
          Number.isInteger(asset.byteSize) &&
          asset.byteSize >= 0
            ? asset.byteSize
            : null,
        r2Key: text(asset.r2Key, 1000) || null,
      })),
    });
    return Response.json(
      {
        batch_id: saved.id,
        status: "READY",
        persisted: "server",
        idempotent_replay: !saved.created,
        request_id: requestId,
      },
      { status: saved.created ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof PlatformConflictError) {
      return stableError(error.code, error.message, requestId, 409);
    }
    if (isDatabaseUnavailable(error)) {
      return stableError(
        "AUDIT_DB_UNAVAILABLE",
        "服务端 D1 尚未绑定或迁移未执行；批次未保存",
        requestId,
        503,
        true,
      );
    }
    return stableError(
      "BATCH_WRITE_FAILED",
      "批次创建失败；没有报告生产保存成功",
      requestId,
      500,
      true,
    );
  }
}
