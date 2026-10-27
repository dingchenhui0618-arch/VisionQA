import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { REVIEW_EXPORT_FORMATS, serializeReview, toSarif } from "../export.mjs";

const desktopRoot = new URL("../", import.meta.url);

test("export formats are deterministic and redact provider secrets", () => {
  const review = {
    contract: "visual-review-v0.2",
    decision: "NOT_ASSESSABLE",
    summary: "fixture only",
    provider: { apiKey: "do-not-export", model: "mock" },
    issues: [{ id: "missing-context", severity: "blocker", message: "No candidate image" }],
  };
  assert.deepEqual(REVIEW_EXPORT_FORMATS, ["json", "markdown", "sarif"]);
  for (const format of REVIEW_EXPORT_FORMATS) {
    const output = serializeReview(review, format);
    assert.equal(typeof output, "string");
    assert.doesNotMatch(output, /do-not-export/);
  }
  const sarif = JSON.parse(serializeReview(review, "sarif"));
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].results[0].ruleId, "missing-context");
  assert.deepEqual(toSarif(review), sarif);
});

test("main and preload preserve the Electron security boundary", async () => {
  const main = await readFile(new URL("main.mjs", desktopRoot), "utf8");
  const preload = await readFile(new URL("preload.cjs", desktopRoot), "utf8");
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /width:\s*440/);
  assert.match(main, /height:\s*700/);
  assert.match(main, /minWidth:\s*380/);
  assert.match(main, /minHeight:\s*560/);
  assert.doesNotMatch(main, /frame:\s*false/);
  assert.match(main, /VISIONQA_DESKTOP_PROVIDER_MODE/);
  assert.match(main, /forwardedEnv/);
  assert.doesNotMatch(main, /env:\s*\{\s*\.\.\.process\.env/);
  assert.match(main, /VISIONQA_AGENT_MOCK/);
  assert.match(main, /provider_calls:\s*desktopProviderMode\s*===\s*"real"/);
  assert.match(main, /localServerProviderMode/);
  assert.match(main, /assertLocalServerMode/);
  assert.match(main, /formatStartupError/);
  assert.match(main, /VISIONQA_DESKTOP_PORT/);
  assert.match(main, /selectLocalEndpoint/);
  assert.match(main, /localhost:6301/);
  assert.match(main, /ComSpec|COMSPEC/);
  assert.match(main, /\/d.*\/s.*\/c/);
  assert.match(main, /isLocalUrl\(url\)/);
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
  assert.doesNotMatch(preload, /readFile|writeFile|exec|spawn|shell/);
  assert.match(preload, /visionqa:export-review/);
  assert.match(preload, /provider-settings:get/);
  assert.match(preload, /provider-settings:check/);
  assert.match(preload, /provider-settings:save/);
  assert.match(preload, /provider-settings:clear/);
  assert.match(preload, /provider-settings:restart/);
  assert.doesNotMatch(preload, /apiKey|api_key|DEEPSEEK_API_KEY|DASHSCOPE_API_KEY/);
  assert.match(main, /provider-settings\.mjs/);
  assert.match(main, /readProviderSettingsMeta/);
  assert.match(main, /saveProviderSettings/);
});
