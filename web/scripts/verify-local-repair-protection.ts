// Offline QA only: reads the existing local synthetic repair, never calls a provider
// or modifies the service snapshot. Writes a separately labelled inspection artifact.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { composeLockedRepair } from "../lib/beta/locked-region-composite.ts";

const state = JSON.parse(readFileSync("work/local-agent-state/beta.json", "utf8"), (_key, value) =>
  value?.__bytes === true ? new Uint8Array(Buffer.from(value.base64, "base64")) : value);
const attempts = new Map<string, { status: string; sourceAssetId: string; outputAssetId: string; issueRegion: { x: number; y: number; width: number; height: number } }>(state.maps.attempts);
const attempt = attempts.get(process.argv[2]);
if (!attempt || attempt.status !== "CAPTURED") throw new Error("Supply an existing captured synthetic QA attempt id");
const bytes = new Map<string, { bytes: Uint8Array }>(state.maps.assetBytes);
const source = bytes.get(attempt.sourceAssetId)!.bytes;
const rawOutput = bytes.get(attempt.outputAssetId)!.bytes;
const result = await composeLockedRepair({ sourceBytes: source, outputBytes: rawOutput, issueRegion: attempt.issueRegion });
const before = await sharp(source).toColourspace("srgb").ensureAlpha().raw().toBuffer();
const after = await sharp(result.outputBytes).toColourspace("srgb").ensureAlpha().raw().toBuffer();
const r = attempt.issueRegion;
let outsideChanged = 0, insideChanged = 0;
for (let y=0; y<result.height; y++) for(let x=0;x<result.width;x++) {
  const i=(y*result.width+x)*4;
  const changed=before[i]!==after[i]||before[i+1]!==after[i+1]||before[i+2]!==after[i+2]||before[i+3]!==after[i+3];
  if (!changed) continue;
  if(x>=Math.ceil(r.x*result.width)&&x<Math.floor((r.x+r.width)*result.width)&&y>=Math.ceil(r.y*result.height)&&y<Math.floor((r.y+r.height)*result.height)) insideChanged++; else outsideChanged++;
}
if(outsideChanged || !insideChanged) throw new Error("Pixel protection QA failed");
mkdirSync("work/protection-qa", { recursive: true });
writeFileSync("work/protection-qa/offline-protected-v1.png", result.outputBytes);
const evidence = { mode:"OFFLINE_EXISTING_SYNTHETIC_OUTPUT", ...result.metadata, width:result.width,height:result.height, outsideChanged,insideChanged,paidCalls:0,customerAccepted:false };
writeFileSync("work/protection-qa/evidence.json", JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
