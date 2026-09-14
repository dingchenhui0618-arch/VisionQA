import { IntakeError, conversationInput, conversationPlan, type ConversationInput, type ConversationPlan, type TaskView } from "./conversation-contract.ts";
import type { StateStore } from "../beta/local-state.ts";

type Run = { approve: (approved: boolean) => Promise<{ projectId: string | null; stopped: boolean }> };
type Entry = { owner: string; view: TaskView; history: ConversationInput["history"]; run?: Run; busy: boolean };
type Dependencies = {
  plan: (input: ConversationInput) => Promise<ConversationPlan>;
  prepare: (input: { skuName: string; objective: string; conversationId: string }) => Promise<Run>;
};
export class TaskSessionError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

// Single-process prototype with optional local snapshots. Owner comes from server authentication.
export class TaskSessions {
  private entries = new Map<string, Entry>();
  private storage?: StateStore;
  constructor(storage?: StateStore) {
    this.storage = storage;
    const snapshot = storage?.load() as { version: number; entries: Array<[string, Omit<Entry, "run">]> } | null;
    if (snapshot) {
      if (snapshot.version !== 1 || !Array.isArray(snapshot.entries)) throw new Error("Invalid conversation snapshot");
      for (const [id, saved] of snapshot.entries) {
        if (saved.view.id !== id || !saved.owner || !Array.isArray(saved.history)) throw new Error("Invalid conversation entry");
        if (saved.busy || saved.view.status === "STARTING") {
          saved.view.status = "FAILED";
          saved.view.error = "开发服务在任务期间中断。记录已恢复，不会自动重复调用模型；请检查已有项目后手动继续。";
        }
        this.entries.set(id, { ...saved, busy: false });
      }
    }
  }
  private persist() {
    this.storage?.save({ version: 1, entries: [...this.entries].map(([id, e]) => [id, { owner: e.owner, view: e.view, history: e.history, busy: e.busy }]) });
  }
  list(owner: string) { return [...this.entries.values()].filter(e => e.owner === owner).map(e => ({ ...e.view })); }

  async create(owner: string, body: { id: string; parentId?: string; skuName: string; objective: string }, deps: Dependencies) {
    if (typeof body.id !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(body.id)) throw new TaskSessionError("任务编号无效。");
    const existing = this.entries.get(body.id);
    if (existing) {
      if (existing.owner !== owner) throw new TaskSessionError("任务不存在。", 404);
      if (existing.view.skuName !== body.skuName.trim() || existing.view.objective !== body.objective.trim() || existing.view.parentId !== (body.parentId ?? null)) {
        throw new TaskSessionError("任务内容已变更，请重新提交。", 409);
      }
      return { ...existing.view };
    }
    const parent = body.parentId ? this.entries.get(body.parentId) : undefined;
    if (body.parentId && (!parent || parent.owner !== owner)) throw new TaskSessionError("原任务不存在。", 404);
    if (parent && (parent.busy || !["NEEDS_INPUT", "UNSUPPORTED", "AWAITING_APPROVAL", "FAILED", "PROJECT_READY", "STOPPED"].includes(parent.view.status))) {
      throw new TaskSessionError("原任务已变化，请刷新后继续。", 409);
    }
    if (parent && body.skuName.trim() !== parent.view.skuName) throw new TaskSessionError("这个对话只属于当前商品。其他商品请新建对话。", 409);
    if (parent && [...this.entries.values()].some(e => e.view.parentId === parent.view.id)) throw new TaskSessionError("该商品已有更新的对话，请刷新后继续。", 409);
    const history = parent ? [...parent.history,
      { role: "user" as const, content: parent.view.objective },
      { role: "assistant" as const, content: parent.view.plan ? JSON.stringify(parent.view.plan) : "上次计划未生成，请重新理解需求。" },
    ] : [];
    // Keep full source history; never silently drop old constraints to accept more messages.
    if (history.length > 78 || history.reduce((size, message) => size + message.content.length, body.objective.length) > 24000) {
      throw new TaskSessionError("当前商品上下文达到本地安全上限（40 轮或 24000 字）。历史已保留；需整理并确认商品摘要后再继续，系统不会悄悄遗忘旧要求。");
    }
    const parsed = conversationInput.safeParse({ skuName: body.skuName, objective: body.objective, history });
    if (!parsed.success) throw new TaskSessionError("请填写 SKU 名称和任务目标，目标最多 2000 字。");
    if (this.entries.size >= 100) throw new TaskSessionError("本地任务容量已满，请保留结果后重启开发服务。", 429);
    const entry: Entry = { owner, history, busy: true, view: {
      id: body.id, conversationId: parent?.view.conversationId ?? body.id, parentId: body.parentId ?? null, skuName: parsed.data.skuName, objective: parsed.data.objective,
      status: "STARTING", projectId: parent?.view.projectId ?? null, plan: null, error: null,
    } };
    // Reserve synchronously before the first await; a revised plan invalidates its predecessor.
    this.entries.set(body.id, entry);
    if (parent && parent.view.status === "AWAITING_APPROVAL") parent.view.status = "SUPERSEDED";
    this.persist();
    try {
      const plan = conversationPlan.parse(await deps.plan(parsed.data));
      entry.view.plan = plan;
      if (plan.decision === "READY") {
        const projectId = entry.view.projectId;
        entry.run = projectId ? { approve: async approved => ({ projectId, stopped: !approved }) }
          : await deps.prepare({ skuName: parsed.data.skuName, objective: plan.summary, conversationId: entry.view.conversationId });
        entry.view.status = "AWAITING_APPROVAL";
      } else entry.view.status = plan.decision === "CLARIFY" ? "NEEDS_INPUT" : "UNSUPPORTED";
    } catch (error) {
      entry.view.status = "FAILED";
      entry.view.error = error instanceof IntakeError ? error.message : "计划没有完成，未执行修图、未扣修图额度。需求已保留，可补充说明或手动重试。";
    } finally { entry.busy = false; }
    this.persist();
    return { ...entry.view };
  }

  async act(owner: string, id: string, action: "approve" | "stop", prepare?: Dependencies["prepare"]) {
    const entry = this.entries.get(id);
    if (!entry || entry.owner !== owner) throw new TaskSessionError("任务不存在或开发服务已重启。", 404);
    if (entry.busy) return { ...entry.view };
    if (action === "stop" && ["NEEDS_INPUT", "UNSUPPORTED", "FAILED"].includes(entry.view.status)) {
      entry.view.status = "STOPPED";
      this.persist();
      return { ...entry.view };
    }
    if (entry.view.status !== "AWAITING_APPROVAL") return { ...entry.view };
    entry.busy = true;
    this.persist();
    try {
      if (!entry.run) {
        const projectId = entry.view.projectId;
        if (projectId) entry.run = { approve: async approved => ({ projectId, stopped: !approved }) };
        else if (prepare && entry.view.plan) entry.run = await prepare({ skuName: entry.view.skuName, objective: entry.view.plan.summary, conversationId: entry.view.conversationId });
        else throw new Error("Missing workflow restorer");
      }
      const result = await entry.run.approve(action === "approve");
      entry.view.projectId = result.projectId;
      entry.view.status = result.stopped ? "STOPPED" : "PROJECT_READY";
    } catch {
      entry.view.status = "FAILED";
      entry.view.error = "项目建立未完成。请先查看原工作台，避免重复建立项目。";
    } finally { entry.busy = false; }
    this.persist();
    return { ...entry.view };
  }
}
