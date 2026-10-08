import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const output = path.resolve(root, "dist", "release-candidate");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "release:prepare"]);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// vinext serves the production bundle from the top-level `dist/{client,server}` tree.
await mkdir(path.join(output, "dist"), { recursive: true });
for (const entry of ["client", "server", ".openai"]) {
  await cp(path.join(root, "dist", entry), path.join(output, "dist", entry), { recursive: true });
}
for (const entry of ["public", "package.json", "package-lock.json", ".env.example"]) {
  await cp(path.join(root, entry), path.join(output, entry), { recursive: true });
}
await cp(path.join(root, "dist", "release-manifest.json"), path.join(output, "release-manifest.json"));
await writeFile(path.join(output, "DEPLOY.md"), `# VisionQA release candidate\n\n1. Copy this directory to the target server.\n2. Keep \.env.example as a template; inject real values through the server secret manager.\n3. Run \`npm ci\` in the candidate directory because the current vinext runtime is packaged as a development dependency.\n4. Run \`npm run start\` behind the reverse proxy.\n5. Check \`GET /api/health\` before inviting users.\n\nThis directory intentionally contains no secrets, uploads, logs, local state, or web/artifacts.\n`, "utf8");

console.log(JSON.stringify({ output: path.relative(root, output), excluded: [".env*", "work", "uploads", "runs", "logs", "web/artifacts"] }));
