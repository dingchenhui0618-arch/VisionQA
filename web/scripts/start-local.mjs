import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const preview = process.argv.includes("--preview");
const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url)), "dev", "--hostname", "localhost", "--port", "6300"], {
  cwd: root,
  env: { ...process.env, VISIONQA_AGENT_LOCAL: "true", VISIONQA_AGENT_MOCK: preview ? "true" : "false" },
  stdio: "inherit",
});
child.on("exit", code => { process.exitCode = code ?? 1; });
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
