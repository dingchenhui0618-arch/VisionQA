import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/visual-review/host/route.ts";
import { createVisualHostFixture } from "../lib/visionqa/m2-host-fixtures.ts";
import { createFixtureDraft } from "../lib/visionqa/providers/fixture.ts";
import { hostEvidenceSchemaVersion, parseHostEvidenceCapture } from "../lib/visionqa/host-evidence-v0.2.ts";

function realEvidenceCapture() {
  const base = createVisualHostFixture();
  return parseHostEvidenceCapture({
    ...base,
    schema_version: hostEvidenceSchemaVersion,
    host: { type: "chrome-extension", adapter_version: "0.2.0" },
    page: {
      ...base.page,
      revision_id: "route-rev-1",
      revision_source: "url-dom-summary",
    },
    dom: {
      ...base.dom,
      elements: [{
        id: "hero-title",
        selector: "main h1",
        tag: "h1",
        text: "视觉评审",
        rect: { x: 96, y: 120, width: 420, height: 76 },
        computed_style: { font_size: "48px", line_height: "1.1", color: "rgb(0, 0, 0)" },
        selected: true,
      }],
      selected_element: {
        id: "hero-title",
        selector: "main h1",
        tag: "h1",
        text: "视觉评审",
        rect: { x: 96, y: 120, width: 420, height: 76 },
        computed_style: { font_size: "48px", line_height: "1.1", color: "rgb(0, 0, 0)" },
        selected: true,
      },
    },
  });
}

test("localhost Host route accepts real-shaped v0.2 Chrome evidence and runs offline Mock", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    const capture = realEvidenceCapture();
    const response = await POST(new Request("http://localhost:6300/api/visual-review/host", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": capture.capture_id,
        origin: "chrome-extension://feogoghbmjhomolagjmddfodngfnldmp",
      },
      body: JSON.stringify({ provider: "mock", capture }),
    }));
    assert.equal(response.status, 200);
    const body = await response.json() as {
      contract?: { schema_version?: string; decision?: string; observations?: { review_mode?: string } };
      ui_result?: { schema_version?: string; revision_id?: string; preview_only?: boolean };
      provider?: { providerId?: string; warnings?: string[] };
      host_capture?: { schema_version?: string; dom_elements_received?: number; selected_element_received?: boolean; page_revision_id?: string };
    };
    assert.equal(body.contract?.schema_version, "visual-review-v0.2");
    assert.equal(body.contract?.decision, "NOT_ASSESSABLE");
    assert.equal(body.contract?.observations?.review_mode, "visual");
    assert.equal(body.ui_result?.schema_version, "visionqa-ui-v0.1");
    assert.equal(body.ui_result?.revision_id, "route-rev-1");
    assert.equal(body.ui_result?.preview_only, true);
    assert.equal(body.provider?.providerId, "fixture");
    assert.equal(body.host_capture?.schema_version, hostEvidenceSchemaVersion);
    assert.equal(body.host_capture?.dom_elements_received, 1);
    assert.equal(body.host_capture?.selected_element_received, true);
    assert.equal(body.host_capture?.page_revision_id, "route-rev-1");
    assert.equal(body.provider?.warnings?.includes("MOCK_RUNTIME_NO_PROVIDER_OR_NETWORK_CALL"), true);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("v0.2 Host route rejects auto when localhost real-provider gate is off", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    const capture = realEvidenceCapture();
    const response = await POST(new Request("http://localhost:6300/api/visual-review/host", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": `${capture.capture_id}-auto` },
      body: JSON.stringify({ provider: "auto", capture }),
    }));
    assert.equal(response.status, 503);
    const body = await response.json() as { error?: { code?: string; retryable?: boolean } };
    assert.equal(body.error?.code, "VISUAL_REVIEW_CONFIGURATION");
    assert.equal(body.error?.retryable, false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("v0.2 Host route sends auto evidence through the server multimodal adapter without network", async () => {
  const envKeys = [
    "NODE_ENV",
    "VISION_LOCAL_CANARY_ALLOW_LOCALHOST",
    "VISION_MULTIMODAL_ENABLED",
    "VISION_MULTIMODAL_API_KEY",
    "VISION_MULTIMODAL_ENDPOINT",
    "VISION_MULTIMODAL_MODEL",
    "VISION_MULTIMODAL_PROVIDER_ID",
    "VISION_MULTIMODAL_MAX_TOTAL_REQUESTS",
  ] as const;
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  let seenBody = "";
  process.env.NODE_ENV = "development";
  process.env.VISION_LOCAL_CANARY_ALLOW_LOCALHOST = "true";
  process.env.VISION_MULTIMODAL_ENABLED = "true";
  process.env.VISION_MULTIMODAL_API_KEY = "test-only-route-key";
  process.env.VISION_MULTIMODAL_ENDPOINT = "https://example.invalid/v1/chat/completions";
  process.env.VISION_MULTIMODAL_MODEL = "test-route-vision";
  process.env.VISION_MULTIMODAL_PROVIDER_ID = "test-route-provider";
  process.env.VISION_MULTIMODAL_MAX_TOTAL_REQUESTS = "15";
  globalThis.fetch = (async (_input, init) => {
    seenBody = String(init?.body ?? "");
    return new Response(JSON.stringify({
      id: "fake-route-provider-request",
      model: "test-route-vision",
      choices: [{ message: { content: JSON.stringify(createFixtureDraft()) } }],
      usage: { prompt_tokens: 10, completion_tokens: 8 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const capture = { ...realEvidenceCapture(), capture_id: `route-auto-${Date.now()}` };
    const response = await POST(new Request("http://localhost:6300/api/visual-review/host", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": `${capture.capture_id}-auto` },
      body: JSON.stringify({ provider: "auto", capture }),
    }));
    assert.equal(response.status, 200);
    const body = await response.json() as {
      contract?: { schema_version?: string };
      ui_result?: { preview_only?: boolean };
      provider?: { providerId?: string };
    };
    assert.equal(body.contract?.schema_version, "visual-review-v0.2");
    assert.equal(body.ui_result?.preview_only, false);
    assert.equal(body.provider?.providerId, "test-route-provider");
    assert.match(seenBody, /data:image\/png;base64,/);
    assert.equal(seenBody.includes("test-only-route-key"), false);
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of envKeys) {
      const value = previousEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
