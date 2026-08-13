import { getD1 } from "../../../db";
import {
  executionMetadataFromRequest,
  isDatabaseUnavailable,
  requiredIdempotencyKey,
  stableError,
  text,
  validateEvaluationEnvelope,
  type PersistedEvaluationResult,
} from "../../../lib/platform/contracts";
import { getApiContext } from "../../../lib/platform/api-context";
import {
  persistEvaluation,
  PlatformConflictError,
} from "../../../lib/platform/repository";

type EvaluationRequest = {
  result?: unknown;
  execution?: unknown;
  commercialTemplateId?: string;
  commercialTemplateVersion?: string;
};

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const idempotencyKey = requiredIdempotencyKey(request);
  if (!idempotencyKey) {
    return stableError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "写入评估结果必须提供 Idempotency-Key",
      requestId,
      400,
    );
  }

  const context = await getApiContext(requestId);
  if ("response" in context) return context.response;

  let payload: EvaluationRequest;
  try {
    payload = (await request.json()) as EvaluationRequest;
  } catch {
    return stableError(
      "INVALID_JSON",
      "请求体必须是有效 JSON",
      requestId,
      400,
    );
  }

  const contractIssues = validateEvaluationEnvelope(payload.result);
  if (contractIssues.length) {
    return stableError(
      "EVALUATION_CONTRACT_INVALID",
      "评估结果不符合 evaluation-result v0.2 最小运行时约束",
      requestId,
      422,
      false,
      contractIssues,
    );
  }
  const normalized = executionMetadataFromRequest(
    payload.result as PersistedEvaluationResult,
    payload.execution,
  );
  if (!normalized.metadata) {
    return stableError(
      "EVALUATION_EXECUTION_METADATA_INVALID",
      "评估执行元数据不完整",
      requestId,
      422,
      false,
      normalized.issues,
    );
  }

  try {
    const saved = await persistEvaluation(await getD1(), {
      tenantId: context.tenantId,
      actorId: context.actorId,
      requestId,
      idempotencyKey,
      result: payload.result as PersistedEvaluationResult,
      execution: normalized.metadata,
      commercialTemplateId:
        text(payload.commercialTemplateId, 120) || null,
      commercialTemplateVersion:
        text(payload.commercialTemplateVersion, 40) || null,
    });
    return Response.json(
      {
        evaluation_id: saved.id,
        result_version: saved.resultVersion,
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
        "服务端 D1 尚未绑定或迁移未执行；生产审计未保存",
        requestId,
        503,
        true,
      );
    }
    return stableError(
      "EVALUATION_WRITE_FAILED",
      "评估结果写入失败；没有报告生产保存成功",
      requestId,
      500,
      true,
    );
  }
}
