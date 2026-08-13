import { RuntimeError, toSafeError } from "./errors.mjs";
import { assertDependencyPorts } from "./ports.mjs";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_REFERENCE_IMAGES = 4;

function requireId(value, name) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new RuntimeError("INVALID_REQUEST", `${name} is invalid.`, {
      status: 400,
    });
  }
  return value;
}

function withTimeout(operation, timeoutMs, signal) {
  const controller = new AbortController();
  const forward = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", forward, { once: true });
  const timer = setTimeout(() => controller.abort("runtime-timeout"), timeoutMs);
  return operation(controller.signal).finally(() => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  });
}

export function createRuntimeService({ config, dependencies, logger }) {
  const ports = assertDependencyPorts(dependencies, config.mode);

  async function resolveImage({ tenantId, objectKey, role }) {
    if (
      typeof objectKey !== "string" ||
      !objectKey.startsWith(`staging/visionqa/${tenantId}/`)
    ) {
      throw new RuntimeError(
        "INVALID_OBJECT_SCOPE",
        "Object is outside the staging tenant prefix.",
        { status: 403 },
      );
    }
    const metadata = await ports.objectStorage.head({ tenantId, objectKey });
    if (!metadata) {
      throw new RuntimeError("OBJECT_NOT_FOUND", "Input object was not found.", {
        status: 404,
      });
    }
    const signed = await ports.objectStorage.presignGet({
      tenantId,
      objectKey,
      ttlSeconds: 60,
    });
    const image = {
      role,
      url: signed.url,
      mimeType: metadata.mimeType,
      access: "short_lived_private",
      expiresAt: signed.expiresAt,
    };
    if (config.mode !== "live") return image;
    return ports.visionProvider.preparePrivateImage({
      image,
      metadata: {
        assetSha256: metadata.sha256,
        byteSize: metadata.byteSize,
        objectKey: metadata.objectKey,
      },
    });
  }

  async function evaluate(payload, { requestId, signal } = {}) {
    const startedAt = Date.now();
    const tenantId = requireId(payload?.tenantId, "tenantId");
    const assetId = requireId(payload?.assetId, "assetId");
    const objectKey = payload?.objectKey;
    const referenceObjects = payload?.referenceObjects ?? [];
    if (
      !Array.isArray(referenceObjects) ||
      referenceObjects.length > MAX_REFERENCE_IMAGES
    ) {
      throw new RuntimeError(
        "INVALID_REQUEST",
        `referenceObjects must contain at most ${MAX_REFERENCE_IMAGES} objects.`,
        { status: 400 },
      );
    }
    try {
      const candidate = await resolveImage({
        tenantId,
        objectKey,
        role: "candidate",
      });
      const references = await Promise.all(
        referenceObjects.map((reference) =>
          resolveImage({
            tenantId,
            objectKey: reference?.objectKey,
            role: "reference",
          }),
        ),
      );
      const outcome = await withTimeout(
        (attemptSignal) =>
          ports.visionProvider.evaluate(
            {
              ...payload.providerInput,
              requestId,
              assetId,
              candidate,
              references,
            },
            attemptSignal,
          ),
        config.webTimeoutMs,
        signal,
      );
      const saved = await ports.repository.persistEvaluation({
        tenantId,
        assetId,
        requestId,
        idempotencyKey: requireId(payload.idempotencyKey, "idempotencyKey"),
        result: outcome.result,
        provider: outcome.provider,
      });
      logger.emit("evaluation_completed", {
        request_id: requestId,
        tenant_id: tenantId,
        asset_id: assetId,
        evaluation_id: saved.id,
        provider_id: outcome.provider?.providerId,
        duration_ms: Date.now() - startedAt,
        outcome: "success",
      });
      return { evaluationId: saved.id, resultVersion: saved.resultVersion };
    } catch (error) {
      const safe = toSafeError(error);
      logger.emit("evaluation_failed", {
        request_id: requestId,
        tenant_id: tenantId,
        asset_id: assetId,
        error_code: safe.code,
        retryable: safe.retryable,
        duration_ms: Date.now() - startedAt,
        outcome: "failure",
      });
      throw error;
    }
  }

  async function runTask(payload, { requestId, signal } = {}) {
    const jobId = requireId(payload?.jobId, "jobId");
    const attempt = Number(payload?.attempt || 1);
    if (!Number.isInteger(attempt) || attempt < 1 || attempt > config.maxTaskAttempts) {
      throw new RuntimeError(
        "TASK_ATTEMPT_LIMIT",
        `Task attempt must be between 1 and ${config.maxTaskAttempts}.`,
        { status: 409 },
      );
    }
    await ports.repository.recordJobState({
      jobId,
      status: "RUNNING",
      attempt,
      requestId,
    });
    try {
      const result = await withTimeout(
        (attemptSignal) =>
          evaluate(payload.evaluation, { requestId, signal: attemptSignal }),
        config.taskTimeoutMs,
        signal,
      );
      await ports.repository.recordJobState({
        jobId,
        status: "SUCCEEDED",
        attempt,
        requestId,
        evaluationId: result.evaluationId,
      });
      return result;
    } catch (error) {
      const safe = toSafeError(error);
      await ports.repository.recordJobState({
        jobId,
        status:
          safe.retryable && attempt < config.maxTaskAttempts
            ? "RETRY_PENDING"
            : "FAILED",
        attempt,
        requestId,
        errorCode: safe.code,
      });
      throw error;
    }
  }

  return {
    health() {
      return {
        status: "ok",
        mode: config.mode,
        region: config.region,
        maxConcurrency: config.maxConcurrency,
      };
    },
    ready() {
      assertDependencyPorts(ports, config.mode);
      return { status: "ready", mode: config.mode, region: config.region };
    },
    evaluate,
    runTask,
  };
}
