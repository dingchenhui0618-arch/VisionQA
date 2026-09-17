import assert from "node:assert/strict";
import test from "node:test";
import { ModelCallLedger } from "../lib/agent/model-call-ledger.ts";
import { createMockProviderRuntime, createRealProviderRuntime } from "../lib/agent/provider-runtime.ts";
import { createMemoryDispatchClaimStore } from "../lib/agent/dispatch-claim-store.ts";

const request = { request: "product-note:r1", project: "p1", conversation: "c1", operation: "TEXT" as const, provider: "mock", model: "text-v1", idempotency: "r1" };

test("mock and injected real runtimes expose the same result contract", async () => {
  const ledger = new ModelCallLedger({ now: () => new Date("2026-01-01T00:00:00.000Z"), id: () => "call-1" });
  const mock = createMockProviderRuntime({ ledger });
  const real = createRealProviderRuntime({ provider: "injected", model: "test", ledger, executor: async (input) => ({ echoed: input.request }) });
  const a = await mock.dispatch(request);
  const b = await real.execute({ ...request, provider: "injected", model: "test", idempotency: "r2" });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.deepEqual((b as Extract<typeof b, { ok: true }>).output, { echoed: request.request });
  assert.equal(ledger.list().length, 2);
});

test("image dispatch is blocked until explicit confirmation and never calls executor", async () => {
  let calls = 0;
  const runtime = createRealProviderRuntime({ provider: "injected", model: "image-test", executor: () => { calls += 1; return "should not run"; } });
  const result = await runtime.dispatch({ ...request, operation: "IMAGE", idempotency: "image-1", confirmed: false });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "BLOCKED");
  assert.equal(calls, 0);
});

test("executor errors are normalized to the shared error contract", async () => {
  const runtime = createRealProviderRuntime({ provider: "injected", model: "test", executor: () => { throw { code: "RATE_LIMITED", message: "busy", retryable: true, status: 429 }; } });
  const result = await runtime.dispatch({ ...request, provider: "injected", model: "test", idempotency: "error-1" });
  assert.equal(result.ok, false);
  assert.deepEqual(result.error, { code: "RATE_LIMITED", message: "busy", retryable: true, status: 429 });
});

test("a local blocked image does not consume the later confirmed dispatch idempotency key", async () => {
  const ledger = new ModelCallLedger();
  let calls = 0;
  const runtime = createRealProviderRuntime({ provider: "injected", model: "image-test", ledger, executor: () => { calls += 1; return "ok"; } });
  const blocked = await runtime.dispatch({ ...request, operation: "IMAGE", idempotency: "image-retry", confirmed: false });
  const confirmed = await runtime.dispatch({ ...request, operation: "IMAGE", idempotency: "image-retry", confirmed: true });
  assert.equal(blocked.ok, false);
  assert.equal(confirmed.ok, true);
  assert.equal(calls, 1);
  assert.equal(ledger.list().length, 1);
});

test("a shared dispatch claim blocks a second runtime before external execution", async () => {
  const claims = createMemoryDispatchClaimStore();
  let calls = 0;
  const makeRuntime = () => createRealProviderRuntime({
    tenantId: "tenant-a",
    provider: "injected",
    model: "image-test",
    claims,
    executor: async () => { calls += 1; return "ok"; },
  });
  const first = await makeRuntime().dispatch({ ...request, operation: "IMAGE", idempotency: "shared", confirmed: true });
  const duplicate = await makeRuntime().dispatch({ ...request, operation: "IMAGE", idempotency: "shared", confirmed: true });
  assert.equal(first.ok, true);
  assert.equal(duplicate.ok, false);
  assert.equal(calls, 1);
});

test("image executor usage preserves generated output byte count in the ledger", async () => {
  const ledger = new ModelCallLedger();
  const output = new Uint8Array(17);
  const runtime = createRealProviderRuntime({
    provider: "qwen-image-3",
    model: "qwen-image-3-pro-edit",
    ledger,
    executor: async () => ({
      output: { outputBytes: output, outputWidth: 120, outputHeight: 160 },
      usage: { image: { inputCount: 2, outputCount: 1, inputBytes: 31, outputBytes: output.byteLength, mimeTypes: ["image/png"], width: 120, height: 160 } },
    }),
  });
  const result = await runtime.dispatch({ ...request, operation: "IMAGE", provider: "qwen-image-3", model: "qwen-image-3-pro-edit", idempotency: "image-usage", confirmed: true });
  assert.equal(result.ok, true);
  assert.equal(ledger.list()[0]?.image?.outputBytes, 17);
});
