import { getD1 } from "../../../../db";
import { getApiContext } from "../../../../lib/platform/api-context";
import {
  isDatabaseUnavailable,
  stableError,
  text,
} from "../../../../lib/platform/contracts";
import { getEvaluation } from "../../../../lib/platform/repository";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const auth = await getApiContext(requestId);
  if ("response" in auth) return auth.response;

  const evaluationId = text((await context.params).id, 160);
  if (!evaluationId) {
    return stableError(
      "EVALUATION_ID_REQUIRED",
      "缺少评估 ID",
      requestId,
      400,
    );
  }

  try {
    const evaluation = await getEvaluation(
      await getD1(),
      auth.tenantId,
      evaluationId,
    );
    if (!evaluation) {
      return stableError(
        "EVALUATION_NOT_FOUND",
        "评估结果不存在或不属于当前租户",
        requestId,
        404,
      );
    }
    return Response.json({
      evaluation_id: evaluation.id,
      result_version: evaluation.resultVersion,
      result: evaluation.result,
      overrides: evaluation.overrides,
      request_id: requestId,
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return stableError(
        "AUDIT_DB_UNAVAILABLE",
        "服务端 D1 尚未绑定或迁移未执行",
        requestId,
        503,
        true,
      );
    }
    return stableError(
      "EVALUATION_READ_FAILED",
      "评估结果读取失败",
      requestId,
      500,
      true,
    );
  }
}
