import { createServer } from "node:http";
import { RuntimeError, toSafeError } from "./errors.mjs";

async function jsonBody(request, maxBytes = 1_000_000) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      throw new RuntimeError("PAYLOAD_TOO_LARGE", "Request body is too large.", {
        status: 413,
      });
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new RuntimeError("INVALID_JSON", "Request body must be JSON.", {
      status: 400,
    });
  }
}

function send(response, status, body, fcStatus = "200") {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-fc-status": fcStatus,
  });
  response.end(JSON.stringify(body));
}

export function createHttpServer({ service, config, logger }) {
  return createServer(async (request, response) => {
    const requestId =
      request.headers["x-fc-request-id"] ||
      request.headers["x-request-id"] ||
      crypto.randomUUID();
    try {
      if (request.method === "GET" && request.url === "/healthz") {
        return send(response, 200, service.health());
      }
      if (request.method === "GET" && request.url === "/readyz") {
        return send(response, 200, service.ready());
      }
      if (
        config.internalToken &&
        request.headers["x-visionqa-internal-token"] !== config.internalToken
      ) {
        throw new RuntimeError("UNAUTHORIZED", "Internal authentication failed.", {
          status: 401,
        });
      }
      if (request.method === "POST" && request.url === "/v1/evaluations") {
        const result = await service.evaluate(await jsonBody(request), {
          requestId,
          signal: AbortSignal.timeout(config.webTimeoutMs),
        });
        return send(response, 202, { ...result, requestId });
      }
      if (
        request.method === "POST" &&
        request.url === "/internal/tasks/evaluations"
      ) {
        const result = await service.runTask(await jsonBody(request), {
          requestId,
          signal: AbortSignal.timeout(config.taskTimeoutMs),
        });
        return send(response, 202, { ...result, requestId });
      }
      throw new RuntimeError("NOT_FOUND", "Route not found.", { status: 404 });
    } catch (error) {
      const safe = toSafeError(error);
      logger.emit("http_request_failed", {
        request_id: requestId,
        method: request.method,
        route: request.url,
        error_code: safe.code,
        outcome: "failure",
      });
      return send(
        response,
        safe.status,
        {
          error: {
            code: safe.code,
            message: safe.message,
            retryable: safe.retryable,
            requestId,
          },
        },
        safe.status >= 500 ? "500" : "200",
      );
    }
  });
}
