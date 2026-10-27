import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "..", "app", "plugin", "plugin-workspace.tsx"), "utf8");

test("plugin review copy distinguishes empty and ready evidence states", () => {
  assert.match(source, /先放入一张要检查的图片/);
  assert.match(source, /这张图片已经准备好/);
  assert.match(source, /证据已准备好，可以开始检查/);
});

test("browser preview keeps local Provider settings read-only", () => {
  assert.match(source, /设置只在桌面应用中生效/);
  assert.match(source, /当前是浏览器预览，不能保存或检查本机模型/);
  assert.match(source, /浏览器预览只用于检查图片/);
  assert.match(source, /返回检查/);
  assert.match(source, /!desktopAvailable \? <div className="plugin-settings-boundary"/);
});

test("result state keeps one explicit recheck action and truthful preview status", () => {
  assert.match(source, /onClick=\{\(\) => \{ void runReview\(\); \}\}>用当前作品再次检查/);
  assert.match(source, /plugin-composer\$\{uiResult \? " is-result-secondary"/);
  assert.match(source, /输入已确认/);
  assert.doesNotMatch(source, /这张图片超过 12 MB/);
  assert.match(source, /10 MB/);
});

test("result issues preserve the reason and business recovery language", () => {
  assert.match(source, /plugin-issue-summary/);
  assert.match(source, /issue\.summary/);
  assert.match(source, /unsupported_media/);
  assert.match(source, /quota_exhausted/);
  assert.match(source, /rate_limited/);
  assert.match(source, /policy_blocked/);
  assert.match(source, /视觉模型处理时间较长/);
  assert.match(source, /真实评审会把当前图片/);
  assert.match(source, /正在连接本机服务/);
  assert.match(source, /选择参考图|selectReferences/);
});
