import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { clearProviderKey, readProviderSettingsMeta, saveProviderSettings } from "../provider-settings.mjs";

test("provider settings save outside the project never returns the API key", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "visionqa-desktop-settings-"));
  const secretsFile = path.join(root, "secrets", "provider.env");
  const settingsFile = path.join(root, "settings.json");
  const env = { APPDATA: root, USERPROFILE: root, VISIONQA_DESKTOP_SETTINGS_FILE: settingsFile };
  try {
    const saved = await saveProviderSettings({
      env,
      platform: "win32",
      projectRoot: path.join(root, "project"),
      input: {
        mode: "real",
        provider_id: "deepseek",
        endpoint: "https://api.deepseek.com/chat/completions",
        model: "deepseek-flash",
        max_total_requests: "3",
        api_key: "secret-key-for-test",
        secrets_file: secretsFile,
      },
    });
    assert.equal(saved.api_key_configured, true);
    assert.equal(saved.restart_required, true);
    assert.equal("api_key" in saved, false);
    const source = await readFile(secretsFile, "utf8");
    assert.match(source, /DEEPSEEK_API_KEY/);
    assert.match(source, /secret-key-for-test/);
    const meta = await readProviderSettingsMeta({ env, platform: "win32", projectRoot: path.join(root, "project") });
    assert.equal(meta.mode, "real");
    assert.equal(meta.api_key_configured, true);
    assert.equal("api_key" in meta, false);
    const cleared = await clearProviderKey({ env, platform: "win32", projectRoot: path.join(root, "project") });
    assert.equal(cleared.api_key_configured, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("provider settings reject API keys containing line breaks", async () => {
  await assert.rejects(
    () => saveProviderSettings({
      env: { APPDATA: "C:\\Users\\tester\\AppData\\Roaming", USERPROFILE: "C:\\Users\\tester" },
      platform: "win32",
      input: {
        mode: "real",
        provider_id: "deepseek",
        endpoint: "https://api.deepseek.com/chat/completions",
        model: "deepseek-flash",
        api_key: "bad\nkey",
        secrets_file: "C:\\Users\\tester\\AppData\\Roaming\\VisionQA\\secrets\\provider.env",
      },
    }),
    /API Key/,
  );
});
