import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const projectRoot = path.resolve(root, "..");
const outputDir = path.resolve(root, "dist");

function git(args) {
  try {
    return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const lock = await readFile(path.join(root, "package-lock.json"));
const envExample = await readFile(path.join(root, ".env.example"), "utf8");
const serverOnlyVariables = envExample
  .split(/\r?\n/)
  .map((line) => line.match(/^([A-Z][A-Z0-9_]+)=/u)?.[1])
  .filter(Boolean)
  .filter((name) => !name.includes("PUBLIC"));

const manifest = {
  schema: "visionqa-release-manifest-v1",
  generatedAt: new Date().toISOString(),
  gitCommit: git(["rev-parse", "HEAD"]),
  gitBranch: git(["branch", "--show-current"]),
  packageLockSha256: createHash("sha256").update(lock).digest("hex"),
  runtime: { node: process.version, packageManager: "npm ci", start: "npm run start" },
    build: { command: "npm run build", output: "dist/{client,server}", publicAssets: "public" },
  environments: ["local", "staging", "production"],
  serverOnlyVariables,
  safeguards: {
    paymentProvider: "disabled_until_business_approval",
    productProviders: ["deepseek", "qwen"],
    automaticPublish: false,
    rawSecretsIncluded: false,
  },
};

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: "dist/release-manifest.json", gitCommit: manifest.gitCommit, packageLockSha256: manifest.packageLockSha256 }));
