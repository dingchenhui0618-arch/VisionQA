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
