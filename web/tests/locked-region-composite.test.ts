import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { composeLockedRepair } from "../lib/beta/locked-region-composite.ts";

async function fixture(color: [number, number, number, number], width = 8, height = 8) {
  return new Uint8Array(await sharp({ create: { width, height, channels: 4, background: { r: color[0], g: color[1], b: color[2], alpha: color[3] / 255 } } }).png().toBuffer());
}

test("composite changes only the target region and preserves outside RGBA", async () => {
  const source = await fixture([10, 20, 30, 255]);
  const output = await fixture([200, 100, 50, 128]);
  const result = await composeLockedRepair({ sourceBytes: source, outputBytes: output, issueRegion: { x: 0.21, y: 0.21, width: 0.5, height: 0.5 } });
  const before = await sharp(source).ensureAlpha().raw().toBuffer();
  const after = await sharp(result.outputBytes).ensureAlpha().raw().toBuffer();
  let insideChanged = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const changed = before.subarray((y * 8 + x) * 4, (y * 8 + x + 1) * 4).some((value, i) => value !== after[(y * 8 + x) * 4 + i]);
    const inside = x >= 2 && x < 5 && y >= 2 && y < 5;
    if (inside) insideChanged += Number(changed); else assert.equal(changed, false);
  }
  assert.ok(insideChanged > 0);
  assert.equal(result.metadata.outsideChangedPixels, 0);
  assert.equal(result.width, 8); assert.equal(result.height, 8);
});

test("rejects empty, out-of-bounds, and aspect-mismatched inputs", async () => {
  const source = await fixture([1, 2, 3, 255]);
  await assert.rejects(() => composeLockedRepair({ sourceBytes: source, outputBytes: new Uint8Array(), issueRegion: { x: 0, y: 0, width: 1, height: 1 } }));
  await assert.rejects(() => composeLockedRepair({ sourceBytes: source, outputBytes: source, issueRegion: { x: 0.9, y: 0, width: 0.2, height: 0.2 } }));
  const wide = await fixture([1, 2, 3, 255], 16, 4);
  await assert.rejects(() => composeLockedRepair({ sourceBytes: source, outputBytes: wide, issueRegion: { x: 0, y: 0, width: 0.5, height: 0.5 } }));
  const tiny = await fixture([1, 2, 3, 255], 1, 1);
  await assert.rejects(() => composeLockedRepair({ sourceBytes: source, outputBytes: tiny, issueRegion: { x: 0, y: 0, width: 0.5, height: 0.5 } }));
  await assert.rejects(() => composeLockedRepair({ sourceBytes: source, outputBytes: source, issueRegion: { x: 0.999, y: 0.999, width: 0.001, height: 0.001 } }));
});

test("rejects truncated PNG, EXIF rotation and actual animated GIF", async () => {
  const source = await fixture([1, 2, 3, 255]);
  const region = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  await assert.rejects(composeLockedRepair({ sourceBytes: source, outputBytes: source.slice(0, 40), issueRegion: region }));
  const rotated = await sharp(source).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  await assert.rejects(composeLockedRepair({ sourceBytes: rotated, outputBytes: source, issueRegion: region }), /orientation/);
  const frames = Buffer.concat([Buffer.alloc(8 * 8 * 3, 30), Buffer.alloc(8 * 8 * 3, 220)]);
  const animated = await sharp(frames, { raw: { width: 8, height: 16, channels: 3, pageHeight: 8 } }).gif({ delay: [100, 100], loop: 0 }).toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  await assert.rejects(composeLockedRepair({ sourceBytes: source, outputBytes: animated, issueRegion: region }), /animated/);
});

test("normalizes grayscale output and preserves transparent source outside the region", async () => {
  const source = new Uint8Array(await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer());
  const gray = new Uint8Array(await sharp(Buffer.alloc(16, 220), { raw: { width: 4, height: 4, channels: 1 } }).png().toBuffer());
  const result = await composeLockedRepair({ sourceBytes: source, outputBytes: gray, issueRegion: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } });
  const raw = await sharp(result.outputBytes).ensureAlpha().raw().toBuffer();
  assert.equal(raw[3], 0);
  assert.equal(raw[(1 * 4 + 1) * 4 + 3], 128);
});
