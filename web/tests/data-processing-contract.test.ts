import assert from "node:assert/strict";
import test from "node:test";

import {
  assertQwenDataProcessingContract,
  QWEN_DATA_PROCESSING_CONTRACT,
} from "../lib/visionqa/providers/data-processing-contract.ts";
import { VisionProviderError } from "../lib/visionqa/providers/types.ts";

const approved = {
  VISION_STORE_FALSE_CONFIRMED: "true",
  VISION_ZDR_CONFIRMED: "true",
  VISION_DELETE_SLA_CONFIRMED: "true",
  VISION_HUMAN_FINAL_REVIEW_REQUIRED: "true",
};

test("Qwen data-processing contract is explicit and auditable", () => {
  assert.deepEqual(assertQwenDataProcessingContract(approved), {
    store: "false",
    training: "disabled",
    retention: "short_lived_private_url",
    deletionSla: "required",
    humanFinalReview: "required",
  });
});

test("missing Qwen data-processing evidence fails before network", () => {
  for (const name of Object.keys(approved)) {
    assert.throws(
      () =>
        assertQwenDataProcessingContract({
          ...approved,
          [name]: undefined,
        }),
      (error: unknown) =>
        error instanceof VisionProviderError &&
        error.code === "CONFIGURATION" &&
        error.message.includes("data-processing evidence"),
    );
  }
  assert.equal(QWEN_DATA_PROCESSING_CONTRACT.store, "false");
});
