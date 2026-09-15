import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyMock, emptyMock, type Command } from "../lib/agent/mock-contract.ts";
import { localMockEnabled } from "../lib/agent/mock-mode.ts";

test("mock complete flow is idempotent, failed attempt costs nothing, versions stay distinct and direct follow-up uses viewed version", () => {
  let s = emptyMock(), n = 0;
  const run = (command: Command) => { s = applyMock(s, s.selectedId, `cmd-${++n}`, command); };
  run({ kind: "create", name: "开衫" });
  assert.throws(() => run({ kind: "screen" }), /至少/);
  run({ kind: "attach", assets: [{ id: "t", name: "reference", role: "truth", url: "test" }, { id: "c", name: "candidate", role: "candidate", url: "test" }, { id: "c2", name: "second", role: "candidate", url: "test" }] });
  run({ kind: "screen" }); run({ kind: "choose", assetId: "c" });
  run({ kind: "repair", fail: true }); assert.equal(s.conversations[0].versions.length, 0);
  run({ kind: "repair" });
  const first = s.conversations[0].versions[0];
  assert.equal(first.outputUrl, first.sourceUrl);
  assert.equal(applyMock(s, s.selectedId, `cmd-${n}`, { kind: "repair" }), s);
  run({ kind: "continue", versionId: first.id }); run({ kind: "message", text: "second edit" }); run({ kind: "repair" });
  const second = s.conversations[0].versions[1]; assert.equal(second.sourceVersionId, first.id);
  run({ kind: "message", text: "third edit" }); run({ kind: "repair" });
  assert.equal(s.conversations[0].versions[2].sourceVersionId, second.id);
  run({ kind: "review", versionId: first.id }); assert.equal(s.conversations[0].versions[1].reviewed, false);
  run({ kind: "back", target: "screened" }); run({ kind: "choose", assetId: "c2" });
  assert.equal(s.conversations[0].sourceVersionId, null);
  run({ kind: "create", name: "裤子" }); assert.equal(s.conversations[1].assets.length, 0);
  assert.equal(s.conversations[0].versions.length, 3);
});
test("mock cannot exceed asset limits or cross conversation version boundaries", () => {
  let s = applyMock(emptyMock(), null, "one", { kind: "create", name: "one" });
  assert.throws(() => applyMock(s, "one", "many", { kind: "attach", assets: Array.from({ length: 11 }, (_, i) => ({ id: String(i), name: "c", role: "candidate", url: "test" })) }), /最多/);
  s = applyMock(s, "one", "two", { kind: "create", name: "two" });
  assert.throws(() => applyMock(s, "two", "x", { kind: "view", versionId: "foreign" }), /不存在/);
});
test("mock mode is explicit local-only; UI port contains no provider fetch or old workbench link", () => {
  assert.equal(localMockEnabled({ NODE_ENV: "production", VISIONQA_AGENT_LOCAL: "true" }), false);
  assert.equal(localMockEnabled({ NODE_ENV: "development", VISIONQA_AGENT_LOCAL: "true" }), true);
  assert.equal(localMockEnabled({ NODE_ENV: "development" }), false);
  const ui = readFileSync(new URL("../app/agent/mock-workspace.tsx", import.meta.url), "utf8");
  const adapter = readFileSync(new URL("../lib/agent/mock-port.ts", import.meta.url), "utf8");
  for (const content of [ui, adapter]) {
    assert.equal(/fetch\s*\(/.test(content), false);
    assert.equal(content.includes('href="/workspace'), false);
    assert.equal(content.includes("DEEPSEEK_API_KEY"), false);
  }
  assert.match(adapter, /transaction.abort\(\)/);
  assert.match(ui, /MOCK_ONLY/);
});
