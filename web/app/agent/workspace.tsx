"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { TaskView } from "../../lib/agent/conversation-contract";
import "./workspace.css";
import { MaterialPanel } from "./material-panel";

type Task = TaskView;
const labels: Record<Task["status"], string> = { STARTING: "正在理解需求", NEEDS_INPUT: "等你补充", UNSUPPORTED: "暂不支持这项任务", AWAITING_APPROVAL: "等待你确认", PROJECT_READY: "项目已建立", STOPPED: "已停止", SUPERSEDED: "已由新计划替代", FAILED: "任务未完成" };

export function AgentWorkspace() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [objective, setObjective] = useState("");
  const [skuName, setSkuName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try { setTheme(localStorage.getItem("visionqa-agent-theme") === "light" ? "light" : "dark"); } catch { /* Session-only theme when storage is unavailable. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("visionqa-agent-theme", next); } catch { /* Switching still works without persistence. */ }
  }
  const [needsLogin, setNeedsLogin] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const drafts = useRef<Record<string, string>>({});
  const lock = useRef(false);
  const pendingId = useRef<string | null>(null);
  const pendingRequest = useRef<object | null>(null);
  const conversations = tasks.filter(t => !t.parentId);
  const visibleTasks = tasks.filter(t => t.conversationId === selected);
  const current = visibleTasks.at(-1);
  const continuing = Boolean(current);
  function selectConversation(id: string | null) {
    drafts.current[selected ?? "new"] = objective;
    setSelected(id); setObjective(drafts.current[id ?? "new"] ?? "");
    pendingId.current = null; pendingRequest.current = null; setError("");
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("conversation", id); else url.searchParams.delete("conversation");
    window.history.replaceState(null, "", url);
  }
  const working = busy || current?.status === "STARTING";
  useEffect(() => {
    let alive = true;
    let initialized = false;
    let refreshing = false;
    let wasUnauthorized = false;
    const refresh = () => fetch("/api/local-agent/tasks").then(async r => ({ ...await r.json(), unauthorized: r.status === 401 })).then(p => {
      if (!alive) return;
      if (!initialized) { setSelected(new URL(window.location.href).searchParams.get("conversation")); initialized = true; }
      setNeedsLogin(p.unauthorized);
      if (p.error) { setError(p.error); if (p.unauthorized && !wasUnauthorized) { setTasks([]); drafts.current = {}; setObjective(""); } }
      else { setTasks(p.tasks); setError(""); }
      wasUnauthorized = p.unauthorized;
    }).catch(() => { if (alive) setError("无法读取本地任务，请刷新重试。"); });
    const reload = () => {
      if (refreshing || lock.current) return;
      refreshing = true;
      void refresh().finally(() => { refreshing = false; });
    };
    reload();
    window.addEventListener("focus", reload);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") reload(); }, 3000);
    return () => { alive = false; window.removeEventListener("focus", reload); window.clearInterval(interval); };
  }, []);
  async function send(action: "create" | "approve" | "stop", retry = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    if (action === "create") pendingId.current ??= crypto.randomUUID();
    try {
      const request = { action, id: action === "create" ? pendingId.current : current?.id, parentId: action === "create" && continuing ? current?.id : undefined, objective: retry ? current?.objective : objective, skuName: continuing ? current?.skuName : skuName };
      if (action === "create") pendingRequest.current ??= request;
      const response = await fetch("/api/local-agent/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action === "create" ? pendingRequest.current : request) });
      const payload = await response.json();
      if (response.status === 401) setNeedsLogin(true);
      if (!response.ok) throw new Error(payload.error ?? "任务没有提交成功。");
      setTasks(old => [...old.filter(t => t.id !== payload.task.id).map(t => t.id === payload.task.parentId && t.status === "AWAITING_APPROVAL" ? { ...t, status: "SUPERSEDED" as const } : t), payload.task]);
      if (action === "create") {
        pendingId.current = null; pendingRequest.current = null; setObjective("");
        drafts.current[selected ?? "new"] = "";
        setSelected(payload.task.conversationId);
        const url = new URL(window.location.href); url.searchParams.set("conversation", payload.task.conversationId); window.history.replaceState(null, "", url);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "连接未完成，请重试。"); }
    finally { lock.current = false; setBusy(false); }
  }
  function suggest(text: string) {
    setObjective(text); pendingId.current = null; pendingRequest.current = null;
    document.getElementById("agent-goal")?.focus();
  }
  return <main className="agent-lab" data-theme={theme}>
    <nav className="agent-lab__sidebar" aria-label="商品对话">
      <Link className="agent-lab__brand" href="/">VisionQA</Link>
      <button className="agent-lab__new" disabled={busy} onClick={() => selectConversation(null)}><span aria-hidden="true">＋</span> 新商品对话</button>
      <a className="agent-lab__navlink" href="/workspace"><span aria-hidden="true">▧</span> 素材工作台</a>
      <details className="agent-lab__capabilities"><summary>◇ 能力范围</summary><p>已接入：商品图需求规划、素材与筛查、修图对比和多轮版本选择。</p><p>信息流脚本修正、视觉方向：尚待接入。</p></details>
      <div className="agent-lab__products"><h2>商品对话历史</h2>
        {!conversations.length && <p>从你的第一个商品开始</p>}
        {conversations.map(t => <button key={t.id} aria-current={selected === t.conversationId ? "page" : undefined} disabled={busy} onClick={() => selectConversation(t.conversationId)}>{t.skuName}<small>{tasks.filter(item => item.conversationId === t.conversationId).length} 轮对话</small></button>)}
      </div>
      <div className="agent-lab__sidebar-bottom">
        <details><summary>ⓘ 本地原型说明</summary><p>每个商品独立上下文。本地持久化模式下，新对话、关联项目和素材在服务重启后可恢复；中断任务不会自动重跑。当前上限为 40 轮或 24000 字，达到上限会提示，不会静默遗忘旧要求。模型建议不是商品事实，图片结果仍需人工确认。</p></details>
        <small>本地体验 · 不连接线上项目</small>
        <a href="/login" target="_blank" rel="noreferrer">{needsLogin ? "登录本地体验账号 ↗" : "账号入口 ↗"}</a>
      </div>
    </nav>
    <section className={`agent-lab__main ${current ? "has-conversation" : "is-empty"}`} aria-label="商品任务对话">
      <div className="agent-lab__topline"><span>{current?.skuName ?? "新商品对话"}</span><button className="secondary" onClick={toggleTheme} aria-label="切换黑白主题" aria-pressed={theme === "light"}>{theme === "dark" ? "◐ 切换白色" : "◑ 切换黑色"}</button></div>
      <div className="agent-lab__stage">
        <div className="agent-lab__identity"><div className="agent-lab__mark" aria-hidden="true">VQ</div><div><h1>{current?.skuName ?? "你的电商视觉助手"}</h1><p>{current ? "一个商品，一段持续协作的对话" : "从一件商品出发，把视觉想法变成可交付的内容。"}</p></div><span className="agent-lab__mode">商品图评审 · 规划</span></div>
        {visibleTasks.length > 0 && <div className="agent-lab__history" aria-live="polite">
          {visibleTasks.map(task => <article key={task.id}><div className="agent-lab__user"><small>你</small><p>{task.objective}</p></div><div className="agent-lab__answer"><small>VisionQA · {labels[task.status]}</small>{task.plan && <><p>{task.plan.summary}</p>{task.plan.question && <p><strong>{task.plan.question}</strong></p>}</>}{task.error && <p role="status">{task.error}</p>}{task.status === "STARTING" && <p>正在整理你的需求…</p>}</div></article>)}
        </div>}
        {current?.plan && <details className="agent-lab__plan" key={current.id} open={current.status === "AWAITING_APPROVAL"}>
          <summary>本轮计划 <span>{labels[current.status]}</span></summary>
          <h3>处理目标</h3><ul>{current.plan.changes.map((text, i) => <li key={i}>{text}</li>)}</ul>
          <h3>保持不变</h3>{current.plan.preserve.length ? <ul>{current.plan.preserve.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p>尚未指定，需要结合商品资料确认。</p>}
          <p>{current.projectId ? "沿用已有商品项目；确认计划不会自动修图。" : "确认只建立商品项目，不发送图片、不扣修图额度。"}</p>
          {current.status === "AWAITING_APPROVAL" && <div className="agent-lab__actions"><button disabled={working || Boolean(objective.trim())} onClick={() => void send("approve")}>{current.projectId ? "确认本轮计划" : "确认，建立商品项目"}</button><button className="secondary" disabled={working} onClick={() => void send("stop")}>暂不执行</button>{objective.trim() && <p>已有补充要求，请先发送后再确认。</p>}</div>}
        </details>}
        {current?.projectId && <><MaterialPanel key={current.projectId} projectId={current.projectId} skuName={current.skuName} onDiscuss={suggest} /><a className="agent-lab__project" href={`/workspace/projects/${current.projectId}`}>打开传统工作区 ↗</a></>}
        {current && ["NEEDS_INPUT", "UNSUPPORTED", "FAILED"].includes(current.status) && <div className="agent-lab__actions">
          {current.status === "FAILED" && <button disabled={working || Boolean(objective.trim())} onClick={() => { pendingId.current = null; pendingRequest.current = null; void send("create", true); }}>重新生成计划</button>}
          <button className="secondary" disabled={working} onClick={() => void send("stop")}>结束本轮任务</button>
        </div>}
        {error && <div className="agent-lab__error" role="alert">{error}{needsLogin && <a href="/login" target="_blank" rel="noreferrer">登录后返回此页 ↗</a>}</div>}
        <form className="agent-lab__composer" onSubmit={event => { event.preventDefault(); void send("create"); }}>
          {!continuing && <div className="agent-lab__product-input"><label htmlFor="agent-sku">商品</label><input id="agent-sku" required disabled={working} maxLength={100} value={skuName} onChange={e => { setSkuName(e.target.value); pendingId.current = null; pendingRequest.current = null; }} placeholder="给这件商品起个名字" /></div>}
          <label className="agent-lab__sr-only" htmlFor="agent-goal">告诉我你想为这个商品完成什么</label>
          <textarea id="agent-goal" required disabled={working} maxLength={2000} value={objective} onChange={e => { setObjective(e.target.value); pendingId.current = null; pendingRequest.current = null; }} placeholder={continuing ? "继续补充要求，或告诉我这版计划哪里需要调整…" : "想为你的商品做些什么？例如，检查模特图，修正多余图案，保持颜色和纽扣不变。"} />
          <div className="agent-lab__composer-bar"><span>◇ {current ? "仅当前商品上下文" : "一个对话 · 一个商品"}</span><button className="agent-lab__send" disabled={working || needsLogin} type="submit" aria-label={working ? "正在处理" : "发送需求"} title={working ? "正在处理" : "发送需求"}>{working ? "…" : "↑"}</button></div>
        </form>
        {!current && <div className="agent-lab__starters" aria-label="快速填写需求">
          <button disabled={working} onClick={() => suggest("帮我检查这组商品图是否与商品参考一致，先指出最需要处理的问题。")}>▧ 检查商品图</button>
          <button disabled={working} onClick={() => suggest("帮我规划这张图的局部修正，只修改问题区域，保持商品颜色、结构和构图不变。")}>⌖ 定向修图</button>
          <button disabled={working} onClick={() => suggest("帮我检查这组商品图的颜色、图案和配件数量是否一致，信息不足时请明确指出。")}>◇ 一致性评审</button>
        </div>}
        <p className="agent-lab__notice">发送文字会调用规划模型并产生接口费用，不扣修图额度。图片仅在你确认并点击筛查时发送，请勿填写密钥或个人隐私。</p>
      </div>
      <footer>AI 建议需要你的确认。商品事实与最终交付，请以真实资料和人工复验为准。</footer>
    </section>
  </main>;
}
