import assert from "node:assert/strict";
import test from "node:test";
import { ModelCallLedger } from "../lib/agent/model-call-ledger.ts";

test("ledger records required dispatch metadata and is idempotent", () => {
  const ledger = new ModelCallLedger({ id: () => "fixed", now: () => new Date("2026-01-01T00:00:00.000Z") });
  const input = { request: "req-1", project: "p", conversation: "c", operation: "IMAGE", provider: "p1", model: "m1", status: "SUCCEEDED" as const, cost: 2, token: { input: 3, output: 4, total: 7 }, image: { inputCount: 1, outputCount: 1, inputBytes: 10, outputBytes: 20, mimeTypes: ["image/png"] }, latency: 12, retry: 0, idempotency: "same" };
  const first = ledger.record(input);
  const replay = ledger.record(input);
  assert.deepEqual(replay, first);
  assert.equal(ledger.list().length, 1);
  assert.equal("secret" in first, false);
  assert.throws(() => ledger.record({ ...input, cost: 3 }), /idempotency conflict/);
});

test("ledger rejects missing request and does not retain payload bytes", () => {
  const ledger = new ModelCallLedger();
  assert.throws(() => ledger.record({ request: "", operation: "TEXT", provider: "p", model: "m", status: "FAILED", cost: null, token: null, image: { inputBytes: 100 }, latency: 0, retry: 0, idempotency: "x" }), /opaque identifier/);
  const saved = ledger.record({ request: "safe", operation: "TEXT", provider: "p", model: "m", status: "SUCCEEDED", cost: null, token: null, image: { inputBytes: 100 }, latency: 0, retry: 0, idempotency: "y" });
  assert.equal("input" in saved, false);
  assert.equal(saved.image?.inputBytes, 100);
});

test("ledger rejects prompts, credentials, and URLs in request identifier", () => {
  const ledger = new ModelCallLedger();
  const base = { operation: "TEXT", provider: "p", model: "m", status: "FAILED" as const, cost: null, token: null, image: null, latency: 0, retry: 0, idempotency: "x" };
  assert.throws(() => ledger.record({ ...base, request: "write a product prompt" }), /opaque identifier/);
  assert.throws(() => ledger.record({ ...base, request: "sk-secret" }), /sensitive/);
  assert.throws(() => ledger.record({ ...base, request: "https://example.test/token" }), /sensitive/);
});

test("ledger hydrates a validated snapshot and persists append-only changes", () => {
  const source = new ModelCallLedger({ id: () => "call-1", now: () => new Date("2026-01-01T00:00:00.000Z") });
  source.record({ request: "req-1", operation: "TEXT", provider: "planner", model: "m", status: "SUCCEEDED", cost: null, token: null, image: null, latency: 4, retry: 0, idempotency: "idem-1" });
  let saved = 0;
  const restored = new ModelCallLedger({ initial: source.list(), onChange: () => { saved += 1; } });
  assert.equal(restored.list().length, 1);
  restored.record({ request: "req-2", operation: "IMAGE", provider: "image", model: "m", status: "FAILED", cost: null, token: null, image: { inputCount: 2 }, latency: 9, retry: 0, idempotency: "idem-2" });
  assert.equal(restored.list().length, 2);
  assert.equal(saved, 1);
});
