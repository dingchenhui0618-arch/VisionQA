import { stableError } from "../../../lib/platform/contracts";

/**
 * Prototype compatibility endpoint.
 *
 * It intentionally performs no server write: the old payload does not carry a
 * complete evaluation snapshot, optimistic-lock version, or idempotency key.
 * Accepting it as production audit would recreate the partial-write problem.
 * The prototype UI handles this non-persistence through the same local fallback
 * path it uses for AUDIT_DB_UNAVAILABLE, but neither state is production audit.
 * Production writes live in the formal repository, where humanOverrides,
 * commercialRecalibrationLogs (status: "CAPTURED"), and auditEvents are
 * submitted together through one D1 batch.
 */
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  return stableError(
    "LEGACY_OVERRIDE_ENDPOINT",
    "该原型接口不写入生产审计；请先保存完整评估，再调用 /api/evaluations/{id}/overrides",
    requestId,
    409,
    false,
    { persisted: "none" },
  );
}
