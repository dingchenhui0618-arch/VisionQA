import { randomUUID } from "node:crypto";
import { RuntimeError } from "./errors.mjs";

export function createLiveDependencies({
  objectStorage,
  repository,
  qwenAdapter,
  orchestrateVisionEvaluation,
  signPrivateImageEnvelope,
  imageEnvelopeHmacSecret,
  nonceFactory = () => randomUUID().replaceAll("-", ""),
}) {
  if (
    !objectStorage ||
    !repository ||
    !qwenAdapter ||
    typeof orchestrateVisionEvaluation !== "function" ||
    typeof signPrivateImageEnvelope !== "function" ||
    typeof imageEnvelopeHmacSecret !== "string" ||
    Buffer.byteLength(imageEnvelopeHmacSecret, "utf8") < 32
  ) {
    throw new RuntimeError(
      "LIVE_DEPENDENCY_INVALID",
      "The reviewed OSS, PostgreSQL, Qwen and private-image signer bindings are incomplete.",
      { status: 503 },
    );
  }

  return Object.freeze({
    objectStorage,
    repository,
    visionProvider: Object.freeze({
      providerId: qwenAdapter.providerId,
      async preparePrivateImage({ image, metadata }) {
        return signPrivateImageEnvelope({
          image,
          assetSha256: metadata.assetSha256,
          byteSize: metadata.byteSize,
          nonce: nonceFactory(),
          secret: imageEnvelopeHmacSecret,
        });
      },
      evaluate(input, signal) {
        return orchestrateVisionEvaluation(qwenAdapter, input, signal);
      },
    }),
  });
}
