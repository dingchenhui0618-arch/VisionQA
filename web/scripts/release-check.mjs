import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(label, args, attempts = 1, command = npm) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    console.log(`[release-check] ${label} (${attempt}/${attempts})`);
    const result = spawnSync(command, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32" && command === npm,
    });
    if (result.status === 0) return;
    if (result.error) console.error(`[release-check] ${label} error: ${result.error.message}`);
    if (attempt < attempts) {
      console.warn(`[release-check] ${label} failed; retrying without changing test scope.`);
    } else {
      process.exit(result.status ?? 1);
    }
  }
}

// A clean build is retried once because Vinext/Rolldown can hit transient host
// memory pressure on Windows. No test is skipped and no failed test is retried.
run("build", ["run", "build"], 2);
run("agent and persistence", ["run", "test:agent"]);
run("focused UI/repair", [
  "--experimental-strip-types", "--test",
  "tests/agent-repair-download.test.ts",
  "tests/locked-region-composite.test.ts",
  "tests/screening-evidence.test.ts",
  "tests/agent-composer.test.ts",
  "tests/agent-plan-presentation.test.ts",
], 1, process.execPath);
run("rendered and customer guardrails", [
  "--test",
  "tests/rendered-html.test.mjs",
  "tests/schema-examples.test.mjs",
  "tests/production-smoke.test.mjs",
  "tests/customer-ux-guardrails.test.mjs",
], 1, process.execPath);
run("contracts and business", [
  "--experimental-strip-types", "--test",
  "tests/contracts-rules.test.ts",
  "tests/product-expression.test.ts",
  "tests/agent-orchestrator.test.ts",
  "tests/l2-agent-runtime.test.ts",
  "tests/qwen-marketing-provider.test.ts",
  "tests/qwen-image-edit-provider.test.ts",
  "tests/qwen-image-3-provider.test.ts",
  "tests/recursive-repair-agent.test.ts",
  "tests/repair-output-gate.test.ts",
  "tests/repair-boundary.test.ts",
  "tests/repair-orchestrator.test.ts",
  "tests/local-mvp.test.ts",
  "tests/data-processing-contract.test.ts",
  "tests/model-adapter.test.ts",
  "tests/object-storage.test.ts",
  "tests/platform-persistence.test.ts",
  "tests/postgres-persistence.test.ts",
  "tests/ui-adapter.test.ts",
  "tests/batch-download.test.ts",
  "tests/project-store.test.ts",
  "tests/upscale.test.ts",
  "tests/synthetic-ground-truth.test.ts",
  "tests/trial-auth.test.ts",
  "tests/customer-beta.test.ts",
], 1, process.execPath);
console.log("[release-check] all release checks passed");
