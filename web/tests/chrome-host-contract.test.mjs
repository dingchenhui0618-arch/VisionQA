import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const popup = fs.readFileSync(path.join(root, "host", "chrome", "popup.js"), "utf8");
const popupHtml = fs.readFileSync(path.join(root, "host", "chrome", "popup.html"), "utf8");
const readme = fs.readFileSync(path.join(root, "host", "chrome", "README.md"), "utf8");

test("Chrome Host delegates Provider choice to the local server and never hardcodes Mock", () => {
  assert.match(popup, /body: JSON\.stringify\(\{ provider: "auto", capture \}\)/);
  assert.doesNotMatch(popup, /body: JSON\.stringify\(\{ provider: "mock", capture \}\)/);
  assert.match(popup, /当前没有开启可用的视觉模型/);
  assert.match(popup, /local Qwen|local canary/);
  assert.match(popupHtml, /未配置模型时不会生成假结论/);
});

test("Chrome Host documentation keeps real and preview boundaries explicit", () => {
  assert.match(readme, /服务端 `auto`/);
  assert.match(readme, /fail-closed|失败关闭/i);
  assert.match(readme, /没有任何模型密钥/);
});
