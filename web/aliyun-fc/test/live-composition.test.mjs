import assert from "node:assert/strict";
import test from "node:test";
import { loadRuntimeDependencies } from "../src/dependency-loader.mjs";
import { RuntimeError } from "../src/errors.mjs";
import { createLiveDependencies } from "../src/live-composition.mjs";

test("live composition signs private images and delegates evaluation", async () => {
  const signed = [];
  const adapter = { providerId: "aliyun-bailian-cn-beijing" };
  const dependencies = createLiveDependencies({
    objectStorage: { provider: "aliyun_oss" },
    repository: { provider: "aliyun_postgresql" },
    qwenAdapter: adapter,
    imageEnvelopeHmacSecret: "x".repeat(32),
    nonceFactory: () => "0123456789abcdef",
    async signPrivateImageEnvelope(options) {
      signed.push(options);
      return { ...options.image, privateEnvelope: { signed: true } };
    },
    async orchestrateVisionEvaluation(receivedAdapter, input) {
      assert.equal(receivedAdapter, adapter);
      return { result: { schema_version: "0.3.0" }, provider: {} , input};
    },
  });
  const image = await dependencies.visionProvider.preparePrivateImage({
    image: { role: "candidate", url: "https://oss.example/a.jpg" },
    metadata: { assetSha256: "a".repeat(64), byteSize: 100 },
  });
  assert.equal(image.privateEnvelope.signed, true);
  assert.equal(signed[0].nonce, "0123456789abcdef");
  const outcome = await dependencies.visionProvider.evaluate(
    { assetId: "asset-1" },
    new AbortController().signal,
  );
  assert.equal(outcome.input.assetId, "asset-1");
});

test("live dependency loader uses only the fixed reviewed binding entrypoint", async () => {
  const dependencies = { marker: "reviewed" };
  const loaded = await loadRuntimeDependencies(
    { mode: "live" },
    {
      importLiveBindings: async () => ({
        createReviewedLiveDependencies() {
          return dependencies;
        },
      }),
    },
  );
  assert.equal(loaded, dependencies);
});

test("missing live binding artifact fails closed before network", async () => {
  await assert.rejects(
    () =>
      loadRuntimeDependencies(
        { mode: "live" },
        { importLiveBindings: async () => Promise.reject(new Error("missing")) },
      ),
    (error) =>
      error instanceof RuntimeError && error.code === "LIVE_BINDINGS_NOT_DEPLOYED",
  );
});
