import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function availablePort() {
  const server = createServer();
  server.unref();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

async function waitForServer(url, child, output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `vinext start exited before becoming ready (${child.exitCode})\n${output.join("")}`,
      );
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`vinext start did not become ready\n${output.join("")}`);
}

function referencedStaticAssets(html) {
  const references = new Set();
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const value = match[1];
    if (
      value.startsWith("/") &&
      (value.endsWith(".js") || value.endsWith(".css"))
    ) {
      references.add(value);
    }
  }
  return [...references];
}

test(
  "production start serves every HTML JS/CSS reference and the critical product image",
  { timeout: 30_000 },
  async () => {
    const port = await availablePort();
    const origin = `http://127.0.0.1:${port}`;
    const cli = path.join(
      projectRoot,
      "node_modules",
      "vinext",
      "dist",
      "cli.js",
    );
    const output = [];
    const child = spawn(
      process.execPath,
      [cli, "start", "--port", String(port), "--hostname", "127.0.0.1"],
      {
        cwd: projectRoot,
        env: { ...process.env, NODE_ENV: "production" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (chunk) => output.push(chunk.toString()));
    child.stderr.on("data", (chunk) => output.push(chunk.toString()));

    try {
      const htmlResponse = await waitForServer(`${origin}/`, child, output);
      assert.equal(htmlResponse.status, 200);
      assert.match(
        htmlResponse.headers.get("content-type") || "",
        /text\/html/i,
      );
      const html = await htmlResponse.text();
      const staticAssets = referencedStaticAssets(html);
      assert.ok(
        staticAssets.some((asset) => asset.endsWith(".js")),
        "HTML must reference at least one production JavaScript asset",
      );
      assert.ok(
        staticAssets.some((asset) => asset.endsWith(".css")),
        "HTML must reference at least one production stylesheet",
      );

      const requiredAssets = [
        ...staticAssets,
        "/fashion/model-blue-floral-dress-front.png",
      ];
      const results = await Promise.all(
        requiredAssets.map(async (asset) => {
          const response = await fetch(`${origin}${asset}`);
          return {
            asset,
            status: response.status,
            contentType: response.headers.get("content-type") || "",
          };
        }),
      );

      assert.deepEqual(
        results.filter((result) => result.status !== 200),
        [],
        `production static asset failures:\n${JSON.stringify(results, null, 2)}`,
      );
      for (const result of results) {
        if (result.asset.endsWith(".js")) {
          assert.match(result.contentType, /javascript/i, result.asset);
        } else if (result.asset.endsWith(".css")) {
          assert.match(result.contentType, /text\/css/i, result.asset);
        } else if (result.asset.endsWith(".png")) {
          assert.match(result.contentType, /image\/png/i, result.asset);
        }
      }
    } finally {
      child.kill();
      if (child.exitCode === null) {
        await Promise.race([
          once(child, "exit"),
          new Promise((resolve) => setTimeout(resolve, 2_000)),
        ]);
      }
    }
  },
);
