import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DESKTOP_BUNDLE_SCOPE, shouldIncludeDesktopBundlePath } from "../scripts/desktop-bundle-filter.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

test("portable bundle script refuses non-generated paths and excludes secrets", async () => {
  const source = await readFile(new URL("../scripts/create-portable.mjs", import.meta.url), "utf8");
  assert.match(source, /must stay under/);
  assert.match(source, /\.env files/);
  assert.match(source, /dependencies_bundled: false/);
  assert.match(source, /provider_calls: false/);
  assert.match(source, /desktop-provider-config\.mjs/);
  assert.match(source, /desktop\/provider-settings\.mjs/);
  assert.match(source, /desktop-bundle-filter\.mjs/);
  assert.match(source, /web\/.openai\/hosting\.json/);
  assert.match(source, /web\/build\/sites-vite-plugin\.ts/);
});

test("slim desktop bundle keeps the plugin runtime and excludes legacy/sample payloads", () => {
  const keep = (relativePath) => shouldIncludeDesktopBundlePath(path.join(repoRoot, relativePath), repoRoot);
  assert.equal(keep("web/app/plugin/plugin-workspace.tsx"), true);
  assert.equal(keep("web/app/api/visual-review/route.ts"), true);
  assert.equal(keep("web/app/api/health/route.ts"), true);
  assert.equal(keep("web/lib/visionqa/plugin-runtime.ts"), true);
  assert.equal(keep("web/.openai/hosting.json"), true);
  assert.equal(keep("web/build/sites-vite-plugin.ts"), true);
  assert.equal(keep("web/app/agent/page.tsx"), false);
  assert.equal(keep("web/app/login/page.tsx"), false);
  assert.equal(keep("web/lib/agent/service.ts"), false);
  assert.equal(keep("web/public/fashion/demo-cardigan-truth.png"), false);
  assert.equal(keep("web/.env.local"), false);
  assert.deepEqual(DESKTOP_BUNDLE_SCOPE.included.slice(0, 2), ["desktop runtime", "plugin route"]);
});

test("electron-builder configuration is secret-safe for Windows and macOS Alpha", async () => {
  const config = await readFile(new URL("../electron-builder.yml", import.meta.url), "utf8");
  assert.match(config, /target: portable/);
  assert.match(config, /mac:/);
  assert.match(config, /target: zip/);
  assert.match(config, /arm64/);
  assert.match(config, /x64/);
  assert.match(config, /hardenedRuntime: false/);
  assert.match(config, /identity: null/);
  assert.match(config, /asar: true/);
  assert.match(config, /from: \.\.\/web/);
  assert.match(config, /scripts\/desktop-provider-config\.mjs/);
  assert.match(config, /node_modules/);
  assert.match(config, /!\*\*\/\.env\*/);
  assert.match(config, /!\*\*\/secrets\//);
  assert.doesNotMatch(config, /publish:/);
});

test("desktop packaging has a standalone Electron entrypoint", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const webPackageJson = JSON.parse(await readFile(new URL("../../web/package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.main, "main.mjs");
  assert.equal(packageJson.devDependencies.electron, "38.2.0");
  assert.match(webPackageJson.scripts["desktop:builder:mac"], /electron-builder .*--mac zip/);
  assert.equal(webPackageJson.scripts["desktop:mac:bundle"], "node ../desktop/scripts/create-mac-bundle.mjs");
});

test("macOS developer bundle is explicit about its unverified installer boundary", async () => {
  const source = await readFile(new URL("../scripts/create-mac-bundle.mjs", import.meta.url), "utf8");
  assert.match(source, /visionqa-desktop-alpha-macos-bundle/);
  assert.match(source, /platform: "darwin"/);
  assert.match(source, /architectures: \["x64", "arm64"\]/);
  assert.match(source, /dependencies_bundled: false/);
  assert.match(source, /installer_verified: false/);
  assert.match(source, /\.env files/);
  assert.match(source, /npm run desktop:builder:mac/);
  assert.match(source, /desktop\/provider-settings\.mjs/);
  assert.match(source, /desktop-bundle-filter\.mjs/);
  assert.match(source, /web\/.openai\/hosting\.json/);
  assert.match(source, /web\/build\/sites-vite-plugin\.ts/);
});
