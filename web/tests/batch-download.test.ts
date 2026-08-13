import assert from "node:assert/strict";
import test from "node:test";
import { createBatchCsv, createStoredZip } from "../lib/visionqa/batch-download.ts";

test("batch CSV is UTF-8, Chinese-ready and includes the repair prompt", async () => {
  const blob = createBatchCsv([{
    fileName: "候选图01.jpg",
    score: 86,
    decision: "REVIEW",
    humanRealism: 88,
    photographyRealism: 84,
    materialRealism: 85,
    commercialValue: 86,
    repairPrompt: "保留商品款式，降低过度磨皮。",
  }]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = await blob.text();
  assert.deepEqual(Array.from(bytes.slice(0, 3)), [0xef, 0xbb, 0xbf]);
  assert.match(text, /候选图01\.jpg/);
  assert.match(text, /降低过度磨皮/);
});

test("selected originals produce a valid store-only ZIP", async () => {
  const zip = await createStoredZip([
    new File([new Uint8Array([1, 2, 3])], "商品图.jpg", { type: "image/jpeg" }),
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual(Array.from(bytes.slice(-22, -18)), [0x50, 0x4b, 0x05, 0x06]);
});
