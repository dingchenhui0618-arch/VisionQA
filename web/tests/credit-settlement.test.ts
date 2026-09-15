import assert from "node:assert/strict";
import test from "node:test";
import { CreditSettlement, CreditSettlementError } from "../lib/agent/credit-settlement.ts";

test("credits transition AVAILABLE to HELD then CAPTURED idempotently", () => {
  const credits = new CreditSettlement({ available: 2, id: () => "hold-1" });
  const hold = credits.hold("job-1");
  assert.deepEqual(credits.getBalance(), { available: 1, held: 1, captured: 0 });
  assert.deepEqual(credits.hold("job-1"), hold);
  assert.equal(credits.capture(hold.id).state, "CAPTURED");
  assert.deepEqual(credits.getBalance(), { available: 1, held: 0, captured: 1 });
  assert.deepEqual(credits.capture(hold.id), credits.getHold(hold.id));
});

test("release returns held credits and repeated settlement has no effect", () => {
  const credits = new CreditSettlement({ available: 1, id: () => "hold-2" });
  const hold = credits.hold("job-2");
  const released = credits.release(hold.id);
  assert.equal(released.state, "RELEASED");
  assert.deepEqual(credits.getBalance(), { available: 1, held: 0, captured: 0 });
  assert.deepEqual(credits.release(hold.id), released);
  assert.throws(() => credits.capture(hold.id), (error: unknown) => error instanceof CreditSettlementError && error.code === "INVALID_TRANSITION");
});

test("insufficient credits and conflicting idempotency are explicit errors", () => {
  const credits = new CreditSettlement({ available: 0 });
  assert.throws(() => credits.hold("nope"), (error: unknown) => error instanceof CreditSettlementError && error.code === "INSUFFICIENT_CREDITS");
  const funded = new CreditSettlement({ available: 2 });
  funded.hold("same", 1);
  assert.throws(() => funded.hold("same", 2), (error: unknown) => error instanceof CreditSettlementError && error.code === "IDEMPOTENCY_CONFLICT");
});
