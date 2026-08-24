import assert from "node:assert/strict";
import test from "node:test";
import {
  calculate4kDeliveryDimensions,
  createUpscaleFileName,
  createUpscaleJobReceipt,
  LOCAL_UPSCALE_CAPABILITY,
} from "../lib/visionqa/upscale.ts";

test("maps landscape 720p to UHD 4K without changing aspect ratio", () => {
  assert.deepEqual(calculate4kDeliveryDimensions(1280, 720), {
    sourceWidth: 1280,
    sourceHeight: 720,
    targetWidth: 3840,
    targetHeight: 2160,
    scale: 3,
    alreadyAtTarget: false,
  });
});

test("maps portrait inputs to a 3840 pixel long edge", () => {
  const dimensions = calculate4kDeliveryDimensions(720, 1280);
  assert.equal(dimensions.targetWidth, 2160);
  assert.equal(dimensions.targetHeight, 3840);
  assert.equal(dimensions.scale, 3);
});

test("does not silently downscale a source already above the 4K target", () => {
  assert.deepEqual(calculate4kDeliveryDimensions(4096, 2731), {
    sourceWidth: 4096,
    sourceHeight: 2731,
    targetWidth: 4096,
    targetHeight: 2731,
    scale: 1,
    alreadyAtTarget: true,
  });
});

test("local delivery receipt states that no AI detail was reconstructed", () => {
  const dimensions = calculate4kDeliveryDimensions(1280, 720);
  const receipt = createUpscaleJobReceipt({
    sourceName: "model-draft.png",
    sourceBytes: 1024,
    dimensions,
    now: "2026-08-24T00:00:00.000Z",
  });
  assert.equal(receipt.executionMode, "LOCAL_HIGH_QUALITY_RESAMPLE");
  assert.equal(receipt.providerId, LOCAL_UPSCALE_CAPABILITY.providerId);
  assert.equal(receipt.detailReconstruction, false);
  assert.equal(receipt.externalTransmission, false);
  assert.equal(receipt.humanFinalReviewRequired, true);
  assert.equal(
    createUpscaleFileName("model-draft.png", dimensions),
    "model-draft-3840x2160.jpg",
  );
});
