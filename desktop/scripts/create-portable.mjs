import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DESKTOP_BUNDLE_SCOPE, shouldIncludeDesktopBundlePath } from "./desktop-bundle-filter.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "..");
const webRoot = path.join(repoRoot, "web");
const output = path.resolve(process.env.VISIONQA_DESKTOP_OUTPUT || path.join(webRoot, "dist", "visionqa-desktop-alpha-portable"));
const markerName = ".visionqa-portable-bundle.json";

function assertGeneratedPath(target) {
  const distRoot = path.resolve(webRoot, "dist");
  if (!(target === distRoot || target.startsWith(`${distRoot}${path.sep}`))) {
    throw new Error(`portable output must stay under ${distRoot}`);
  }
}

async function copyRequired(relativePath, destination = relativePath) {
  const source = path.join(repoRoot, relativePath);
  if (!existsSync(source)) throw new Error(`required source is missing: ${relativePath}`);
  await cp(source, path.join(output, destination), {
    recursive: true,
    force: true,
    filter: (candidate) => shouldIncludeDesktopBundlePath(candidate, repoRoot),
  });
}

function currentCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unavailable";
  }
}

assertGeneratedPath(output);
if (existsSync(output)) {
  const marker = path.join(output, markerName);
  if (!existsSync(marker)) throw new Error(`refusing to replace non-VisionQA directory: ${output}`);
  await rm(output, { recursive: true, force: true });
}
await mkdir(output, { recursive: true });

await copyRequired("desktop/main.mjs");
await copyRequired("desktop/provider-settings.mjs");
await copyRequired("desktop/preload.cjs");
await copyRequired("desktop/export.mjs");
await copyRequired("desktop/renderer", "renderer");
await copyRequired("web/package.json", "web/package.json");
await copyRequired("web/package-lock.json", "web/package-lock.json");
await copyRequired("web/app", "web/app");
await copyRequired("web/lib", "web/lib");
await copyRequired("web/public", "web/public");
await copyRequired("web/scripts/start-local.mjs", "web/scripts/start-local.mjs");
await copyRequired("web/scripts/desktop-provider-config.mjs", "web/scripts/desktop-provider-config.mjs");
await copyRequired("web/next.config.ts", "web/next.config.ts");
await copyRequired("web/vite.config.ts", "web/vite.config.ts");
await copyRequired("web/.openai/hosting.json", "web/.openai/hosting.json");
await copyRequired("web/build/sites-vite-plugin.ts", "web/build/sites-vite-plugin.ts");

const launchScript = `# VisionQA Desktop Alpha portable shell\n$ErrorActionPreference = "Stop"\n$root = Split-Path -Parent $MyInvocation.MyCommand.Path\n$web = Join-Path $root "web"\nif (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "Node.js/npm is required for this developer portable bundle." }\nif (-not (Test-Path (Join-Path $web "node_modules"))) { throw "Dependencies are not bundled. Run npm ci in the web directory before starting." }\nPush-Location $web\ntry { npm run desktop:dev } finally { Pop-Location }\n`;
const portableLaunchScript = launchScript.replace("try { npm run desktop:dev }", "try { & npm.cmd run desktop:dev }");
await writeFile(path.join(output, "launch.ps1"), portableLaunchScript, "utf8");

const packageJson = JSON.parse(await readFile(path.join(webRoot, "package.json"), "utf8"));
const manifest = {
  schema: "visionqa-desktop-portable-v0.2",
  generated_at: new Date().toISOString(),
  git_commit: currentCommit(),
  app: { name: "VisionQA Desktop Alpha", electron: packageJson.devDependencies?.electron ?? "unresolved" },
  mode: "developer-portable-shell",
  local_url: "http://localhost:6300/plugin",
  provider_mode_default: "off",
  provider_calls: false,
  source_write: false,
  dependencies_bundled: false,
  bundle_scope: DESKTOP_BUNDLE_SCOPE,
  notes: [
    "This directory intentionally excludes node_modules, Electron binaries, .env files, secrets and user assets.",
    "Run npm ci in web/ before launch; this bundle is not a signed end-user installer.",
    "When localhost:6300 is occupied by an incompatible service, the desktop runtime automatically falls back to localhost:6301 without terminating unknown processes.",
  ],
};
await writeFile(path.join(output, markerName), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(path.join(output, "README.md"), `# VisionQA Desktop Alpha portable shell\n\nThis is a slim, reproducible developer bundle for the standalone visual-review plugin. It intentionally keeps only the plugin route, health/visual-review API, and their VisionQA runtime dependencies; historical workbench routes and sample image paths are not part of the public source snapshot and are not copied here.\n\n1. Install Node.js 22+ and npm.\n2. Run \`npm ci\` inside \`web/\`.\n3. Run \`./launch.ps1\` from PowerShell.\n\nProvider mode is fixed to off by default; real Provider calls require an external secrets file and an explicit desktop mode setting.\n`, "utf8");
const portableReadmePath = path.join(output, "README.md");
const portableReadme = await readFile(portableReadmePath, "utf8");
await writeFile(portableReadmePath, `${portableReadme}\nIf localhost:6300 is occupied by another service, Electron probes it first and automatically uses localhost:6301 when needed. It never terminates an unknown process.\n`, "utf8");
console.log(JSON.stringify({ output, schema: manifest.schema, electron: manifest.app.electron, dependencies_bundled: false }, null, 2));
