import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DESKTOP_BUNDLE_SCOPE, shouldIncludeDesktopBundlePath } from "./desktop-bundle-filter.mjs";

// This is deliberately a source/developer bundle rather than a fake macOS
// installer. It can be created on Windows and then completed on a macOS host
// with the normal Electron dependency install and builder command.
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "..");
const webRoot = path.join(repoRoot, "web");
const output = path.resolve(
  process.env.VISIONQA_DESKTOP_MAC_OUTPUT ||
    path.join(webRoot, "dist", "visionqa-desktop-alpha-macos-bundle"),
);
const markerName = ".visionqa-macos-bundle.json";

function assertGeneratedPath(target) {
  const distRoot = path.resolve(webRoot, "dist");
  if (!(target === distRoot || target.startsWith(`${distRoot}${path.sep}`))) {
    throw new Error(`macOS bundle output must stay under ${distRoot}`);
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

const launchScript = `#!/bin/sh
set -eu
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
WEB_DIR="$ROOT_DIR/web"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 22+ and npm are required for this developer bundle." >&2
  exit 1
fi
if [ ! -d "$WEB_DIR/node_modules" ]; then
  echo "Dependencies are not bundled. Run npm ci in the web directory first." >&2
  exit 1
fi
cd "$WEB_DIR"
exec npm run desktop:dev
`;
await writeFile(path.join(output, "launch.sh"), launchScript, "utf8");

const packageJson = JSON.parse(await readFile(path.join(webRoot, "package.json"), "utf8"));
const desktopPackageJson = JSON.parse(await readFile(path.join(desktopRoot, "package.json"), "utf8"));
const manifest = {
  schema: "visionqa-desktop-macos-bundle-v0.2",
  generated_at: new Date().toISOString(),
  git_commit: currentCommit(),
  app: { name: "VisionQA Desktop Alpha", electron: desktopPackageJson.devDependencies?.electron ?? "unresolved" },
  platform: "darwin",
  architectures: ["x64", "arm64"],
  mode: "developer-portable-shell",
  local_url: "http://localhost:6300/plugin",
  provider_mode_default: "off",
  provider_calls: false,
  source_write: false,
  dependencies_bundled: false,
  bundle_scope: DESKTOP_BUNDLE_SCOPE,
  installer_verified: false,
  notes: [
    "This source bundle intentionally excludes node_modules, Electron binaries, .env files, secrets and user assets.",
    "Run npm ci in web/ on a macOS host before launch; this is not a signed or notarized .app/.zip.",
    "Run electron-builder --mac zip on macOS to produce x64 and arm64 zip artifacts after reviewing signing policy.",
  ],
};
await writeFile(path.join(output, markerName), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(
  path.join(output, "README.md"),
  `# VisionQA Desktop Alpha macOS developer bundle

This is a slim, reproducible source/developer bundle for macOS x64 and arm64.
It keeps the standalone plugin route and its VisionQA runtime closure while
excluding historical workbench routes and sample image paths from the bundle.
It is not a signed or notarized Electron application and it does not contain
an Electron binary or dependency tree.

1. Install Node.js 22+ and npm on a macOS host.
2. Run \`npm ci\` inside \`web/\`.
3. Run \`sh launch.sh\` from this directory.

The shell opens the existing local VisionQA plugin at \`/plugin\`. Provider
mode is fixed to off by default; real Provider calls require an external
secrets file and an explicit desktop mode setting. Source writes remain
disabled. The macOS zip build
must be run on macOS with:

\`\`\`sh
cd web
npm run desktop:builder:mac
\`\`\`

That command is intentionally not claimed as verified on the Windows build
host that generated this bundle. Signing, notarization, update, and rollback
policy remain release decisions.
`,
  "utf8",
);
console.log(
  JSON.stringify(
    {
      output,
      schema: manifest.schema,
      platform: manifest.platform,
      architectures: manifest.architectures,
      electron: manifest.app.electron,
      dependencies_bundled: manifest.dependencies_bundled,
      installer_verified: manifest.installer_verified,
    },
    null,
    2,
  ),
);
