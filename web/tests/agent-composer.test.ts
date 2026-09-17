import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatMessageTime } from "../lib/agent/message-time.ts";

test("message time formatter rejects missing or invalid server timestamps", () => {
  assert.equal(formatMessageTime(undefined), null);
  assert.equal(formatMessageTime("not-a-date"), null);
  const formatted = formatMessageTime("2026-09-17T08:09:00.000Z");
  assert.equal(formatted?.dateTime, "2026-09-17T08:09:00.000Z");
  assert.match(formatted?.label ?? "", /9[月\/]17/);
});

test("composer reserves space and renders optional server timestamps", () => {
  const ui = readFileSync(new URL("../app/agent/workspace.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/agent/workspace.css", import.meta.url), "utf8");
  assert.match(ui, /formatMessageTime/);
  assert.match(ui, /ref=\{composerRef\}/);
  assert.match(css, /--agent-composer-height/);
  assert.match(css, /overflow:auto/);
});

test("task sessions persist lifecycle timestamps without fabricating answer time", async () => {
  const { TaskSessions } = await import("../lib/agent/task-session.ts");
  const sessions = new TaskSessions();
  const deps = { plan: async () => ({ decision: "READY" as const, summary: "检查商品图", question: "", preserve: ["颜色"], changes: ["检查一致性"] }), prepare: async () => ({ approve: async () => ({ projectId: "p1", stopped: false }) }) };
  const created = await sessions.create("o", { id: "timestamp-task-123456", skuName: "SKU", objective: "检查商品图" }, deps);
  assert.ok(created.createdAt && created.updatedAt);
  assert.ok(created.answeredAt);
  const answeredAt = created.answeredAt;
  const approved = await sessions.act("o", created.id, "approve", deps.prepare);
  assert.equal(approved.answeredAt, answeredAt);
  assert.ok(approved.updatedAt && approved.updatedAt >= approved.answeredAt!);
});
