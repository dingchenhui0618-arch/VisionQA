import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/agent/repair-panel.tsx", import.meta.url), "utf8");

test("repair panel keeps a review-free recheck download separate from the human gate", () => {
  assert.match(source, /下载待复验稿/);
  assert.match(source, /download\(false, "待复验稿"\)/);
  assert.match(source, /download\(true, "已确认版本"\)/);
  assert.match(source, /待复验稿仅供人工复核，不代表商品已通过或可交付/);
  assert.match(source, /requireReview && !fullyReviewed/);
});

test("download validates same-origin asset response before creating a bounded blob", () => {
  assert.match(source, /url\.origin !== window\.location\.origin/);
  assert.match(source, /url\.pathname\.startsWith\("\/api\/assets\/"\)/);
  assert.match(source, /!response\.ok/);
  assert.match(source, /mime === "image\/png"/);
  assert.match(source, /versions\.findIndex\(entry => entry\.id === version\.id\) \+ 1/);
  assert.doesNotMatch(source, /version\.number/);
  assert.match(source, /20 \* 1024 \* 1024/);
  assert.match(source, /URL\.revokeObjectURL\(blobUrl\)/);
});
