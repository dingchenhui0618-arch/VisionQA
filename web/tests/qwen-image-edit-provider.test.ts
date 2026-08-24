import assert from "node:assert/strict";
import test from "node:test";
import {
  createGovernedQwenImageEditProvider,
  getQwenImageEditReadiness,
  QwenImageEditProvider,
  QwenImageEditProviderError,
} from "../lib/visionqa/providers/qwen-image-edit.ts";
import {
  QWEN_IMAGE_EDIT_DATA_SCOPE,
  QWEN_IMAGE_EDIT_MODEL_SNAPSHOT,
} from "../lib/visionqa/repair-provider-contract.ts";

const authorizedEnvironment = {
  VISION_REPAIR_QWEN_API_KEY: "test-secret",
  VISION_REPAIR_QWEN_WORKSPACE_ID: "workspace-1234",
  VISION_REPAIR_QWEN_APPROVED: "true",
  VISION_REPAIR_QWEN_PAID_CALLS_APPROVED: "true",
  VISION_REPAIR_QWEN_DATA_SCOPE: QWEN_IMAGE_EDIT_DATA_SCOPE,
  VISION_REPAIR_QWEN_MODEL: QWEN_IMAGE_EDIT_MODEL_SNAPSHOT,
};

test("Qwen image edit fails closed before API key and paid-call authorization", () => {
  const readiness = getQwenImageEditReadiness({});
  assert.equal(readiness.adapterReady, true);
  assert.equal(readiness.liveReady, false);
  assert.ok(readiness.blockers.includes("API_KEY_NOT_CONFIGURED"));
  assert.ok(readiness.blockers.includes("PAID_CALL_APPROVAL_REQUIRED"));
  assert.throws(
    () => createGovernedQwenImageEditProvider({}),
    (error: unknown) =>
      error instanceof QwenImageEditProviderError &&
      error.code === "CONFIGURATION",
  );
});

test("Qwen image edit sends the candidate first, locks the model, and downloads the temporary output", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const provider = createGovernedQwenImageEditProvider(
    authorizedEnvironment,
    async (url, init) => {
      calls.push({ url: String(url), init });
      if (calls.length === 1) {
        return new Response(
          JSON.stringify({
            request_id: "req-image-edit-1",
            output: {
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: [
                      {
                        image:
                          "https://dashscope-result.oss-cn-beijing.aliyuncs.com/output.png?token=test",
                      },
                    ],
                  },
                },
              ],
            },
            usage: { image_count: 1, width: 1024, height: 1536 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    },
  );

  const result = await provider.edit({
    source: {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/jpeg",
    },
    references: [
      { bytes: new Uint8Array([4, 5, 6]), mimeType: "image/png" },
    ],
    prompt: "只修正右侧袖口结构，其他区域保持不变。",
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /^https:\/\/workspace-1234\.cn-beijing\.maas\.aliyuncs\.com\/api\/v1\//);
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("authorization"), "Bearer test-secret");
  const body = JSON.parse(String(calls[0].init?.body));
  assert.equal(body.model, QWEN_IMAGE_EDIT_MODEL_SNAPSHOT);
  assert.equal(body.parameters.n, 1);
  assert.equal(body.parameters.prompt_extend, false);
  assert.equal(body.parameters.watermark, false);
  assert.equal(body.input.messages[0].content[0].image.startsWith("data:image/jpeg;base64,"), true);
  assert.equal(body.input.messages[0].content[1].image.startsWith("data:image/png;base64,"), true);
  assert.match(body.input.messages[0].content[2].text, /第一张图是需要修正的 AI 模特草图/);
  assert.equal(JSON.stringify(body).includes("test-secret"), false);
  assert.equal(result.providerRequestId, "req-image-edit-1");
  assert.equal(result.outputBytes.byteLength, 4);
  assert.equal(result.outputMimeType, "image/png");
  assert.equal(result.outputWidth, 1024);
  assert.equal(result.outputHeight, 1536);
});

test("Qwen image edit rejects non-Aliyun output locations", async () => {
  const provider = new QwenImageEditProvider(
    "test-secret",
    "workspace-1234",
    async () =>
      new Response(
        JSON.stringify({
          request_id: "req-unsafe",
          output: {
            choices: [
              { message: { content: [{ image: "https://example.com/output.png" }] } },
            ],
          },
        }),
        { status: 200 },
      ),
  );
  await assert.rejects(
    () =>
      provider.edit({
        source: { bytes: new Uint8Array([1]), mimeType: "image/jpeg" },
        references: [],
        prompt: "修正袖口。",
      }),
    (error: unknown) =>
      error instanceof QwenImageEditProviderError &&
      error.code === "INVALID_OUTPUT",
  );
});
