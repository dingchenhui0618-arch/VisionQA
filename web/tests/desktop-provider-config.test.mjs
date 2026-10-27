import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  defaultDesktopSecretsFile,
  DESKTOP_INHERITED_ENV_NAMES,
  DESKTOP_STRIPPED_ENV_NAMES,
  loadDesktopProviderEnv,
  parseProviderEnv,
  resolveDesktopProviderMode,
} from "../scripts/desktop-provider-config.mjs";

test("desktop Provider mode is fail-closed and only real is enabled", () => {
  assert.equal(resolveDesktopProviderMode(undefined), "off");
  assert.equal(resolveDesktopProviderMode("off"), "off");
  assert.equal(resolveDesktopProviderMode("unknown"), "off");
  assert.equal(resolveDesktopProviderMode("REAL"), "real");
});

test("provider env parser keeps only allow-listed values and never expands variables", () => {
  const values = parseProviderEnv([
    "# local-only provider settings",
    "DEEPSEEK_API_KEY=secret-value",
    "VISION_MULTIMODAL_ENDPOINT=https://api.deepseek.com/chat/completions",
    "VISION_MULTIMODAL_MODEL=deepseek-v4-flash",
    "export VISION_MULTIMODAL_ENABLED=true",
    "PATH=C:\\should-not-be-forwarded",
    "OTHER_SECRET=should-not-pass",
    "VISION_MULTIMODAL_PROVIDER_ID='deepseek'",
  ].join("\n"));
  assert.deepEqual(values, {
    DEEPSEEK_API_KEY: "secret-value",
    VISION_MULTIMODAL_ENDPOINT: "https://api.deepseek.com/chat/completions",
    VISION_MULTIMODAL_MODEL: "deepseek-v4-flash",
    VISION_MULTIMODAL_ENABLED: "true",
    VISION_MULTIMODAL_PROVIDER_ID: "deepseek",
  });
  assert.equal(values.OTHER_SECRET, undefined);
  assert.equal(values.PATH, undefined);
});

test("desktop child environment strips unrelated application and database secrets", () => {
  assert.ok(DESKTOP_STRIPPED_ENV_NAMES.includes("DEEPSEEK_API_KEY"));
  assert.ok(DESKTOP_STRIPPED_ENV_NAMES.includes("VISIONQA_ORCHESTRATOR_DEEPSEEK_API_KEY"));
  assert.ok(DESKTOP_STRIPPED_ENV_NAMES.includes("DATABASE_URL"));
  assert.equal(DESKTOP_STRIPPED_ENV_NAMES.includes("PATH"), false);
});

test("desktop inherited environment is an explicit non-secret allowlist", () => {
  assert.ok(DESKTOP_INHERITED_ENV_NAMES.includes("PATH"));
  assert.ok(DESKTOP_INHERITED_ENV_NAMES.includes("VISIONQA_CHROME_EXTENSION_ID"));
  assert.equal(DESKTOP_INHERITED_ENV_NAMES.includes("DEEPSEEK_API_KEY"), false);
  assert.equal(DESKTOP_INHERITED_ENV_NAMES.includes("DATABASE_URL"), false);
});

test("desktop secrets are loaded from outside the project and missing files fail closed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "visionqa-provider-"));
  const secrets = path.join(root, "provider.env");
  try {
    const missing = await loadDesktopProviderEnv({ mode: "real", explicitPath: path.join(root, "missing.env"), projectRoot: path.join(root, "project") });
    assert.equal(missing.source, "missing");
    await assert.rejects(
      () => loadDesktopProviderEnv({ mode: "real", explicitPath: "provider.env", projectRoot: path.join(root, "project") }),
      /absolute path/,
    );
    await assert.rejects(
      () => loadDesktopProviderEnv({ mode: "real", explicitPath: path.join(root, "project", "provider.env"), projectRoot: path.join(root, "project"), platform: "win32" }),
      /outside the project/,
    );
    await writeFile(secrets, "DEEPSEEK_API_KEY=external-only\nVISION_MULTIMODAL_MODEL=deepseek-v4-flash\n", { mode: 0o600 });
    const loaded = await loadDesktopProviderEnv({ mode: "real", explicitPath: secrets, projectRoot: path.join(root, "project"), platform: "win32" });
    assert.equal(loaded.source, "external_file");
    assert.equal(loaded.values.DEEPSEEK_API_KEY, "external-only");
    const disabled = await loadDesktopProviderEnv({ mode: "off", explicitPath: secrets });
    assert.equal(disabled.source, "disabled");
    assert.deepEqual(disabled.values, {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("default secrets paths stay in the user's private app-data area", () => {
  assert.match(defaultDesktopSecretsFile({ APPDATA: "C:\\Users\\tester\\AppData\\Roaming" }, "win32"), /VisionQA[\\/]secrets[\\/]provider\.env$/);
  assert.match(defaultDesktopSecretsFile({ HOME: "/Users/tester" }, "darwin"), /Library[\\/]Application Support[\\/]VisionQA[\\/]secrets[\\/]provider\.env$/);
});
