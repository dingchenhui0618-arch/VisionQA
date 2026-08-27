import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateQwenImage3OutputSize,
  createQwenImage3Provider,
  getQwenImage3Readiness,
  QWEN_IMAGE_3_DATA_SCOPE,
  QWEN_IMAGE_3_MODEL,
  QWEN_IMAGE_3_NEGATIVE_PROMPT_MAX_CHARS,
  QWEN_IMAGE_3_PROVIDER_ID,
  QwenImage3Provider,
  QwenImage3ProviderError,
} from "../lib/visionqa/providers/qwen-image-3.ts";

const configuredEnvironment = {
  VISION_REPAIR_QWEN_API_KEY: "test-only-secret",
  VISION_REPAIR_QWEN_WORKSPACE_ID: "workspace-1234",
  VISION_REPAIR_QWEN_APPROVED: "true",
  VISION_REPAIR_QWEN_PAID_CALLS_APPROVED: "true",
  VISION_REPAIR_QWEN_DATA_SCOPE: QWEN_IMAGE_3_DATA_SCOPE,
  VISION_REPAIR_QWEN_MODEL: QWEN_IMAGE_3_MODEL,
};

const source = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" as const };
const reference = { bytes: new Uint8Array([4, 5, 6]), mimeType: "image/png" as const };

function validInput() {
  return {
    source,
    references: [reference],
    prompt: "仅修正左胸贴花边缘，使其与图2的商品真值一致。",
    negativePrompt: "不要裁切人物，不要改变人物、背景、构图、Logo以外区域。",
    sourceWidth: 4000,
    sourceHeight: 3000,
  };
}

test("Qwen Image 3 readiness fails closed without reading images and lists every approval blocker", () => {
  const readiness = getQwenImage3Readiness({});
  assert.equal(readiness.liveReady, false);
  assert.deepEqual(readiness.blockers, [
    "API_KEY_NOT_CONFIGURED",
    "WORKSPACE_NOT_CONFIGURED",
    "PROVIDER_APPROVAL_REQUIRED",
    "PAID_CALL_APPROVAL_REQUIRED",
    "DATA_SCOPE_NOT_APPROVED",
    "MODEL_SNAPSHOT_NOT_LOCKED",
  ]);
  assert.throws(
    () => createQwenImage3Provider({}),
    (error: unknown) => error instanceof QwenImage3ProviderError && error.code === "CONFIGURATION",
  );
});

test("Qwen Image 3 accepts dedicated settings or an already-authorized generic Qwen gate", () => {
  assert.equal(getQwenImage3Readiness(configuredEnvironment).liveReady, true);
  assert.equal(getQwenImage3Readiness({
    VISION_REPAIR_QWEN_IMAGE_3_API_KEY: "dedicated-test-secret",
    VISION_REPAIR_QWEN_IMAGE_3_WORKSPACE_ID: "workspace-5678",
    VISION_REPAIR_QWEN_IMAGE_3_APPROVED: "true",
    VISION_REPAIR_QWEN_IMAGE_3_PAID_CALLS_APPROVED: "true",
    VISION_REPAIR_QWEN_IMAGE_3_DATA_SCOPE: QWEN_IMAGE_3_DATA_SCOPE,
    VISION_REPAIR_QWEN_IMAGE_3_MODEL: QWEN_IMAGE_3_MODEL,
  }).liveReady, true);
  assert.throws(
    () => new QwenImage3Provider("", "workspace-1234"),
    (error: unknown) => error instanceof QwenImage3ProviderError && error.code === "CONFIGURATION",
  );
});

test("Qwen Image 3 rejects reference overflow and invalid source dimensions before dispatch", async () => {
  let calls = 0;
  const provider = createQwenImage3Provider(configuredEnvironment, async () => {
    calls += 1;
    return new Response("not reached", { status: 500 });
  });
  await assert.rejects(
    () => provider.edit({ ...validInput(), references: [reference, reference, reference] }),
    (error: unknown) => error instanceof QwenImage3ProviderError && error.code === "INVALID_INPUT",
  );
  await assert.rejects(
    () => provider.edit({ ...validInput(), sourceWidth: 0 }),
    (error: unknown) => error instanceof QwenImage3ProviderError && error.code === "INVALID_INPUT",
  );
  assert.equal(calls, 0);
});

test("Qwen Image 3 rejects negative prompts beyond the official 500-character limit before dispatch", async () => {
  let calls = 0;
  const provider = createQwenImage3Provider(configuredEnvironment, async () => {
    calls += 1;
    return new Response("not reached", { status: 500 });
  });
  await assert.rejects(
    () => provider.edit({
      ...validInput(),
      negativePrompt: "不".repeat(QWEN_IMAGE_3_NEGATIVE_PROMPT_MAX_CHARS + 1),
    }),
    (error: unknown) => error instanceof QwenImage3ProviderError && error.code === "INVALID_INPUT",
  );
  assert.equal(calls, 0);
});

test("Qwen Image 3 scales 4K source dimensions to the 2K pixel budget and preserves ratio", () => {
  const size = calculateQwenImage3OutputSize(4096, 4096);
  assert.deepEqual(size, { width: 2048, height: 2048, value: "2048*2048" });
  const wide = calculateQwenImage3OutputSize(4000, 3000);
  assert.ok(wide.width * wide.height <= 2048 * 2048);
  assert.ok(Math.abs(wide.width / wide.height - 4 / 3) < 0.001);
  assert.throws(
    () => calculateQwenImage3OutputSize(9, 100),
    (error: unknown) => error instanceof QwenImage3ProviderError && error.code === "INVALID_INPUT",
  );
});

test("Qwen Image 3 sends the candidate as image 1 with explicit 2K parameters and parses official usage fields", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const provider = createQwenImage3Provider(configuredEnvironment, async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) {
      return new Response(JSON.stringify({
        request_id: "qwen3-request-1",
        output: { choices: [{ message: { content: [{ image: "https://dashscope-result.oss-cn-beijing.aliyuncs.com/result.png?temporary=yes" }] } }] },
        usage: { output_image_count: 1, output_width: 2364, output_height: 1773 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  });

  const result = await provider.edit(validInput());
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /^https:\/\/workspace-1234\.cn-beijing\.maas\.aliyuncs\.com\/api\/v1\//);
  const body = JSON.parse(String(calls[0].init?.body));
  assert.equal(body.model, QWEN_IMAGE_3_MODEL);
  assert.equal(body.parameters.size, "2364*1773");
  assert.equal(body.parameters.n, 1);
  assert.equal(body.parameters.prompt_extend, false);
  assert.equal(body.parameters.watermark, false);
  assert.equal(body.parameters.negative_prompt, validInput().negativePrompt);
  assert.ok(body.input.messages[0].content[0].image.startsWith("data:image/jpeg;base64,"));
  assert.ok(body.input.messages[0].content[1].image.startsWith("data:image/png;base64,"));
  assert.match(body.input.messages[0].content[2].text, /图1是唯一待修/);
  assert.equal(JSON.stringify(body).includes(configuredEnvironment.VISION_REPAIR_QWEN_API_KEY), false);
  assert.equal(calls[1].init?.method, "GET");
  assert.equal(calls[1].init?.redirect, "error");
  assert.equal(result.providerId, QWEN_IMAGE_3_PROVIDER_ID);
  assert.equal(result.providerRequestId, "qwen3-request-1");
  assert.equal(result.imageCount, 1);
  assert.equal(result.outputWidth, 2364);
  assert.equal(result.outputHeight, 1773);
  assert.equal(result.outputMimeType, "image/png");
  assert.equal(result.outputBytes.byteLength, 4);
});

test("Qwen Image 3 maps business errors and never auto-retries them", async () => {
  let calls = 0;
  const provider = createQwenImage3Provider(configuredEnvironment, async () => {
    calls += 1;
    return new Response(JSON.stringify({ code: "Throttling.RateQuota" }), { status: 200 });
  });
  await assert.rejects(
    () => provider.edit(validInput()),
    (error: unknown) => error instanceof QwenImage3ProviderError && error.code === "RATE_LIMITED",
  );
  assert.equal(calls, 1);
});

test("Qwen Image 3 rejects an unapproved result URL before download", async () => {
  let calls = 0;
  const provider = createQwenImage3Provider(configuredEnvironment, async () => {
    calls += 1;
    return new Response(JSON.stringify({
      request_id: "qwen3-unsafe",
      output: { choices: [{ message: { content: [{ image: "https://attacker.example/output.png" }] } }] },
    }), { status: 200 });
  });
  await assert.rejects(
    () => provider.edit(validInput()),
    (error: unknown) => error instanceof QwenImage3ProviderError && error.code === "INVALID_OUTPUT",
  );
  assert.equal(calls, 1);
});

test("Qwen Image 3 maps unknown official usage fields to null", async () => {
  let calls = 0;
  const provider = createQwenImage3Provider(configuredEnvironment, async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({
        request_id: "qwen3-unknown-usage",
        output: { choices: [{ message: { content: [{ image: "https://dashscope-result.oss-cn-beijing.aliyuncs.com/result.png" }] } }] },
        usage: {},
      }), { status: 200 });
    }
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  });
  const result = await provider.edit(validInput());
  assert.equal(result.imageCount, null);
  assert.equal(result.outputWidth, null);
  assert.equal(result.outputHeight, null);
});

test("Qwen Image 3 fails closed when the approved output download is invalid", async () => {
  let calls = 0;
  const provider = createQwenImage3Provider(configuredEnvironment, async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({
        request_id: "qwen3-download-failure",
        output: { choices: [{ message: { content: [{ image: "https://dashscope-result.oss-cn-beijing.aliyuncs.com/result.png" }] } }] },
        usage: {},
      }), { status: 200 });
    }
    return new Response("not an image", { status: 200, headers: { "content-type": "text/plain" } });
  });
  await assert.rejects(
    () => provider.edit(validInput()),
    (error: unknown) => error instanceof QwenImage3ProviderError && error.code === "INVALID_OUTPUT",
  );
  assert.equal(calls, 2);
});
