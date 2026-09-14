import test from "node:test";
import assert from "node:assert/strict";
import { conversationPlan, type ConversationPlan } from "../lib/agent/conversation-contract.ts";
import { planConversation, planWithDeepSeek } from "../lib/agent/conversation-planner.ts";
import { TaskSessions } from "../lib/agent/task-session.ts";
import { createVisualTaskWorkflow } from "../lib/agent/task-workflow.ts";

const ready: ConversationPlan = { decision: "READY", summary: "检查并修正多余图案", question: "", preserve: ["保持纽扣数量"], changes: ["修正多余图案"] };
const input = { skuName: "灰色开衫", objective: "检查并修正图案，保留纽扣" };
const request = (id: string, parentId?: string) => ({ ...input, id: id.padEnd(16, "0"), parentId });
function fixture(plan = ready) {
  let calls = 0, prepares = 0, tools = 0;
  const sessions = new TaskSessions();
  const deps = {
    plan: async () => { calls++; return plan; },
    prepare: async () => { prepares++; return { approve: async (approved: boolean) => { if (approved) tools++; return { projectId: approved ? "project" : null, stopped: !approved }; } }; },
  };
  return { sessions, deps, counts: () => ({ calls, prepares, tools }) };
}

test("structured planner validates input before generator and never retries invalid output", async () => {
  let calls = 0;
  const generate = async () => { calls++; return {}; };
  await assert.rejects(planConversation({ ...input, objective: " " }, generate));
  assert.equal(calls, 0);
  await assert.rejects(planConversation(input, generate), /没有生成有效计划/);
  assert.equal(calls, 1);
});
test("ready, clarification and unsupported contracts are distinct; tool injection is rejected", () => {
  assert.equal(conversationPlan.safeParse(ready).success, true);
  assert.equal(conversationPlan.safeParse({ ...ready, decision: "CLARIFY" }).success, false);
  assert.equal(conversationPlan.safeParse({ ...ready, tool: "shell", command: "delete" }).success, false);
  assert.equal(conversationPlan.safeParse({ ...ready, changes: [] }).success, false);
});
test("public planner failure does not contain secret provider text", async () => {
  await assert.rejects(planConversation(input, async () => { throw new Error("SECRET_SENTINEL"); }), error => {
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /SECRET_SENTINEL/);
    return true;
  });
});
test("one valid proposal, one explicit approval and repeated click create exactly one project", async () => {
  const f = fixture(); const body = request("a");
  assert.equal((await f.sessions.create("tenant:user", body, f.deps)).status, "AWAITING_APPROVAL");
  assert.equal(f.counts().tools, 0);
  await f.sessions.create("tenant:user", body, f.deps);
  await Promise.all([f.sessions.act("tenant:user", body.id, "approve"), f.sessions.act("tenant:user", body.id, "approve")]);
  await f.sessions.act("tenant:user", body.id, "approve");
  assert.deepEqual(f.counts(), { calls: 1, prepares: 1, tools: 1 });
});
test("concurrent submission reserves the id before planning", async () => {
  const f = fixture(); const body = request("b");
  const [first, second] = await Promise.all([f.sessions.create("u", body, f.deps), f.sessions.create("u", body, f.deps)]);
  assert.equal(first.status, "AWAITING_APPROVAL"); assert.equal(second.status, "STARTING");
  assert.equal(f.counts().calls, 1);
});
test("tenant/user boundaries cover replay, list, approval and parent history", async () => {
  const f = fixture(); const body = request("c");
  await f.sessions.create("t:u", body, f.deps);
  assert.deepEqual(f.sessions.list("other:u"), []);
  await assert.rejects(f.sessions.create("other:u", body, f.deps), /不存在/);
  await assert.rejects(f.sessions.act("t:other", body.id, "approve"), /不存在/);
  await assert.rejects(f.sessions.create("other:u", request("d", body.id), f.deps), /不存在/);
});
test("changed request cannot reuse same id", async () => {
  const f = fixture(); const body = request("e");
  await f.sessions.create("u", body, f.deps);
  await assert.rejects(f.sessions.create("u", { ...body, objective: "other" }, f.deps), /已变更/);
  assert.equal(f.counts().calls, 1);
});
test("clarification and unsupported plans cannot execute project tool", async () => {
  for (const decision of ["CLARIFY", "UNSUPPORTED"] as const) {
    const f = fixture({ ...ready, decision, question: "想检查还是修改？" }); const body = request(decision);
    await f.sessions.create("u", body, f.deps);
    await f.sessions.act("u", body.id, "approve");
    assert.equal(f.counts().prepares, 0); assert.equal(f.counts().tools, 0);
    assert.equal((await f.sessions.act("u", body.id, "stop")).status, "STOPPED");
  }
});
test("revision carries only owner history and invalidates old approval even if new planning fails", async () => {
  const f = fixture(); const body = request("f");
  await f.sessions.create("u", body, f.deps);
  const second = await f.sessions.create("u", request("g", body.id), { ...f.deps, plan: async facts => {
    assert.equal(facts.history.length, 2);
    assert.equal(facts.history[0].content, input.objective);
    assert.match(facts.history[1].content, /保持纽扣数量/);
    throw new Error("failure");
  } });
  assert.equal(second.status, "FAILED");
  assert.equal((await f.sessions.act("u", body.id, "approve")).status, "SUPERSEDED");
  assert.equal(f.counts().tools, 0);
});
test("dialogue retains full history beyond six turns and has a finite forty-turn bound", async () => {
  const f = fixture(); let parentId: string | undefined;
  for (let i = 0; i < 40; i++) {
    const body = request(`turn-${i}-`, parentId);
    parentId = (await f.sessions.create("u", body, f.deps)).id;
  }
  await assert.rejects(f.sessions.create("u", request("overflow", parentId), f.deps), /40 轮/);
  assert.equal(f.counts().calls, 40);
});
test("stopping a ready workflow never creates a project", async () => {
  const f = fixture(); const body = request("stop");
  await f.sessions.create("u", body, f.deps);
  await f.sessions.act("u", body.id, "stop");
  await f.sessions.act("u", body.id, "approve");
  assert.equal(f.counts().tools, 0);
});

test("each root creates an isolated product conversation, even with identical names", async () => {
  const f = fixture();
  const a = await f.sessions.create("u", request("product-a"), f.deps);
  const b = await f.sessions.create("u", request("product-b"), f.deps);
  assert.notEqual(a.conversationId, b.conversationId);
  const child = await f.sessions.create("u", request("product-a-next", a.id), { ...f.deps, plan: async facts => {
    assert.equal(facts.history.length, 2);
    return ready;
  } });
  assert.equal(child.conversationId, a.conversationId);
});

test("continued dialogue reuses product after approval, rejection and another round", async () => {
  const f = fixture();
  const a = await f.sessions.create("u", request("product-ready"), f.deps);
  await f.sessions.act("u", a.id, "approve");
  const b = await f.sessions.create("u", request("next-requirement", a.id), f.deps);
  assert.equal(b.projectId, "project");
  assert.equal(b.conversationId, a.conversationId);
  await f.sessions.act("u", b.id, "stop");
  const c = await f.sessions.create("u", request("third-request", b.id), f.deps);
  await f.sessions.act("u", c.id, "approve");
  assert.deepEqual(f.counts(), { calls: 3, prepares: 1, tools: 1 });
  assert.equal(f.sessions.list("u")[0].status, "PROJECT_READY");
});

test("product identity is immutable and stale parent cannot fork the conversation", async () => {
  const f = fixture();
  const a = await f.sessions.create("u", request("immutable"), f.deps);
  await assert.rejects(f.sessions.create("u", { ...request("other-product", a.id), skuName: "另一个商品" }, f.deps), /只属于当前商品/);
  await f.sessions.act("u", a.id, "approve");
  await f.sessions.create("u", request("latest-product", a.id), f.deps);
  await assert.rejects(f.sessions.create("u", request("stale-product", a.id), f.deps), /更新的对话/);
  assert.equal(f.counts().calls, 2);
});

test("Mastra model + approval workflow integration uses one mocked request; upstream failures are not retried", async t => {
  const keys = {
    DEEPSEEK_API_KEY: "test-only-not-a-secret",
    VISIONQA_ORCHESTRATOR_DEEPSEEK_API_KEY: "test-only-not-a-secret",
    VISIONQA_ORCHESTRATOR_DEEPSEEK_APPROVED: "true",
    VISIONQA_ORCHESTRATOR_DEEPSEEK_PAID_CALLS_APPROVED: "true",
    VISIONQA_ORCHESTRATOR_DEEPSEEK_DATA_SCOPE: "STRUCTURED_REPAIR_FACTS_NO_IMAGES",
    VISIONQA_ORCHESTRATOR_DEEPSEEK_MODEL: "deepseek-v4-flash",
  };
  const previous = Object.fromEntries(Object.keys(keys).map(k => [k, process.env[k]]));
  Object.assign(process.env, keys);
  t.after(() => { for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  let calls = 0;
  let reject = false;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls++;
    assert.equal(String(url), "https://api.deepseek.com/chat/completions");
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, "deepseek-v4-flash");
    assert.notEqual(body.stream, true);
    assert.equal(body.tools, undefined);
    assert.equal(body.max_tokens, 1800);
    if (reject) return Response.json({ error: { message: "FAKE_PROVIDER_FAILURE" } }, { status: 503 });
    return Response.json({ id: "mock", object: "chat.completion", created: 1, model: body.model,
      choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(ready) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 },
    });
  });
  const sessions = new TaskSessions();
  let projects = 0;
  const body = request("integration");
  const task = await sessions.create("u", body, {
    plan: planWithDeepSeek,
    prepare: async facts => {
      const { workflow } = await createVisualTaskWorkflow(async () => { projects++; return "local-test-project"; });
      const run = await workflow.createRun();
      assert.equal((await run.start({ inputData: facts })).status, "suspended");
      return { approve: async approved => {
        const result = await run.resume({ step: "confirm-project", resumeData: { approved } });
        if (result.status !== "success") throw new Error("workflow failed");
        return result.result;
      } };
    },
  });
  assert.deepEqual(task.plan, ready);
  assert.equal(task.status, "AWAITING_APPROVAL");
  assert.equal(projects, 0);
  assert.equal((await sessions.act("u", body.id, "approve")).projectId, "local-test-project");
  await sessions.act("u", body.id, "approve");
  assert.equal(projects, 1);
  assert.equal(calls, 1);
  reject = true;
  await assert.rejects(planWithDeepSeek(input), /没有生成有效计划/);
  assert.equal(calls, 2);
});
