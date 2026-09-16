import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getBetaBackend, setBetaBackendForTest, type BetaBackend } from "../lib/beta/backend.ts";
import { createBetaServiceForTest } from "../lib/beta/service.ts";
import type { BetaSessionView } from "../lib/beta/contracts.ts";

const session: BetaSessionView = {
  userId: "user-test",
  tenantId: "tenant-test",
  membershipId: "membership-test",
  role: "customer",
  displayName: "测试用户",
  expiresAt: "2099-01-01T00:00:00.000Z",
};

test("beta backend accepts asynchronous adapters while keeping the local service contract", async () => {
  const local = createBetaServiceForTest();
  const backend = new Proxy(local, {
    get(target, key) {
      if (key === "getCredits") return async (input: BetaSessionView) => target.getCredits(input);
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as BetaBackend;
  setBetaBackendForTest(backend);
  try {
    assert.deepEqual(await getBetaBackend().getCredits(session), {
      available: 0,
      held: 0,
      captured: 0,
      label: "内测额度",
    });
  } finally {
    setBetaBackendForTest(null);
  }
});

test("customer pages and APIs cannot bypass the beta backend composition root", () => {
  const appRoot = new URL("../app", import.meta.url);
  const offenders: string[] = [];
  for (const file of sourceFiles(fileURLToPath(appRoot))) {
    const source = readFileSync(file, "utf8");
    if (source.includes("getBetaService")) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}
