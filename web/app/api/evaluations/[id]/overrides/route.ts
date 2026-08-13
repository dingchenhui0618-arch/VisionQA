import { getD1 } from "../../../../../db";
import { getApiContext } from "../../../../../lib/platform/api-context";
import {
  DECISIONS,
  isDatabaseUnavailable,
  requiredIdempotencyKey,
  stableError,
  text,
} from "../../../../../lib/platform/contracts";
import {
  persistOverride,
  PlatformConflictError,
} from "../../../../../lib/platform/repository";

type OverrideRequest = {
  originalDecision?: string;
  humanDecision?: string;
  reasonCode?: string;
  evidenceNote?: string;
  baseEvaluationVersion?: number;
  commercialTemplateId?: string;
  commercialTemplateVersion?: string;
  systemFitScore?: number | null;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const idempotencyKey = requiredIdempotencyKey(request);
  if (!idempotencyKey) {
    return stableError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "人工改判必须提供 Idempotency-Key",
      requestId,
      400,
    );
  }

  const auth = await getApiContext(requestId);
  if ("response" in auth) return auth.response;

  let payload: OverrideRequest;
  try {
    payload = (await request.json()) as OverrideRequest;
  } catch {
    return stableError(
      "INVALID_JSON",
      "请求体必须是有效 JSON",
      requestId,
      400,
    );
  }

  const evaluationId = text((await context.params).id, 160);
  const originalDecision = text(payload.originalDecision, 12);
  const humanDecision = text(payload.humanDecision, 12);
  const reasonCode = text(payload.reasonCode, 80);
  const evidenceNote = text(payload.evidenceNote, 2000);
  if (
    !evaluationId ||
    !DECISIONS.has(originalDecision) ||
    !DECISIONS.has(humanDecision) ||
    !reasonCode ||
    !evidenceNote ||
    !Number.isInteger(payload.baseEvaluationVersion) ||
    Number(payload.baseEvaluationVersion) < 1
  ) {
    return stableError(
      "OVERRIDE_REQUEST_INVALID",
      "缺少有效的评估版本、结论、原因或业务证据",
      requestId,
      422,
    );
  }

  try {
    const saved = await persistOverride(await getD1(), {
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      requestId,
      idempotencyKey,
      evaluationId,
      baseEvaluationVersion: Number(payload.baseEvaluationVersion),
      originalDecision,
      humanDecision,
      reasonCode,
      evidenceNote,
      commercialTemplateId:
        text(payload.commercialTemplateId, 120) || null,
      commercialTemplateVersion:
        text(payload.commercialTemplateVersion, 40) || null,
      systemFitScore:
        typeof payload.systemFitScore === "number"
          ? Math.max(0, Math.min(100, payload.systemFitScore))
          : null,
    });
    return Response.json(
      {
        override_id: saved.id,
        persisted: "server",
        idempotent_replay: !saved.created,
        request_id: requestId,
      },
      { status: saved.created ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof PlatformConflictError) {
      const status = error.code === "EVALUATION_NOT_FOUND" ? 404 : 409;
      return stableError(error.code, error.message, requestId, status);
    }
    if (isDatabaseUnavailable(error)) {
      return stableError(
        "AUDIT_DB_UNAVAILABLE",
        "服务端 D1 尚未绑定或迁移未执行；人工改判未写入生产审计",
        requestId,
        503,
        true,
      );
    }
    return stableError(
      "OVERRIDE_WRITE_FAILED",
      "人工改判写入失败；没有报告生产保存成功",
      requestId,
      500,
      true,
    );
  }
}
