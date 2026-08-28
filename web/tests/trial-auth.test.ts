import assert from "node:assert/strict";
import test from "node:test";

import {
  authenticateTrialAccount,
  clearTrialSessionCookie,
  getTrialAccountFromSessionToken,
  trialSessionCookie,
} from "../lib/visionqa/trial-auth.ts";

const digits = (...values: number[]) =>
  values.map((value) => String.fromCharCode(48 + value)).join("");

test("accepts only the two fixed trial accounts", async () => {
  const password = digits(1, 2, 3, 4, 5, 6, 7, 8, 9, 0);
  const first = await authenticateTrialAccount(
    digits(1, 3, 6, 0, 0, 5, 4, 9, 1, 4, 3),
    password,
  );
  const second = await authenticateTrialAccount(
    digits(1, 5, 7, 0, 0, 1, 1, 5, 1, 8, 0),
    password,
  );
  assert.equal(first?.account.id, "trial-01");
  assert.equal(first?.account.storageScope, "trial-01");
  assert.equal(second?.account.id, "trial-02");
  assert.equal(second?.account.storageScope, "trial-02");
  assert.equal(
    await authenticateTrialAccount(digits(1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0), password),
    null,
  );
  assert.equal(
    await authenticateTrialAccount(
      digits(1, 3, 6, 0, 0, 5, 4, 9, 1, 4, 3),
      "incorrect",
    ),
    null,
  );
});

test("maps opaque sessions and emits hardened cookies", async () => {
  const authenticated = await authenticateTrialAccount(
    digits(1, 3, 6, 0, 0, 5, 4, 9, 1, 4, 3),
    digits(1, 2, 3, 4, 5, 6, 7, 8, 9, 0),
  );
  assert.ok(authenticated);
  assert.equal(
    getTrialAccountFromSessionToken(authenticated.sessionToken)?.id,
    "trial-01",
  );
  assert.equal(getTrialAccountFromSessionToken("invalid"), null);

  const cookie = trialSessionCookie(
    authenticated.sessionToken,
    "https://visionqa.dionysusding.cn/api/trial-auth/login",
  );
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=43200/);
  assert.match(
    clearTrialSessionCookie("https://visionqa.dionysusding.cn/api/trial-auth/logout"),
    /Max-Age=0/,
  );
});
