import assert from "node:assert/strict";
import test from "node:test";
import { CreditSettlement } from "../lib/agent/credit-settlement.ts";
import { createMockProviderRuntime } from "../lib/agent/provider-runtime.ts";
import { runBoundedAgentLoop } from "../lib/agent/bounded-agent-loop.ts";

const textRequest = (id: string) => ({ request: id, operation: "TEXT" as const, provider: "mock", model: "text", idempotency: id });
const imageRequest = (id: string, confirmed = true) => ({ request: id, operation: "IMAGE" as const, provider: "mock", model: "image", idempotency: id, confirmed });

test("loop stops at text and attempt limits", async () => {
  const result = await runBoundedAgentLoop({ runtime: createMockProviderRuntime(), maxTextSteps: 2, maxAttempts: 2, next: ({ attempts }) => ({ kind: "text", request: textRequest(`t-${attempts}`) }) });
  assert.equal(result.status, "LIMIT_REACHED");
  assert.equal(result.textSteps, 2);
  assert.equal(result.attempts, 2);
});

test("image generation requires confirmation and a paid call is held then captured", async () => {
  const credits = new CreditSettlement({ available: 1 });
  const result = await runBoundedAgentLoop({ runtime: createMockProviderRuntime(), credits, maxImageCalls: 1, next: ({ imageCalls }) => imageCalls ? ({ kind: "done", value: "ok" }) : ({ kind: "image", request: imageRequest("img-1"), confirmed: true }) });
  assert.equal(result.status, "DONE");
  assert.deepEqual(credits.getBalance(), { available: 0, held: 0, captured: 1 });
});

test("unconfirmed image and a second image are blocked without dispatch", async () => {
  let nextCalls = 0;
  const blocked = await runBoundedAgentLoop({ runtime: createMockProviderRuntime(), maxImageCalls: 1, next: () => { nextCalls += 1; return { kind: "image", request: imageRequest("img-2", false), confirmed: false }; } });
  assert.equal(blocked.status, "BLOCKED");
  assert.equal(blocked.attempts, 0);
  assert.equal(nextCalls, 1);
});
