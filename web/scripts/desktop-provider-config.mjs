import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

export const DESKTOP_PROVIDER_MODES = Object.freeze(["off", "real"]);

// The desktop shell deliberately accepts a small, explicit environment surface.
// Unknown names are ignored so a secrets file cannot become an arbitrary process
// environment injection channel.
export const DESKTOP_PROVIDER_ENV_NAMES = Object.freeze([
  "VISION_MULTIMODAL_ENABLED",
  "VISION_MULTIMODAL_ENDPOINT",
  "VISION_MULTIMODAL_MODEL",
  "VISION_MULTIMODAL_PROVIDER_ID",
  "VISION_MULTIMODAL_MAX_TOTAL_REQUESTS",
  "DEEPSEEK_API_KEY",
  "VISION_MULTIMODAL_API_KEY",
  "VISION_LOCAL_CANARY_ALLOW_LOCALHOST",
  "VISION_CN_ALIYUN_BAILIAN_API_KEY",
  "DASHSCOPE_API_KEY",
  "VISION_MODEL",
  "VISION_LOCAL_CANARY_ENABLED",
  "VISION_PAID_CALLS_ENABLED",
  "VISION_DATA_PROCESSING_APPROVED",
  "EXPLICIT_RUN_APPROVAL",
  "VISION_BUDGET_CURRENCY",
  "VISION_BUDGET_LIMIT_MINOR_UNITS",
  "VISION_LOCAL_CANARY_MAX_TOTAL_REQUESTS",
  "VISION_MAX_CONCURRENCY",
  "VISIONQA_HOST_REQUEST_TIMEOUT_MS",
]);

// Non-secret values that may be inherited by a desktop-mode web process.
// Provider keys and other credentials must come only from the external file.
export const DESKTOP_INHERITED_ENV_NAMES = Object.freeze([
  "PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP",
  "USERPROFILE", "APPDATA", "LOCALAPPDATA", "HOME", "HOMEDRIVE", "HOMEPATH",
  "COMSPEC", "NODE_ENV", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE",
  "VISIONQA_CHROME_EXTENSION_ID", "VISIONQA_RELEASE_MODE",
  "VISIONQA_PAYMENT_PROVIDER", "VISIONQA_TEST_ENVIRONMENT",
]);

// These names are never read from the desktop secrets file and are reserved as
// sensitive names for boundary tests. Desktop mode starts from the inherited
// allowlist above, so they cannot reach the child process from the parent shell.
export const DESKTOP_STRIPPED_ENV_NAMES = Object.freeze([
  ...DESKTOP_PROVIDER_ENV_NAMES,
  "VISIONQA_ORCHESTRATOR_DEEPSEEK_API_KEY",
  "VISION_REPAIR_QWEN_API_KEY",
  "VISIONQA_ASSET_URL_SIGNING_SECRET",
  "REACTBITS_LICENSE_KEY",
  "VISIONQA_TEST_INVITE_TOKEN",
  "VISIONQA_TEST_INVITE_TOKENS",
  "DATABASE_URL",
  "POSTGRES_URL",
  "PGPASSWORD",
]);

const allowedNames = new Set(DESKTOP_PROVIDER_ENV_NAMES);

export function resolveDesktopProviderMode(value) {
  return String(value ?? "").trim().toLowerCase() === "real" ? "real" : "off";
}

export function defaultDesktopSecretsFile(env = process.env, platform = process.platform) {
  if (platform === "win32") {
    const appData = env.APPDATA || env.USERPROFILE;
    return appData ? path.join(appData, "VisionQA", "secrets", "provider.env") : null;
  }
  if (platform === "darwin") {
    return env.HOME ? path.join(env.HOME, "Library", "Application Support", "VisionQA", "secrets", "provider.env") : null;
  }
  return env.XDG_CONFIG_HOME
    ? path.join(env.XDG_CONFIG_HOME, "VisionQA", "secrets", "provider.env")
    : env.HOME
      ? path.join(env.HOME, ".config", "VisionQA", "secrets", "provider.env")
      : null;
}

function unquote(value) {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseProviderEnv(source) {
  const values = {};
  for (const rawLine of String(source).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || !allowedNames.has(match[1])) continue;
    values[match[1]] = unquote(match[2].trim());
  }
  return values;
}

async function assertPrivateSecretsFile(filePath, platform) {
  if (platform === "win32") return;
  const permissions = (await stat(filePath)).mode & 0o777;
  if ((permissions & 0o077) !== 0) {
    throw new Error("VisionQA secrets file must not be group- or world-readable.");
  }
}

export async function loadDesktopProviderEnv({ mode, explicitPath, env = process.env, platform = process.platform, projectRoot } = {}) {
  const resolvedMode = resolveDesktopProviderMode(mode);
  if (resolvedMode !== "real") return { mode: resolvedMode, values: {}, source: "disabled", path: null };

  const candidate = explicitPath?.trim() || defaultDesktopSecretsFile(env, platform);
  if (!candidate) return { mode: resolvedMode, values: {}, source: "missing", path: null };
  if (explicitPath?.trim() && !path.isAbsolute(candidate)) {
    throw new Error("VISIONQA_DESKTOP_SECRETS_FILE must be an absolute path.");
  }
  const filePath = path.resolve(candidate);
  if (projectRoot) {
    const root = path.resolve(projectRoot);
    const comparableFile = platform === "win32" ? filePath.toLowerCase() : filePath;
    const comparableRoot = platform === "win32" ? root.toLowerCase() : root;
    if (comparableFile === comparableRoot || comparableFile.startsWith(`${comparableRoot}${path.sep}`)) {
      throw new Error("VisionQA secrets file must stay outside the project and desktop bundle.");
    }
  }
  try {
    await access(filePath);
    await assertPrivateSecretsFile(filePath, platform);
  } catch (error) {
    if (error?.code === "ENOENT") return { mode: resolvedMode, values: {}, source: "missing", path: filePath };
    throw error;
  }
  const values = parseProviderEnv(await readFile(filePath, "utf8"));
  return { mode: resolvedMode, values, source: "external_file", path: filePath };
}
