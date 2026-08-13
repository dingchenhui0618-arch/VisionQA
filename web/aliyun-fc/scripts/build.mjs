import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../src", import.meta.url));
const files = (await readdir(source))
  .filter((name) => name.endsWith(".mjs"))
  .sort();
for (const file of files) {
  const checked = spawnSync(process.execPath, ["--check", join(source, file)], {
    encoding: "utf8",
  });
  if (checked.status !== 0) {
    throw new Error(checked.stderr || `${file} failed syntax check`);
  }
}
console.log(`build ok (${files.length} Node.js 20 ESM modules syntax-checked)`);
