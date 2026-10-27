import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const popup = fs.readFileSync(path.join(root, "host", "chrome", "popup.js"), "utf8");
const popupHtml = fs.readFileSync(path.join(root, "host", "chrome", "popup.html"), "utf8");
const readme = fs.readFileSync(path.join(root, "host", "chrome", "README.md"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "host", "chrome", "manifest.json"), "utf8"));

test("Chrome Host delegates Provider choice to the local server and never hardcodes Mock", () => {
  assert.match(popup, /body: JSON\.stringify\(\{ provider: "auto", capture \}\)/);
  assert.doesNotMatch(popup, /body: JSON\.stringify\(\{ provider: "mock", capture \}\)/);
  assert.match(popup, /当前没有开启可用的视觉模型/);
  assert.match(popup, /local Qwen|local canary/);
  assert.match(popupHtml, /没有可用的视觉能力时不会生成假结论/);
  assert.match(popupHtml, /查看本机设置说明/);
  assert.match(popup, /查看本机设置说明/);
  assert.match(popup, /plugin\?tab=settings/);
  assert.match(popup, /本次检查没有完成。请稍后再试/);
  assert.match(popup, /重新评审当前页面/);
  assert.match(popup, /data-action/);
});

test("Chrome Host documentation keeps real and preview boundaries explicit", () => {
  assert.match(readme, /服务端 `auto`/);
  assert.match(readme, /fail-closed|失败关闭/i);
  assert.match(readme, /没有任何模型密钥/);
});

test("Chrome Host first layer stays readable without DOM or revision jargon", () => {
  assert.match(popupHtml, /当前网页的截图和页面内容/);
  assert.doesNotMatch(popupHtml, /DOM 摘要|对话上下文/);
  assert.doesNotMatch(popup, /revision 未变化|revision 已变化|页面结构摘要|样式摘要/);
  assert.match(popup, /查看检查依据/);
});

test("Chrome Host issue cards show the observation before the next step", () => {
  assert.match(popup, /issue\.summary/);
  assert.match(popup, /class="summary"/);
  assert.match(popup, /class="next-step"/);
});

test("Chrome action opens the persistent side panel instead of a one-shot popup", () => {
  assert.equal(manifest.side_panel.default_path, "popup.html");
  assert.equal(manifest.action.default_title, "在侧边栏中评审当前页面");
  assert.equal(Object.hasOwn(manifest.action, "default_popup"), false);
  assert.match(fs.readFileSync(path.join(root, "host", "chrome", "service-worker.js"), "utf8"), /openPanelOnActionClick: true/);
});
