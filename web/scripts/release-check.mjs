import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(label, args, command = npm) {
  console.log(`[release-check] ${label}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32" && command === npm,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// The public release is the Visual Review Plugin and desktop shell. Legacy
// SaaS/workbench checks were removed with the legacy snapshot; these checks
// intentionally cover the product that remains in main.
run("web build", ["run", "build"]);
run("plugin runtime and Host contracts", ["run", "test:plugin"]);
run("desktop boundaries", ["run", "desktop:test"]);
console.log("[release-check] plugin release checks passed");
