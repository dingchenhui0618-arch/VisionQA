import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILTIN_REVIEW_PROFILES,
  getReviewProfile,
  listReviewProfiles,
  resolveReviewProfile,
} from "../lib/visionqa/review-profiles.ts";

test("the built-in registry has one versioned definition per profile", () => {
  assert.deepEqual(
    BUILTIN_REVIEW_PROFILES.map((profile) => `${profile.profile.id}@${profile.profile.version}`),
    [
      "visual-baseline@0.1.0",
      "code-quality@0.1.0",
      "linked-review@0.1.0",
      "ecommerce-apparel@0.3.0",
    ],
  );
  assert.equal(new Set(BUILTIN_REVIEW_PROFILES.map((profile) => profile.profile.id)).size, BUILTIN_REVIEW_PROFILES.length);
});

test("profile lookup requires the exact versioned reference", () => {
  assert.equal(getReviewProfile({ id: "visual-baseline", version: "0.1.0", kind: "builtin" })?.review_mode, "visual");
  assert.equal(getReviewProfile({ id: "visual-baseline", version: "0.2.0", kind: "builtin" }), undefined);
  assert.equal(getReviewProfile({ id: "visual-baseline", version: "0.1.0", kind: "workspace" }), undefined);
  assert.equal(getReviewProfile({ id: "ecommerce-apparel", version: "0.3.0", kind: "builtin" })?.profile.kind, "builtin");
});

test("code and visual listings stay separate; linked is an explicit future mode", () => {
  assert.deepEqual(listReviewProfiles("visual").map((profile) => profile.profile.id), [
    "visual-baseline",
    "ecommerce-apparel",
  ]);
  assert.deepEqual(listReviewProfiles("code").map((profile) => profile.profile.id), ["code-quality"]);
  assert.deepEqual(listReviewProfiles("linked").map((profile) => profile.profile.id), ["linked-review"]);
});

test("ecommerce compatibility profile remains evidence constrained", () => {
  const profile = getReviewProfile({ id: "ecommerce-apparel", version: "0.3.0", kind: "builtin" });
  assert.ok(profile);
  assert.ok(profile.forbidden_inferences.includes("sales_lift"));
  assert.ok(profile.deterministic_checks.includes("decodable_image"));
});

test("profile resolution does not silently select the e-commerce profile", () => {
  assert.equal(resolveReviewProfile({ artifactType: "image", hasScreenshot: true }).profile.profile.id, "visual-baseline");
  const explicit = resolveReviewProfile({
    requested: { id: "ecommerce-apparel", version: "0.3.0", kind: "builtin" },
  });
  assert.equal(explicit.profile.profile.id, "ecommerce-apparel");
  assert.equal(explicit.resolution, "explicit");
  assert.match(explicit.warnings.join(" "), /明确选择/);
});

test("source plus screenshot resolves to linked review", () => {
  const resolved = resolveReviewProfile({ artifactType: "web_page", hasScreenshot: true, hasSource: true });
  assert.equal(resolved.profile.profile.id, "linked-review");
  assert.equal(resolved.resolution, "linked");
});

test("source target without source evidence warns instead of implying assessability", () => {
  const resolved = resolveReviewProfile({ artifactType: "diff" });
  assert.equal(resolved.profile.profile.id, "code-quality");
  assert.match(resolved.warnings.join(" "), /源码引用/);
});

