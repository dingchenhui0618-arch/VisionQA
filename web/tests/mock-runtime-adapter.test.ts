import test from "node:test";
import assert from "node:assert/strict";
import { applyMock, emptyMock, type Command } from "../lib/agent/mock-contract.ts";
import { productContextFromMock, versionTreeFromMock } from "../lib/agent/mock-runtime-adapter.ts";

test("mock conversation projects into shared product context and version lineage without becoming real evidence", () => {
  let state = emptyMock(), counter = 0;
  const run = (command: Command) => { state = applyMock(state, state.selectedId, `cmd-${++counter}`, command); };
  run({ kind: "create", name: "灰色开衫" });
  run({ kind: "attach", assets: [
    { id: "truth", name: "reference", role: "truth", url: "truth" },
    { id: "candidate", name: "candidate", role: "candidate", url: "candidate" },
  ] });
  run({ kind: "screen" }); run({ kind: "choose", assetId: "candidate" }); run({ kind: "repair" });
  const conversation = state.conversations[0];
  const context = productContextFromMock(conversation);
  const tree = versionTreeFromMock(conversation, "candidate");
  assert.equal(context.conversation.id, conversation.id);
  assert.match(context.project.id, /^mock-project:/);
  assert.equal(tree.versions.length, 2);
  assert.equal(tree.versions[1].parentVersionId, "mock-original:candidate");
  assert.equal(tree.versions[1].confirmations.length, 0);
});
