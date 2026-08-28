import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBoundaryAwareRepairPrompt,
  inferRepairBoundary,
  resolveRepairBoundaryCategory,
  SYNTHETIC_REPAIR_CASES,
} from "../lib/visionqa/repair-boundary.ts";
import { readFile } from "node:fs/promises";

test("routes one localized garment defect to bounded local repair", () => {
  const boundary = inferRepairBoundary("商品结构", "前襟多出第五颗纽扣，只移除多余纽扣");
  assert.equal(boundary.strategy, "LOCAL_REPAIR");
  assert.match(boundary.allowedRegion, /单一商品结构/);
  assert.match(buildBoundaryAwareRepairPrompt(boundary), /允许修改范围/);
  assert.equal(boundary.modelAutonomy, "SUGGEST_ONLY");
});

test("routes severe anatomy and multi-structure conflicts to regenerate", () => {
  assert.equal(
    inferRepairBoundary("人物／穿着逻辑", "人物右侧出现额外手臂").strategy,
    "REGENERATE",
  );
  assert.equal(
    inferRepairBoundary("商品结构", "领口、口袋以及拉链多个结构同时错误").strategy,
    "REGENERATE",
  );
});

test("fails closed when product truth is not observable", () => {
  const boundary = inferRepairBoundary("商品结构", "关键口袋被遮挡，看不清且没有参考");
  assert.equal(boundary.strategy, "BLOCKED");
  assert.equal(buildBoundaryAwareRepairPrompt(boundary), "");
});

test("keeps brand marks on deterministic asset composition", () => {
  const boundary = inferRepairBoundary("Logo／字标", "左胸字标错位");
  assert.equal(boundary.strategy, "DETERMINISTIC_COMPOSITE");
  assert.match(buildBoundaryAwareRepairPrompt(boundary), /不要生成或猜写/);
});

test("maps AI diagnosis skill names into customer-facing boundary categories", () => {
  assert.equal(
    resolveRepairBoundaryCategory("真人真实性", "右手出现六指"),
    "人物／穿着逻辑",
  );
  assert.equal(
    resolveRepairBoundaryCategory("材质真实性", "袖子罗纹断裂"),
    "颜色／材质／纹理",
  );
  assert.equal(
    resolveRepairBoundaryCategory("摄影真实性", "背景出现杂物"),
    "背景／构图",
  );
});

test("free text cannot downgrade frozen L3 synthetic cases", () => {
  const synonyms = [
    ["SC-003", "人物／穿着逻辑", "右侧多出一只手"],
    ["SC-005", "商品结构", "圆领改成V领，新增口袋和拉链"],
    ["SC-005", "商品结构", "V领口袋拉链错误"],
  ] as const;
  for (const [caseId, category, issue] of synonyms) {
    const boundary = inferRepairBoundary(category, issue, { caseId });
    assert.equal(boundary.strategy, "REGENERATE");
    assert.equal(buildBoundaryAwareRepairPrompt(boundary), "");
  }
});

test("frozen local cases keep their intended strategy", () => {
  assert.equal(
    inferRepairBoundary("商品结构", "前襟按钮数量不对", { caseId: "SC-001" }).strategy,
    "LOCAL_REPAIR",
  );
  assert.equal(
    inferRepairBoundary("人物／穿着逻辑", "左手和袖口粘在一起", { caseId: "SC-002" }).strategy,
    "LOCAL_REPAIR_OR_REGENERATE",
  );
  assert.equal(
    inferRepairBoundary("颜色／材质／纹理", "袖子表面糊掉", { caseId: "SC-004" }).strategy,
    "LOCAL_REPAIR",
  );
});

test("runtime synthetic case metadata matches the frozen manifest", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../../data/synthetic_repair_case_library_v0.1/case-manifest-v0.1.json", import.meta.url),
      "utf8",
    ),
  ) as { cases: Array<{ id: string; file: string; sha256: string; level: string; category: string; strategy: string }> };
  assert.deepEqual(
    SYNTHETIC_REPAIR_CASES.map(({ id, file, sha256, level, category, strategy }) => ({ id, file, sha256, level, category, strategy })),
    manifest.cases.map(({ id, file, sha256, level, category, strategy }) => ({ id, file, sha256, level, category, strategy })),
  );
});
