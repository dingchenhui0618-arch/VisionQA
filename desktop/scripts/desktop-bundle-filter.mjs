import path from "node:path";

const BLOCKED_SEGMENTS = /(^|\/)(\.env(?:\.|$)|secrets|uploads|node_modules|runs|artifacts)(\/|$)/i;

function isAncestor(relativePath, target) {
  return relativePath === target
    || target.startsWith(`${relativePath}/`)
    || relativePath.startsWith(`${target}/`);
}

function isAllowedWebApp(relativePath) {
  const allowed = [
    "web/app/layout.tsx",
    "web/app/globals.css",
    "web/app/plugin",
    "web/app/api/health",
    "web/app/api/visual-review",
  ];
  return relativePath === "web/app" || allowed.some((target) => isAncestor(relativePath, target));
}

function isAllowedWebLib(relativePath) {
  return relativePath === "web/lib"
    || relativePath === "web/lib/visionqa"
    || relativePath.startsWith("web/lib/visionqa/")
    || (relativePath.startsWith("web/lib/")
      && !relativePath.slice("web/lib/".length).includes("/")
      && relativePath.endsWith(".ts"));
}

function isAllowedWebPublic(relativePath) {
  return relativePath === "web/public"
    || (relativePath.startsWith("web/public/") && !relativePath.startsWith("web/public/fashion"));
}

function isAllowedWebScripts(relativePath) {
  return relativePath === "web/scripts"
    || relativePath === "web/scripts/start-local.mjs"
    || relativePath === "web/scripts/desktop-provider-config.mjs";
}

const REQUIRED_FILES = new Set([
  "web/package.json",
  "web/package-lock.json",
  "web/next.config.ts",
  "web/vite.config.ts",
  "web/.openai/hosting.json",
  "web/build/sites-vite-plugin.ts",
]);

export function shouldIncludeDesktopBundlePath(candidate, repoRoot) {
  const relativePath = path.relative(repoRoot, candidate).replaceAll("\\", "/");
  if (!relativePath || relativePath === ".") return true;
  if (BLOCKED_SEGMENTS.test(relativePath)) return false;
  if (relativePath === "desktop" || relativePath.startsWith("desktop/")) return true;
  if (REQUIRED_FILES.has(relativePath)) return true;
  if (isAllowedWebApp(relativePath)) return true;
  if (isAllowedWebLib(relativePath)) return true;
  if (isAllowedWebPublic(relativePath)) return true;
  if (isAllowedWebScripts(relativePath)) return true;
  if (relativePath === "web/.openai" || relativePath === "web/build") return true;
  return false;
}

export const DESKTOP_BUNDLE_SCOPE = Object.freeze({
  included: [
    "desktop runtime",
    "plugin route",
    "health and visual-review API routes",
    "visionqa runtime and provider adapters",
    "local Vite/Vinext configuration",
  ],
  excluded: [
    "legacy product routes",
    "agent/customer/internal/landing/login/workspace routes",
    "mock and sample image assets",
    "server-side project, storage and platform modules",
    "secrets, .env files, node_modules and generated runs",
  ],
});
