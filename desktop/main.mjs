import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultExportFileName, normalizeReview, REVIEW_EXPORT_FORMATS, serializeReview } from "./export.mjs";
import { clearProviderKey, readPersistedDesktopSettings, readProviderSettingsMeta, saveProviderSettings } from "./provider-settings.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const repoWebRoot = path.join(repoRoot, "web");
const packagedWebRoot = path.join(process.resourcesPath || "", "web");
const webRoot = existsSync(path.join(repoWebRoot, "package.json")) ? repoWebRoot : packagedWebRoot;

function resolveAppIcon() {
  const candidates = [
    path.join(process.resourcesPath || "", "web", "public", "brand", "visionqa-app-icon.png"),
    path.join(process.resourcesPath || "", "web", "public", "brand", "visionqa-icon-64.png"),
    path.join(webRoot, "public", "brand", "visionqa-app-icon.png"),
    path.join(webRoot, "public", "brand", "visionqa-icon-64.png"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

const configuredLocalUrl = process.env.VISIONQA_DESKTOP_WEB_URL || "http://localhost:6300";
const configuredLocalUrlIsExplicit = Boolean(process.env.VISIONQA_DESKTOP_WEB_URL);

function parseLocalUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    throw new Error("VISIONQA_DESKTOP_WEB_URL must be an http localhost URL");
  }
  return parsed;
}

let parsedLocalUrl = parseLocalUrl(configuredLocalUrl);
let localUrl = parsedLocalUrl.toString().replace(/\/$/, "");
let localOrigin = parsedLocalUrl.origin;
const persistedDesktopSettings = readPersistedDesktopSettings();
const requestedProviderMode = process.env.VISIONQA_DESKTOP_PROVIDER_MODE
  || (process.env.VISIONQA_DESKTOP_PROVIDER_ENABLED === "true" ? "real" : persistedDesktopSettings.mode);
const desktopProviderMode = String(requestedProviderMode).trim().toLowerCase() === "real" ? "real" : "off";
const desktopSecretsFile = process.env.VISIONQA_DESKTOP_SECRETS_FILE?.trim() || persistedDesktopSettings.secretsFile || "";
const ownedServer = { child: null, server: null, started: false };

// Do not pass the parent process environment wholesale to the local web
// server. Provider keys are intentionally absent here; the server-side launch
// script loads them from an external secrets file only when mode=real.
const forwardedEnvNames = [
  "PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP",
  "USERPROFILE", "APPDATA", "LOCALAPPDATA", "HOME", "HOMEDRIVE", "HOMEPATH",
  "COMSPEC", "NODE_ENV", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE",
];
const forwardedEnv = Object.fromEntries(forwardedEnvNames.flatMap((name) => process.env[name] === undefined ? [] : [[name, process.env[name]] ]));

function isLocalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && url.origin === localOrigin;
  } catch {
    return false;
  }
}

async function localServerReady() {
  try {
    const response = await fetch(`${localUrl}/api/health`, { signal: AbortSignal.timeout(800) });
    return response.ok || response.status < 500;
  } catch {
    try {
      const response = await fetch(localUrl, { signal: AbortSignal.timeout(800) });
      return response.ok || response.status < 500;
    } catch {
      return false;
    }
  }
}

async function probeLocalServerAt(url) {
  for (const pathName of ["/api/visual-review", "/api/health"]) {
    try {
      const response = await fetch(`${url}${pathName}`, { signal: AbortSignal.timeout(650) });
      let payload = null;
      if (pathName === "/api/visual-review" && response.ok) {
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
      }
      return {
        reachable: true,
        managed: Boolean(payload?.desktop_runtime && typeof payload.desktop_runtime === "object"),
        providerMode: payload?.desktop_runtime?.provider_mode ?? null,
      };
    } catch {
      // Try the lightweight health route before treating the port as free.
    }
  }
  return { reachable: false, managed: false, providerMode: null };
}

function switchLocalEndpoint(urlValue) {
  parsedLocalUrl = parseLocalUrl(urlValue);
  localUrl = parsedLocalUrl.toString().replace(/\/$/, "");
  localOrigin = parsedLocalUrl.origin;
}

async function selectLocalEndpoint() {
  // An explicit URL is an intentional caller choice; never override it.
  if (configuredLocalUrlIsExplicit || parsedLocalUrl.port !== "6300") return;

  const primaryProbe = await probeLocalServerAt(localUrl);
  if (!primaryProbe.reachable || (primaryProbe.managed && primaryProbe.providerMode === desktopProviderMode)) return;

  const fallbackUrl = "http://localhost:6301";
  const fallbackProbe = await probeLocalServerAt(fallbackUrl);
  if (fallbackProbe.reachable) {
    if (fallbackProbe.managed && fallbackProbe.providerMode === desktopProviderMode) {
      switchLocalEndpoint(fallbackUrl);
      console.info(`[desktop] reusing compatible local server at ${localUrl}`);
      return;
    }
    throw new Error("VisionQA ports 6300 and 6301 are already occupied by unavailable or incompatible services.");
  }

  switchLocalEndpoint(fallbackUrl);
  console.info("[desktop] localhost:6300 is occupied; using fallback port 6301.");
}

async function localServerProviderMode() {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${localUrl}/api/visual-review`, { signal: AbortSignal.timeout(1200) });
      if (response.ok) {
        const payload = await response.json();
        const mode = payload?.desktop_runtime?.provider_mode;
        if (mode === "off" || mode === "real") return mode;
      }
    } catch {
      // The first request may trigger a cold Vite/RSC compile. Retry within the
      // bounded startup window instead of treating that transient delay as an
      // unmanaged server.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return null;
}

async function assertLocalServerMode() {
  const mode = await localServerProviderMode();
  if (mode !== desktopProviderMode) {
    throw new Error(`VisionQA local server mode mismatch at ${localUrl}: expected ${desktopProviderMode}, received ${mode ?? "unmanaged"}. Stop the existing server or restart it with the desktop Provider mode.`);
  }
}

function formatStartupError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("local server mode mismatch")) return message;
  return `${message}\n\n恢复方式：\n1. 关闭占用 ${localUrl} 的旧 VisionQA 服务；\n2. 重新启动桌面包，让它自己管理本地服务；\n3. 如果需要保留旧网页预览，请从独立的 portable bundle 目录启动桌面端，并设置 VISIONQA_DESKTOP_WEB_URL=http://localhost:6301；同一个 web 目录的 vinext 进程仍需先停止。\n\n桌面端不会强行终止未知服务，也不会把未确认的网页服务当作桌面运行时。`;
}

async function waitForLocalServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await localServerReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`VisionQA local server did not become ready at ${localUrl}`);
}

async function startLocalServer() {
  if (app.isPackaged) {
    const serverEntry = path.join(webRoot, "dist", "server", "index.js");
    if (!existsSync(serverEntry)) throw new Error(`built VisionQA server not found: ${serverEntry}`);
    // The production route reads these markers at module import time. Keep
    // them explicit and non-secret in packaged mode, just like the developer
    // child process below; API keys still come only from the external secrets
    // file when the desktop Provider mode is explicitly real.
    process.env.VISIONQA_AGENT_LOCAL = "true";
    process.env.VISIONQA_AGENT_MOCK = desktopProviderMode === "off" ? "true" : "false";
    process.env.VISIONQA_DESKTOP_MODE = desktopProviderMode;
    process.env.VISIONQA_DESKTOP_PROVIDER_MODE = desktopProviderMode;
    process.env.VISIONQA_DESKTOP_SECRETS_FILE = desktopSecretsFile;
    process.env.VISIONQA_DESKTOP_PORT = parsedLocalUrl.port || "6300";
    process.env.VISION_MULTIMODAL_ENABLED = desktopProviderMode === "real" ? "true" : "false";
    process.env.VISION_LOCAL_CANARY_ALLOW_LOCALHOST = desktopProviderMode === "real" ? "true" : "false";
    const { startBuiltVisionqaServer } = await import("./built-server.mjs");
    ownedServer.server = await startBuiltVisionqaServer({
      serverEntry,
      clientRoot: path.join(webRoot, "dist", "client"),
      host: "127.0.0.1",
      port: Number(parsedLocalUrl.port || 6300),
    });
    ownedServer.started = true;
    return;
  }
  if (!existsSync(path.join(webRoot, "package.json"))) throw new Error(`web package not found: ${webRoot}`);
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const command = process.platform === "win32" ? (process.env.ComSpec || process.env.COMSPEC || "cmd.exe") : npm;
  const args = process.platform === "win32" ? ["/d", "/s", "/c", `${npm} run dev:local`] : ["run", "dev:local"];
  const child = spawn(command, args, {
    cwd: webRoot,
    env: {
      ...forwardedEnv,
      VISIONQA_AGENT_LOCAL: "true",
      VISIONQA_AGENT_MOCK: desktopProviderMode === "off" ? "true" : "false",
      VISIONQA_DESKTOP_MODE: desktopProviderMode,
      VISIONQA_DESKTOP_PROVIDER_MODE: desktopProviderMode,
      VISIONQA_DESKTOP_SECRETS_FILE: desktopSecretsFile,
      VISIONQA_DESKTOP_PORT: parsedLocalUrl.port || "6300",
      VISION_MULTIMODAL_ENABLED: desktopProviderMode === "real" ? "true" : "false",
      VISION_LOCAL_CANARY_ALLOW_LOCALHOST: desktopProviderMode === "real" ? "true" : "false",
    },
    stdio: "inherit",
    windowsHide: true,
  });
  ownedServer.child = child;
  ownedServer.started = true;
  child.once("error", (error) => console.error(`[desktop] local server error: ${error.message}`));
  child.once("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM") console.error(`[desktop] local server exited (${code ?? "unknown"}, ${signal ?? "no signal"})`);
  });
}

function stopLocalServer() {
  if (ownedServer.server) {
    ownedServer.server.close();
    ownedServer.server = null;
  }
  if (ownedServer.child && !ownedServer.child.killed) ownedServer.child.kill("SIGTERM");
  ownedServer.child = null;
}

async function handleExportReview(_event, request) {
  if (!request || typeof request !== "object" || !REVIEW_EXPORT_FORMATS.includes(request.format)) {
    throw new Error("export format must be json, markdown, or sarif");
  }
  const review = normalizeReview(request.review);
  const format = request.format;
  const defaultPath = path.join(app.getPath("downloads"), defaultExportFileName(format));
  const result = await dialog.showSaveDialog({
    title: "导出 VisionQA 评审",
    defaultPath,
    filters: [{ name: format.toUpperCase(), extensions: [format === "markdown" ? "md" : "json"] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const outputPath = path.resolve(result.filePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializeReview(review, format), "utf8");
  return { canceled: false, path: outputPath, format };
}

async function inspectProviderSettings() {
  const settings = await readProviderSettingsMeta({ projectRoot: repoRoot });
  let server = { reachable: false, mode: null, available: false, missing: [] };
  try {
    const response = await fetch(`${localUrl}/api/visual-review`, { signal: AbortSignal.timeout(1200) });
    if (response.ok) {
      const payload = await response.json();
      const provider = payload?.providers?.user_multimodal;
      server = {
        reachable: true,
        mode: payload?.desktop_runtime?.provider_mode ?? null,
        available: provider?.available === true,
        missing: Array.isArray(provider?.missing_configuration) ? provider.missing_configuration : [],
      };
    }
  } catch {
    // A saved config can be inspected even before the local server is running.
  }
  return { ...settings, server };
}

function registerIpc() {
  ipcMain.handle("visionqa:runtime-status", () => ({
    mode: "desktop-alpha",
    local_url: localUrl,
    provider_mode: desktopProviderMode,
    mock: desktopProviderMode === "off",
    provider_calls: desktopProviderMode === "real",
    provider_config_source: desktopProviderMode === "real" ? (desktopSecretsFile ? "external_file" : "default_external_file") : "disabled",
    local_server_owned: ownedServer.started,
  }));
  ipcMain.handle("visionqa:capabilities", () => ({
    screenshot: true,
    dom_evidence: true,
    revision: true,
    visual_review_v02: true,
    code_review_v01: true,
    linked_review: true,
    export_formats: [...REVIEW_EXPORT_FORMATS],
    source_write: false,
    provider_mode: desktopProviderMode,
    provider_calls: desktopProviderMode === "real",
  }));
  ipcMain.handle("visionqa:provider-settings:get", async () => readProviderSettingsMeta({ projectRoot: repoRoot }));
  ipcMain.handle("visionqa:provider-settings:check", inspectProviderSettings);
  ipcMain.handle("visionqa:provider-settings:save", async (_event, input) => saveProviderSettings({ input, projectRoot: repoRoot }));
  ipcMain.handle("visionqa:provider-settings:clear", async () => clearProviderKey({ projectRoot: repoRoot }));
  ipcMain.handle("visionqa:provider-settings:restart", () => {
    app.relaunch();
    app.exit(0);
    return { accepted: true };
  });
  ipcMain.handle("visionqa:export-review", handleExportReview);
}

async function createWindow() {
  const appIcon = resolveAppIcon();
  const window = new BrowserWindow({
    width: 440,
    height: 700,
    minWidth: 380,
    minHeight: 560,
    title: "VisionQA 视觉判断插件",
    backgroundColor: "#101011",
    autoHideMenuBar: true,
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => ({ action: isLocalUrl(url) ? "allow" : "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isLocalUrl(url)) event.preventDefault();
  });
  await window.loadURL(`${localUrl}/plugin`);
  return window;
}

if (!process.versions.electron) {
  console.error("VisionQA Desktop Alpha requires the Electron runtime. Install Electron in the desktop development environment, then run: npm run desktop:dev");
  process.exitCode = 78;
} else {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on("second-instance", () => BrowserWindow.getAllWindows()[0]?.focus());
    app.whenReady().then(async () => {
      registerIpc();
      await selectLocalEndpoint();
      if (!(await localServerReady())) {
        await startLocalServer();
        await waitForLocalServer();
      }
      await assertLocalServerMode();
      await createWindow();
    }).catch((error) => {
      const message = formatStartupError(error);
      console.error(`[desktop] startup failed: ${message}`);
      dialog.showErrorBox("VisionQA 无法启动", message);
      app.quit();
    });
    app.on("before-quit", stopLocalServer);
    app.on("window-all-closed", () => {
      stopLocalServer();
      if (process.platform !== "darwin") app.quit();
    });
  }
}
