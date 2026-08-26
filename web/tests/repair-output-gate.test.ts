import assert from "node:assert/strict";
import test from "node:test";
import { assessRepairOutputMetrics } from "../lib/visionqa/repair-output-gate.ts";

test("repair output gate allows a localized edit to continue to human review", () => {
  const result = assessRepairOutputMetrics({
    sourceWidth: 1024,
    sourceHeight: 1536,
    outputWidth: 1024,
    outputHeight: 1536,
    aspectRatioDrift: 0,
    meanPixelDifference: 0.06,
    changedCellRatio: 0.12,
  });
  assert.equal(result.decision, "ALLOW_HUMAN_REVIEW");
  assert.deepEqual(result.failureCodes, []);
});

test("repair output gate blocks a product close-up that replaces the model composition", () => {
  const result = assessRepairOutputMetrics({
    sourceWidth: 1024,
    sourceHeight: 1536,
    outputWidth: 1024,
    outputHeight: 1024,
    aspectRatioDrift: 0.5,
    meanPixelDifference: 0.31,
    changedCellRatio: 0.73,
  });
  assert.equal(result.decision, "BLOCK_MAJOR_DRIFT");
  assert.deepEqual(result.failureCodes, [
    "OUTPUT_ASPECT_RATIO_DRIFT",
    "OUTPUT_COMPOSITION_DRIFT",
  ]);
});
