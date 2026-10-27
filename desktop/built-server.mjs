import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

const MAX_REQUEST_BYTES = 12 * 1024 * 1024;

async function readRequestBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_REQUEST_BYTES) throw new Error("request body exceeds the local desktop limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function nodeHeadersToFetchHeaders(headers) {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) result.set(name, value.join(", "));
    else if (value !== undefined) result.set(name, value);
  }
  return result;
}

function writeFetchResponse(response, nodeResponse, requestMethod) {
  const headers = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  const setCookies = response.headers.getSetCookie?.() ?? [];
  if (setCookies.length) headers["set-cookie"] = setCookies;
  nodeResponse.writeHead(response.status, headers);
  if (requestMethod === "HEAD" || !response.body || [204, 205, 304].includes(response.status)) {
    nodeResponse.end();
    return;
  }
  Readable.fromWeb(response.body).pipe(nodeResponse);
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

function staticTarget(pathname, clientRoot) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decoded || decoded.includes("\0") || !decoded.startsWith("/") || decoded.startsWith("//")) return null;
  const relative = decoded.slice(1);
  const target = path.resolve(clientRoot, relative);
  const root = path.resolve(clientRoot);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null;
  if (!existsSync(target) || !statSync(target).isFile()) return null;
  return target;
}

function serveStatic(request, response, clientRoot) {
  if (!clientRoot || (request.method !== "GET" && request.method !== "HEAD")) return false;
  const pathname = new URL(request.url || "/", "http://visionqa.local").pathname;
  if (pathname.startsWith("/api/") || pathname === "/plugin" || pathname === "/") return false;
  const target = staticTarget(pathname, clientRoot);
  if (!target) return false;
  const extension = path.extname(target).toLowerCase();
  response.writeHead(200, {
    "content-type": contentTypes.get(extension) || "application/octet-stream",
    "cache-control": pathname.startsWith("/_next/") ? "public, max-age=31536000, immutable" : "public, max-age=3600",
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(target).pipe(response);
  return true;
}

export async function startBuiltVisionqaServer({ serverEntry, clientRoot, host = "127.0.0.1", port = 6300 } = {}) {
  if (!serverEntry) throw new Error("built VisionQA server entry is required");
  const module = await import(pathToFileURL(serverEntry).href);
  const handler = module.default;
  if (!handler || typeof handler.fetch !== "function") {
    throw new Error(`built VisionQA server entry has no fetch handler: ${serverEntry}`);
  }

  const server = createServer(async (request, response) => {
    try {
      if (serveStatic(request, response, clientRoot)) return;
      const body = await readRequestBody(request);
      const url = `http://${request.headers.host || `${host}:${port}`}${request.url || "/"}`;
      const init = { method: request.method, headers: nodeHeadersToFetchHeaders(request.headers) };
      if (body !== undefined) {
        init.body = body;
        init.duplex = "half";
      }
      const result = await handler.fetch(new Request(url, init), {}, {});
      writeFetchResponse(result, response, request.method);
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end("VisionQA local runtime failed to handle this request.");
      console.error(`[desktop] built server request failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    }
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const serverEntry = process.argv[2];
  const port = Number(process.argv[3] || 6300);
  startBuiltVisionqaServer({ serverEntry, port })
    .then(() => console.log(`[desktop] built VisionQA server listening on http://127.0.0.1:${port}`))
    .catch((error) => {
      console.error(error instanceof Error ? error.stack || error.message : String(error));
      process.exitCode = 1;
    });
}
