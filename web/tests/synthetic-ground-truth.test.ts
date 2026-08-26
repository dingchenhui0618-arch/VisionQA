import assert from "node:assert/strict";
import test from "node:test";

import {
  SYNTHETIC_TROUSERS_SOURCE_SHA256,
  isSyntheticTrousersGroundTruthEligible,
} from "../lib/visionqa/synthetic-ground-truth.ts";

test("受控裤装样例只有在候选 SHA、数量和真值板同时匹配时开放", () => {
  assert.equal(
    isSyntheticTrousersGroundTruthEligible({
      candidateCount: 1,
      candidateSha256: SYNTHETIC_TROUSERS_SOURCE_SHA256.toLowerCase(),
      referenceFileNames: ["product-truth-grid.png"],
    }),
    true,
  );
});

test("普通客户图或不完整样例不能载入合成真值", () => {
  assert.equal(
    isSyntheticTrousersGroundTruthEligible({
      candidateCount: 1,
      candidateSha256: "0".repeat(64),
      referenceFileNames: ["product-truth-grid.png"],
    }),
    false,
  );
  assert.equal(
    isSyntheticTrousersGroundTruthEligible({
      candidateCount: 2,
      candidateSha256: SYNTHETIC_TROUSERS_SOURCE_SHA256,
      referenceFileNames: ["product-truth-grid.png"],
    }),
    false,
  );
  assert.equal(
    isSyntheticTrousersGroundTruthEligible({
      candidateCount: 1,
      candidateSha256: SYNTHETIC_TROUSERS_SOURCE_SHA256,
      referenceFileNames: [],
    }),
    false,
  );
});
