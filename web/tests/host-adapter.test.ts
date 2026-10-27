import assert from "node:assert/strict";
import test from "node:test";
import { dataUrlBytes, hostCaptureToVisualReviewRequest, parseHostCapture } from "../lib/visionqa/host-adapter-contract.ts";

const capture = () => parseHostCapture({
  schema_version: "visionqa-host-capture-v0.1",
  capture_id: "capture-1",
  conversation_id: "conversation-1",
  host: { type: "chrome-extension", adapter_version: "0.1.0" },
  page: { url: "https://example.com/product", title: "商品页", viewport: { width: 1440, height: 900, device_scale_factor: 1 } },
  dom: { text: "商品标题和购买按钮", headings: ["商品标题"], landmarks: ["main", "nav"], interactive_summary: "交互元素：购买" },
  conversation: [{ role: "user", content: "只检查首屏层级" }],
  intent: { goal: "检查当前页面的视觉层级", audience: "第一次访问的用户", must_keep: ["品牌标识"] },
  images: [{ role: "candidate", name: "visible.png", mime_type: "image/png", data_url: "data:image/png;base64,ZmFrZQ==" }],
  permissions: { can_call_model: true, can_read_source: false, can_write_source: false },
});

test("host capture maps screenshot, DOM and conversation into one VisualReview request", () => {
  const value = capture();
  const request = hostCaptureToVisualReviewRequest(value);
  assert.equal(request.host.type, "chrome-extension");
  assert.equal(request.artifact.type, "web_page");
  assert.equal(request.artifact.screenshot_ref, "host://current-visible-tab");
  assert.equal(request.permissions?.can_write_source, false);
  assert.deepEqual(request.constraints?.must_keep, ["品牌标识"]);
  assert.deepEqual(Array.from(dataUrlBytes(value.images[0].data_url)), [102, 97, 107, 101]);
});

test("host capture rejects source-write permission even when a client asks for it", () => {
  assert.throws(() => parseHostCapture({ ...capture(), permissions: { can_call_model: true, can_read_source: true, can_write_source: true } }), /permissions|Unrecognized|write/i);
});
