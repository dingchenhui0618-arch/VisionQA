import { createHash } from "node:crypto";
import { basename, extname, relative, resolve } from "node:path";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";

const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const rootArg = process.argv[2];
const outputArg = process.argv[3];
if (!rootArg || !outputArg) {
  throw new Error("Usage: node scripts/build-local-material-manifest.mjs <source-folder> <output-json>");
}
const sourceRoot = resolve(rootArg);
const outputPath = resolve(outputArg);

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(fullPath));
    else if (entry.isFile() && allowedExtensions.has(extname(entry.name).toLowerCase())) files.push(fullPath);
  }
  return files;
}

const files = (await collect(sourceRoot)).sort((a, b) => a.localeCompare(b, "zh-CN"));
if (files.length > 500) throw new Error("Local material manifest is capped at 500 images per run.");
const records = [];
for (let index = 0; index < files.length; index += 1) {
  const buffer = await readFile(files[index]);
  records.push({
    material_id: `LOCAL-${String(index + 1).padStart(4, "0")}`,
    relative_path: relative(sourceRoot, files[index]).replaceAll("\\", "/"),
    extension: extname(files[index]).toLowerCase(),
    bytes: buffer.byteLength,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  });
}
const duplicateMap = new Map();
for (const record of records) {
  const group = duplicateMap.get(record.sha256) ?? [];
  group.push(record.material_id);
  duplicateMap.set(record.sha256, group);
}
const extension_counts = Object.fromEntries([...allowedExtensions].map((extension) => [extension, records.filter((record) => record.extension === extension).length]).filter(([, count]) => count > 0));
const manifest = {
  schema_version: "local-material-manifest-v0.1",
  generated_at: new Date().toISOString(),
  source_root_label: basename(sourceRoot),
  privacy_mode: "LOCAL_ONLY_NO_EXTERNAL_TRANSMISSION",
  file_count: records.length,
  total_bytes: records.reduce((sum, record) => sum + record.bytes, 0),
  extension_counts,
  duplicate_groups: [...duplicateMap.values()].filter((group) => group.length > 1),
  records,
};
await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(JSON.stringify({ output: outputPath, file_count: manifest.file_count, duplicate_groups: manifest.duplicate_groups.length, privacy_mode: manifest.privacy_mode }));
