import assert from "node:assert/strict";
import test from "node:test";
import { createMultimodalAdapterFromEnv, getMultimodalReadiness } from "../lib/visionqa/providers/multimodal.ts";
import { createFixtureDraft } from "../lib/visionqa/providers/fixture.ts";
import type { ProviderEvaluationInput } from "../lib/visionqa/providers/types.ts";

const input: ProviderEvaluationInput = {
  requestId: "byok-request-1",
  runId: "run-1",
  assetId: "asset-1",
  scene: "网页视觉评审",
  placement: "chrome-host",
  candidate: { url: "data:image/png;base64,ZmFrZQ==", role: "candidate", mimeType: "image/png" },
  references: [],
  lockedAttributes: ["品牌标识"],
  taxonomyVersion: "test-taxonomy",
  commercialTemplate: { id: "plugin_visual_review", version: "0.1.0", assessmentScope: "检查视觉完成度" },
  promptVersion: "test-prompt",
  contextSummary: "页面标题：测试页\nDOM 文本摘要：购买按钮",
};

const env = {
  VISION_MULTIMODAL_ENABLED: "true",
  VISION_MULTIMODAL_API_KEY: "test-only-key",
  VISION_MULTIMODAL_ENDPOINT: "https://example.com/v1/chat/completions",
  VISION_MULTIMODAL_MODEL: "test-vision-model",
  VISION_MULTIMODAL_PROVIDER_ID: "user-multimodal",
};

test("generic multimodal readiness uses one server-side OpenAI-compatible profile", () => {
  const readiness = getMultimodalReadiness(env);
  assert.equal(readiness.configured, true);
  assert.equal(readiness.protocol, "openai_compatible_chat");
  assert.equal(readiness.model, "test-vision-model");
  assert.equal(getMultimodalReadiness({ ...env, VISION_MULTIMODAL_ENDPOINT: "http://remote.example/v1/chat/completions" }).configured, false);
});

test("DeepSeek profile can use one canonical server-side key", () => {
  const deepSeekEnv = {
    VISION_MULTIMODAL_ENABLED: "true",
    VISION_MULTIMODAL_ENDPOINT: "https://api.deepseek.com/chat/completions",
    VISION_MULTIMODAL_MODEL: "deepseek-v4-flash",
    VISION_MULTIMODAL_PROVIDER_ID: "deepseek",
    DEEPSEEK_API_KEY: "test-deepseek-key",
  };
  assert.equal(getMultimodalReadiness(deepSeekEnv).configured, true);
});

test("generic multimodal adapter sends images and never puts the API key in the body", async () => {
  let seenUrl = "";
  let seenHeaders: Headers | undefined;
  let seenBody = "";
  const adapter = createMultimodalAdapterFromEnv(env, {
    fetchImpl: async (url, init) => {
      seenUrl = String(url);
      seenHeaders = new Headers(init?.headers);
      seenBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ id: "provider-1", model: "test-vision-model", choices: [{ message: { content: JSON.stringify(createFixtureDraft()) } }], usage: { prompt_tokens: 12, completion_tokens: 8 } }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const result = await adapter.evaluate(input, new AbortController().signal);
  assert.equal(seenUrl, env.VISION_MULTIMODAL_ENDPOINT);
  assert.equal(seenHeaders?.get("authorization"), "Bearer test-only-key");
  assert.equal(seenBody.includes("test-only-key"), false);
  assert.match(seenBody, /data:image\/png;base64,ZmFrZQ==/);
  assert.equal(result.providerId, "user-multimodal");
  assert.equal(result.modelSnapshot, "test-vision-model");
});
