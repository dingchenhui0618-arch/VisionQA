import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DESKTOP_INHERITED_ENV_NAMES, loadDesktopProviderEnv, resolveDesktopProviderMode } from "./desktop-provider-config.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const preview = process.argv.includes("--preview");
const desktopPort = process.env.VISIONQA_DESKTOP_PORT?.trim()
  || (process.env.VISIONQA_DESKTOP_WEB_URL ? new URL(process.env.VISIONQA_DESKTOP_WEB_URL).port : "")
  || "6300";
const desktopModeRequested = process.env.VISIONQA_DESKTOP_MODE === "real" || process.env.VISIONQA_DESKTOP_MODE === "off" || process.env.VISIONQA_DESKTOP_PROVIDER_MODE === "real";
const desktopProviderMode = desktopModeRequested
  ? resolveDesktopProviderMode(process.env.VISIONQA_DESKTOP_PROVIDER_MODE || process.env.VISIONQA_DESKTOP_MODE)
  : null;

const desktopProvider = desktopModeRequested
  ? await loadDesktopProviderEnv({
      mode: desktopProviderMode,
      explicitPath: process.env.VISIONQA_DESKTOP_SECRETS_FILE,
      env: process.env,
      projectRoot: root,
    })
  : { values: {}, source: "inherited", path: null };

if (desktopModeRequested) {
  console.log(`[visionqa] desktop Provider mode: ${desktopProviderMode}; secrets source: ${desktopProvider.source}`);
  if (desktopProviderMode === "real" && desktopProvider.source === "missing") {
    console.warn("[visionqa] Provider is enabled but no external secrets file was found; requests will fail closed until it is configured.");
  }
}

const inheritedDesktopEnv = Object.fromEntries(
  DESKTOP_INHERITED_ENV_NAMES.flatMap((name) => process.env[name] === undefined ? [] : [[name, process.env[name]]]),
);

const childEnv = desktopModeRequested
  ? {
      ...inheritedDesktopEnv,
      VISIONQA_AGENT_LOCAL: "true",
      VISIONQA_AGENT_MOCK: preview ? "true" : "false",
    }
  : {
      ...process.env,
      VISIONQA_AGENT_LOCAL: "true",
      VISIONQA_AGENT_MOCK: preview ? "true" : "false",
    };

if (desktopModeRequested) {
  // Desktop mode starts from the non-secret allowlist above. Provider keys
  // can only enter through the explicitly external secrets file.
  Object.assign(childEnv, desktopProvider.values);
  childEnv.VISIONQA_DESKTOP_MODE = desktopProviderMode;
  childEnv.VISIONQA_DESKTOP_PROVIDER_MODE = desktopProviderMode;
  childEnv.VISIONQA_AGENT_MOCK = desktopProviderMode === "off" ? "true" : "false";
  childEnv.VISION_MULTIMODAL_ENABLED = desktopProviderMode === "real"
    ? desktopProvider.values.VISION_MULTIMODAL_ENABLED || "true"
    : "false";
  // This gate is only meaningful for the local desktop process. The server
  // still checks the request permissions and Provider readiness separately.
  childEnv.VISION_LOCAL_CANARY_ALLOW_LOCALHOST = desktopProviderMode === "real" ? "true" : "false";
}

const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url)), "dev", "--hostname", "localhost", "--port", desktopPort], {
  cwd: root,
  env: childEnv,
  stdio: "inherit",
});
child.on("exit", code => { process.exitCode = code ?? 1; });
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
