import assert from "node:assert/strict";
import test from "node:test";
import {
  PLUGIN_MAX_IMAGE_BYTES,
  runVisualPluginReview,
  type PluginImage,
} from "../lib/visionqa/plugin-runtime.ts";
import { createFixtureDraft } from "../lib/visionqa/providers/fixture.ts";
import type { VisionProviderAdapter } from "../lib/visionqa/providers/types.ts";
import { parseVisualReviewRequest, parseVisualReviewResponse } from "../lib/visionqa/visual-review-contract.ts";

const baseRequest = parseVisualReviewRequest({
  schema_version: "visual-review-v0.1",
  request_id: "plugin-test-request",
  conversation_id: "plugin-test-conversation",
  host: { type: "test-host", adapter_version: "0.1.0" },
  artifact: { type: "image", name: "candidate.png", mime_type: "image/png", screenshot_ref: "browser://candidate" },
  intent: { goal: "检查视觉层级", platform: "local-web" },
  constraints: { must_keep: ["品牌标识"] },
  permissions: { can_call_model: true },
  operation: "review",
});

const image = (role: PluginImage["role"], size = 8): PluginImage => ({
  bytes: new ArrayBuffer(size),
  mimeType: "image/png",
  role,
  name: `${role}.png`,
});

test("Mock and real-shaped adapters return the same VisualReview Contract", async () => {
  const mock = await runVisualPluginReview({ request: baseRequest, provider: "mock" });
  assert.equal(mock.contract.usage.mode, "mock");
  assert.equal(mock.contract.decision, "MANUAL_REVIEW");
  assert.equal(parseVisualReviewResponse(mock.contract).schema_version, "visual-review-v0.1");

  const adapter: VisionProviderAdapter = {
    providerId: "test-qwen",
    adapterVersion: "test-adapter-0.1.0",
    async evaluate() {
      return {
        providerId: this.providerId,
        adapterVersion: this.adapterVersion,
        modelSnapshot: "test-qwen-snapshot",
        providerRequestId: "provider-request-1",
        latencyMs: 3,
        usage: { inputTokens: 12, outputTokens: 8 },
        warnings: [],
        observationDraft: createFixtureDraft(),
      };
    },
  };
  const realShaped = await runVisualPluginReview({
    request: baseRequest,
    provider: "qwen",
    candidate: image("candidate"),
    references: [image("reference")],
    adapter,
  });
  assert.equal(realShaped.contract.usage.mode, "managed");
  assert.equal(realShaped.contract.usage.input_images, 2);
  assert.equal(realShaped.provider.providerId, "test-qwen");
  const genericContract = parseVisualReviewResponse(realShaped.contract);
  assert.equal(genericContract.request_id, baseRequest.request_id);
  assert.equal(genericContract.usage.mode, "managed");
  assert.equal(genericContract.repair_plan.type, "manual_plan");
  assert.match(genericContract.summary, /视觉|证据|人工/);
});

test("Qwen path rejects governed image limits before a provider call", async () => {
  let called = false;
  const adapter: VisionProviderAdapter = {
    providerId: "should-not-run",
    adapterVersion: "0.1.0",
    async evaluate() {
      called = true;
      throw new Error("unexpected provider call");
    },
  };
  await assert.rejects(
    () => runVisualPluginReview({
      request: baseRequest,
      provider: "qwen",
      candidate: image("candidate", PLUGIN_MAX_IMAGE_BYTES + 1),
      adapter,
    }),
    /不能超过/,
  );
  assert.equal(called, false);
});

test("Provider calls are blocked when the host does not grant model permission", async () => {
  await assert.rejects(
    () => runVisualPluginReview({
      request: parseVisualReviewRequest({ ...baseRequest, permissions: { can_call_model: false } }),
      provider: "qwen",
      candidate: image("candidate"),
      adapter: { providerId: "not-called", adapterVersion: "0.1", evaluate: async () => { throw new Error("not called"); } },
    }),
    /未授予视觉模型调用权限/,
  );
});

test("desktop Provider mode off blocks every real adapter before fetch", async () => {
  let called = false;
  await assert.rejects(
    () => runVisualPluginReview({
      request: baseRequest,
      provider: "qwen",
      candidate: image("candidate"),
      env: { VISIONQA_DESKTOP_MODE: "off" },
      adapter: { providerId: "not-called", adapterVersion: "0.1", evaluate: async () => { called = true; throw new Error("not called"); } },
    }),
    /桌面端 Provider 调用当前已关闭/,
  );
  assert.equal(called, false);
});

test("web-page mode does not turn legacy missing-candidate wording into a revision blocker", async () => {
  const request = parseVisualReviewRequest({
    ...baseRequest,
    request_id: "web-page-scope-test",
    artifact: {
      type: "web_page",
      name: "current-page",
      mime_type: "image/png",
      screenshot_ref: "host://current-visible-tab",
    },
  });
  const draft = createFixtureDraft();
  draft.observations = [{
    observation_id: "obs-legacy-missing-candidate",
    issue_code: "missing_candidate_image",
    primary_skill: null,
    severity: "blocker",
    status: "detected",
    observation: "旧提示词误以为缺少商品候选图。",
    impact: "不应阻断网页截图评审。",
  }];
  const result = await runVisualPluginReview({
    request,
    provider: "qwen",
    candidate: image("candidate"),
    adapter: {
      providerId: "test-web-page",
      adapterVersion: "0.1",
      async evaluate() {
        return {
          providerId: this.providerId,
          adapterVersion: this.adapterVersion,
          modelSnapshot: "test-web-page-snapshot",
          providerRequestId: null,
          latencyMs: 1,
          usage: { inputTokens: null, outputTokens: null },
          warnings: [],
          observationDraft: draft,
        };
      },
    },
  });
  assert.equal(result.contract.decision, "MANUAL_REVIEW");
  assert.equal(result.contract.issues[0]?.category, "web_target_scope");
  assert.equal(result.contract.issues[0]?.severity, "observation");
  assert.equal(result.contract.usage.input_images, 1);
});
