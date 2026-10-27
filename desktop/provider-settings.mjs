import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  defaultDesktopSecretsFile,
  loadDesktopProviderEnv,
  resolveDesktopProviderMode,
} from "../web/scripts/desktop-provider-config.mjs";

const DEFAULT_PROVIDER_ID = "deepseek";
const DEFAULT_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-flash";
const DEFAULT_MAX_REQUESTS = 10;
const MAX_ENDPOINT_LENGTH = 500;
const MAX_MODEL_LENGTH = 160;
const MAX_PROVIDER_ID_LENGTH = 100;

function appDataRoot(env = process.env, platform = process.platform) {
  if (platform === "win32") return env.APPDATA || env.USERPROFILE || null;
  if (platform === "darwin") return env.HOME ? path.join(env.HOME, "Library", "Application Support") : null;
  return env.XDG_CONFIG_HOME || (env.HOME ? path.join(env.HOME, ".config") : null);
}

export function defaultDesktopSettingsFile(env = process.env, platform = process.platform) {
  const root = appDataRoot(env, platform);
  return root ? path.join(root, "VisionQA", "settings.json") : null;
}

function safeJsonRead(filePath) {
  if (!filePath || !existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readPersistedDesktopSettings({ env = process.env, platform = process.platform } = {}) {
  const settingsFile = env.VISIONQA_DESKTOP_SETTINGS_FILE?.trim() || defaultDesktopSettingsFile(env, platform);
  const settings = safeJsonRead(settingsFile);
  return {
    settingsFile,
    mode: resolveDesktopProviderMode(settings.provider_mode),
    secretsFile: typeof settings.secrets_file === "string" && settings.secrets_file.trim()
      ? path.resolve(settings.secrets_file.trim())
      : defaultDesktopSecretsFile(env, platform),
  };
}

function normalizeEndpoint(value) {
  const endpoint = String(value ?? "").trim().slice(0, MAX_ENDPOINT_LENGTH);
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) return "";
  } catch {
    return "";
  }
  return endpoint;
}

function normalizeProviderId(value) {
  const providerId = String(value ?? "").trim().slice(0, MAX_PROVIDER_ID_LENGTH);
  return /^[A-Za-z0-9._-]{1,100}$/.test(providerId) ? providerId : "";
}

function normalizeModel(value) {
  return String(value ?? "").trim().slice(0, MAX_MODEL_LENGTH);
}

function normalizeMaxRequests(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : DEFAULT_MAX_REQUESTS;
}

function keyNameForProvider(providerId) {
  return providerId === "deepseek" ? "DEEPSEEK_API_KEY" : "VISION_MULTIMODAL_API_KEY";
}

function keyFromValues(values, providerId) {
  if (providerId === "deepseek") return values.DEEPSEEK_API_KEY?.trim() || values.VISION_MULTIMODAL_API_KEY?.trim() || "";
  return values.VISION_MULTIMODAL_API_KEY?.trim() || "";
}

function normalizeApiKey(value) {
  const apiKey = String(value ?? "").trim();
  if (apiKey.length > 2048 || /[\r\n]/.test(apiKey)) throw new Error("API Key 格式无效。");
  return apiKey;
}

function quoteEnvValue(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function providerEnvSource({ mode, providerId, endpoint, model, maxRequests, apiKey }) {
  const keyName = keyNameForProvider(providerId);
  const lines = [
    "# VisionQA desktop Provider settings. This file is local-only and never bundled.",
    `VISION_MULTIMODAL_ENABLED=${mode === "real" ? "true" : "false"}`,
    `VISION_MULTIMODAL_PROVIDER_ID=${quoteEnvValue(providerId)}`,
    `VISION_MULTIMODAL_ENDPOINT=${quoteEnvValue(endpoint)}`,
    `VISION_MULTIMODAL_MODEL=${quoteEnvValue(model)}`,
    `VISION_MULTIMODAL_MAX_TOTAL_REQUESTS=${maxRequests}`,
    `${keyName}=${quoteEnvValue(apiKey)}`,
  ];
  return `${lines.join("\n")}\n`;
}

export async function readProviderSettingsMeta({ env = process.env, platform = process.platform, projectRoot } = {}) {
  const persisted = readPersistedDesktopSettings({ env, platform });
  const loaded = await loadDesktopProviderEnv({
    mode: "real",
    explicitPath: persisted.secretsFile,
    env,
    platform,
    projectRoot,
  });
  const values = loaded.values;
  const providerId = normalizeProviderId(values.VISION_MULTIMODAL_PROVIDER_ID) || DEFAULT_PROVIDER_ID;
  return {
    mode: persisted.mode,
    provider_id: providerId,
    endpoint: normalizeEndpoint(values.VISION_MULTIMODAL_ENDPOINT) || DEFAULT_ENDPOINT,
    model: normalizeModel(values.VISION_MULTIMODAL_MODEL) || DEFAULT_MODEL,
    max_total_requests: normalizeMaxRequests(values.VISION_MULTIMODAL_MAX_TOTAL_REQUESTS),
    api_key_configured: Boolean(keyFromValues(values, providerId)),
    secrets_file: loaded.path || persisted.secretsFile,
    settings_file: persisted.settingsFile,
    source: loaded.source,
    restart_required: false,
  };
}

export async function saveProviderSettings({ input, env = process.env, platform = process.platform, projectRoot } = {}) {
  const persisted = readPersistedDesktopSettings({ env, platform });
  const mode = resolveDesktopProviderMode(input?.mode);
  const providerId = normalizeProviderId(input?.provider_id);
  const endpoint = normalizeEndpoint(input?.endpoint);
  const model = normalizeModel(input?.model);
  const maxRequests = normalizeMaxRequests(input?.max_total_requests);
  if (!providerId) throw new Error("Provider ID 只能包含字母、数字、点、下划线和短横线。");
  if (!endpoint) throw new Error("Endpoint 必须是 HTTPS 地址，或 localhost 的本地地址。");
  if (!model) throw new Error("模型名称不能为空。");

  const secretsCandidate = String(input?.secrets_file || persisted.secretsFile || "").trim();
  if (!secretsCandidate) throw new Error("找不到 Provider 配置文件位置。");
  const secretsFile = path.resolve(secretsCandidate);
  const loaded = await loadDesktopProviderEnv({ mode: "real", explicitPath: secretsFile, env, platform, projectRoot });
  const existingKey = keyFromValues(loaded.values, providerId);
  const providedKey = normalizeApiKey(input?.api_key);
  const apiKey = providedKey || existingKey;
  if (mode === "real" && !apiKey) throw new Error("开启真实 Provider 前需要填写 API Key。");

  await mkdir(path.dirname(secretsFile), { recursive: true });
  await writeFile(secretsFile, providerEnvSource({ mode, providerId, endpoint, model, maxRequests, apiKey }), { encoding: "utf8", mode: 0o600 });
  if (platform !== "win32") await chmod(secretsFile, 0o600);

  const settingsFile = persisted.settingsFile;
  if (!settingsFile) throw new Error("找不到桌面设置文件位置。");
  await mkdir(path.dirname(settingsFile), { recursive: true });
  await writeFile(settingsFile, `${JSON.stringify({ provider_mode: mode, secrets_file: secretsFile }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  if (platform !== "win32") await chmod(settingsFile, 0o600);

  return {
    mode,
    provider_id: providerId,
    endpoint,
    model,
    max_total_requests: maxRequests,
    api_key_configured: Boolean(apiKey),
    secrets_file: secretsFile,
    settings_file: settingsFile,
    restart_required: true,
  };
}

export async function clearProviderKey({ env = process.env, platform = process.platform, projectRoot } = {}) {
  const persisted = readPersistedDesktopSettings({ env, platform });
  const secretsCandidate = String(persisted.secretsFile || "").trim();
  if (!secretsCandidate) throw new Error("找不到 Provider 配置文件位置。");
  const secretsFile = path.resolve(secretsCandidate);
  const loaded = await loadDesktopProviderEnv({ mode: "real", explicitPath: secretsFile, env, platform, projectRoot });
  const providerId = normalizeProviderId(loaded.values.VISION_MULTIMODAL_PROVIDER_ID) || DEFAULT_PROVIDER_ID;
  const endpoint = normalizeEndpoint(loaded.values.VISION_MULTIMODAL_ENDPOINT) || DEFAULT_ENDPOINT;
  const model = normalizeModel(loaded.values.VISION_MULTIMODAL_MODEL) || DEFAULT_MODEL;
  const maxRequests = normalizeMaxRequests(loaded.values.VISION_MULTIMODAL_MAX_TOTAL_REQUESTS);
  await mkdir(path.dirname(secretsFile), { recursive: true });
  await writeFile(secretsFile, providerEnvSource({ mode: persisted.mode, providerId, endpoint, model, maxRequests, apiKey: "" }), { encoding: "utf8", mode: 0o600 });
  if (platform !== "win32") await chmod(secretsFile, 0o600);
  return readProviderSettingsMeta({ env, platform, projectRoot });
}

export function validateProviderSettingsInput(input) {
  return {
    mode: resolveDesktopProviderMode(input?.mode),
    provider_id: normalizeProviderId(input?.provider_id),
    endpoint: normalizeEndpoint(input?.endpoint),
    model: normalizeModel(input?.model),
    max_total_requests: normalizeMaxRequests(input?.max_total_requests),
    api_key_supplied: typeof input?.api_key === "string" && Boolean(input.api_key.trim()),
  };
}
