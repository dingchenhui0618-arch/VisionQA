import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const checked = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", "dist"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if ([".mjs", ".json", ".yaml", ".md"].includes(extname(path))) checked.push(path);
  }
}
await walk(root);
const violations = [];
for (const file of checked) {
  const text = await readFile(file, "utf8");
  if (/AKID[A-Za-z0-9]{12,}/.test(text)) violations.push(`${file}: access key`);
  if (/sk-[A-Za-z0-9]{16,}/.test(text)) violations.push(`${file}: API key`);
  if (/\t/.test(text) && extname(file) !== ".md") violations.push(`${file}: tab`);
}
if (violations.length) throw new Error(violations.join("\n"));
console.log(`lint ok (${checked.length} files, no credential-shaped values)`);
