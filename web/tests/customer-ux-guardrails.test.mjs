import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const project = new URL("../app/customer/customer-project.tsx", import.meta.url);
const collab = new URL("../app/customer/collaboration-window.tsx", import.meta.url);
const shell = new URL("../app/customer/customer-shell.tsx", import.meta.url);
const workspace = new URL("../app/customer/customer-workspace.tsx", import.meta.url);
const styles = new URL("../app/customer/customer.css", import.meta.url);

const read = (url) => readFile(url, "utf8");

test("customer surfaces never expose provider, model or transport details", async () => {
  const sources = await Promise.all([read(project), read(collab), read(shell), read(workspace)]);
  const banned = [
    /qwen/i,
    /bailian|百炼/i,
    /dashscope/i,
    /openai|gpt-image/i,
    /provider/i,
    /HTTP\s?\d{3}/,
    /\bprompt\b/i,
  ];
  for (const source of sources) {
    for (const pattern of banned) {
      assert.equal(
        pattern.test(source),
        false,
        `customer source must not mention ${pattern}`,
      );
    }
  }
});

test("the download control is a real disabled button, never a link without a target", async () => {
  const source = await read(project);
  assert.equal(
    /href=\{allConfirmed \? [^}]*: undefined\}/.test(source),
    false,
    "a disabled anchor must not stand in for a button",
  );
  assert.match(source, /<button className="customer-primary" type="button" disabled/);
  assert.match(source, /勾选上面三项确认后才能下载/);
});

test("the problem region can be operated without a pointer", async () => {
  const source = await read(project);
  assert.match(source, /onKeyDown=\{keyDown\}/);
  assert.match(source, /tabIndex=\{0\}/);
  assert.match(source, /role="application"/);
  assert.equal(
    /role="img" aria-label="拖动框选问题区域"/.test(source),
    false,
    "an interactive region must not be announced as a static image",
  );
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    assert.match(source, new RegExp(`event\.key === "${key}"`));
  }
});

test("a batch that is running or failed stays visible instead of falling back to the upload form", async () => {
  const source = await read(project);
  assert.match(source, /const stage = delivery \|\| selectedItem \? 3 : batch \? 2 : 1;/);
  assert.match(source, /function BatchStatusPanel/);
  assert.match(source, /batch\.status === "RUNNING"/);
  assert.match(source, /本次筛查没有完成/);
  assert.match(source, /重新建立这批检查/);
});

test("an empty credit balance explains the next step instead of offering a dead button", async () => {
  const source = await read(project);
  assert.match(source, /当前没有可用内测额度，本次无法提交修正。/);
  assert.equal(
    /disabled=\{[^}]*credits\.available < 1[^}]*\}/.test(source),
    false,
    "the submit button must not be disabled while still promising an action",
  );
});

test("the collaboration window shows an empty state and never ships demo events", async () => {
  const source = await read(collab);
  assert.match(source, /尚未开始/);
  assert.equal(
    /const (DEMO|FIXTURE|SAMPLE|MOCK)_EVENTS/.test(source),
    false,
    "the window must not carry a built-in event fixture",
  );
  assert.equal(
    /dangerouslySetInnerHTML/.test(source),
    false,
    "the window must never render raw markup",
  );
});

test("collaboration events are derived only from real batch and repair records", async () => {
  const source = await read(project);
  assert.match(source, /function buildCollaborationEvents/);
  assert.match(source, /if \(!batch\) return \[\];/);
  for (const role of ["商品核对", "问题定位", "方案评审", "修正执行", "质量复验"]) {
    assert.match(source, new RegExp(role));
  }
  assert.match(source, /createdAt: batch\.createdAt/);
  assert.match(source, /createdAt: delivery\.attempt\.createdAt/);
});

test("the draggable collaboration window is constrained to the visible viewport", async () => {
  const source = await read(collab);
  assert.match(source, /function constrainPosition/);
  assert.match(source, /window\.innerWidth/);
  assert.match(source, /window\.innerHeight/);
  assert.match(source, /setPositionOverride\(constrainPosition\(proposed, dragOrigin\)\)/);
});

test("desktop and mobile collaboration-window preferences cannot make each other cover the primary action", async () => {
  const source = await read(collab);
  assert.match(source, /visionqa\.collab\.collapsed\.desktop/);
  assert.match(source, /visionqa\.collab\.collapsed\.mobile/);
  assert.match(source, /isNarrow \? storedMobileCollapsed : storedDesktopCollapsed/);
  assert.match(source, /isNarrow \? MOBILE_COLLAPSED_KEY : DESKTOP_COLLAPSED_KEY/);
});

test("primary-action links keep readable white text on the black button surface", async () => {
  const source = await read(styles);
  assert.match(source, /\.customer-shell a\.customer-primary,[\s\S]*color: var\(--paper\)/);
});

test("the invitation login keeps its complete responsive layout", async () => {
  const source = await read(styles);
  for (const selector of [
    ".invite-entry__brand",
    ".invite-entry__panel",
    ".invite-entry__copy h1",
    ".invite-entry__form",
    ".invite-entry__form > input",
    ".invite-entry__dev",
    ".invite-entry__fineprint",
  ]) {
    assert.match(source, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /@media \(max-width: 1024px\)[\s\S]*\.invite-entry__panel[\s\S]*grid-template-columns: 1fr/);
  assert.match(source, /@media \(max-width: 720px\)[\s\S]*\.invite-entry[\s\S]*padding: 0 16px/);
});

test("a delivered image can enter another repair round by customer click", async () => {
  const source = await read(project);
  assert.match(source, /retrySame=\{\(\) => \{/);
  assert.match(source, /setDelivery\(null\);[\s\S]*setIdempotencyKey\(crypto\.randomUUID\(\)\)/);
  assert.match(source, /onClick=\{retrySame\}>再次修正这张/);
  assert.match(source, /onClick=\{chooseAnother\}>处理其他图片/);
});

test("a failed repair click receives a fresh idempotency key before retry", async () => {
  const source = await read(project);
  assert.match(source, /const requestIdempotencyKey = error \? crypto\.randomUUID\(\) : idempotencyKey/);
  assert.match(source, /idempotency_key: requestIdempotencyKey/);
  assert.match(
    source,
    /catch \(cause\) \{[\s\S]*setError\(asCustomerError\(cause\)\);[\s\S]*setIdempotencyKey\(crypto\.randomUUID\(\)\);[\s\S]*fetch\("\/api\/credits"/,
  );
});
