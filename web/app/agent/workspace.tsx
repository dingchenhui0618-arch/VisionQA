"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { TaskView } from "../../lib/agent/conversation-contract";
import "./workspace.css";

type Task = TaskView;
const labels: Record<Task["status"], string> = { STARTING: "正在理解需求", NEEDS_INPUT: "等你补充", UNSUPPORTED: "暂不支持这项任务", AWAITING_APPROVAL: "等待你确认", PROJECT_READY: "项目已建立", STOPPED: "已停止", SUPERSEDED: "已由新计划替代", FAILED: "任务未完成" };

export function AgentWorkspace() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [objective, setObjective] = useState("");
  const [skuName, setSkuName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
    const refresh = () => fetch("/api/local-agent/tasks").then(async r => ({ ...await r.json(), unauthorized: r.status === 401 })).then(p => {
      if (!alive) return;
      if (!initialized) { setSelected(new URL(window.location.href).searchParams.get("conversation")); initialized = true; }
      setNeedsLogin(p.unauthorized);
      if (p.error) { setError(p.error); if (p.unauthorized) { setTasks([]); drafts.current = {}; setObjective(""); } }
      else { setTasks(p.tasks); setError(""); }
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
  return <main className="agent-lab">
    <header><Link href="/">VisionQA</Link><span>视觉智能体 / 本地开发</span><a href="/workspace">原工作台 ↗</a></header>
    <div className="agent-lab__body">
      <nav className="agent-lab__products" aria-label="商品对话">
        <h2>商品对话</h2>
        <button className="secondary" disabled={busy} onClick={() => selectConversation(null)}>＋ 新商品对话</button>
        {!conversations.length && <p>每个商品独立保存本次服务内的对话与项目入口。</p>}
        {conversations.map(t => <button key={t.id} className="secondary" aria-current={selected === t.conversationId ? "page" : undefined} disabled={busy} onClick={() => selectConversation(t.conversationId)}>{t.skuName}<small>{tasks.filter(item => item.conversationId === t.conversationId).length} 轮对话</small></button>)}
      </nav>
      <section className="agent-lab__conversation" aria-label="任务对话">
        <p className="agent-lab__eyebrow">从你的目标开始</p>
        <h1>{current?.skuName ?? "从一个商品开始"}</h1>
        <p>{current ? "继续讨论这个商品。要求、计划和素材入口不会与其他商品混用。" : "为一个商品建立对话，再持续讨论它的视觉内容。"}</p>
        <div className="agent-lab__history" aria-live="polite">
          {!visibleTasks.length && <p className="agent-lab__intro">首个能力包：商品图检查与修正。先告诉我商品名称，以及哪些地方需要处理、哪些不能改变。脚本修正与视觉方向能力尚待接入。</p>}
          {visibleTasks.map(task => <article key={task.id}><small>{task.parentId ? "继续对话" : "你的任务"} · {task.skuName}</small><p>{task.objective}</p><strong>{labels[task.status]}</strong>{task.plan && <><p>{task.plan.summary}</p>{task.plan.question && <p><strong>{task.plan.question}</strong></p>}</>}{task.error && <p>{task.error}</p>}</article>)}
        </div>
        {error && <div className="agent-lab__error" role="alert">{error} {needsLogin && <a href="/login" target="_blank" rel="noreferrer">打开本地登录</a>}</div>}
        <form onSubmit={event => { event.preventDefault(); void send("create"); }}>
          {continuing ? <span>当前商品</span> : <label htmlFor="agent-sku">商品名称</label>}
          {continuing ? <p id="agent-sku">{current?.skuName} · 本对话绑定商品</p> : <input id="agent-sku" required disabled={working} maxLength={100} value={skuName} onChange={e => { setSkuName(e.target.value); pendingId.current = null; pendingRequest.current = null; }} placeholder="例如：灰色针织开衫" />}
          <label htmlFor="agent-goal">{continuing ? "补充要求或修改计划" : "任务目标"}</label>
          <textarea id="agent-goal" required disabled={working} maxLength={2000} value={objective} onChange={e => { setObjective(e.target.value); pendingId.current = null; pendingRequest.current = null; }} placeholder="检查这组图，修正多余图案，保持衣服颜色和纽扣不变。" />
          <p className="agent-lab__intro">提交会将本轮文字与当前任务对话发给规划模型，不发送图片、不扣修图额度；会产生模型接口费用。请勿填写密钥或个人隐私。</p>
          <button className={current && ["AWAITING_APPROVAL", "FAILED"].includes(current.status) ? "secondary" : ""} disabled={working || needsLogin} type="submit">{working ? "正在处理，可刷新查看进度…" : continuing ? "发送补充，更新计划 →" : "理解需求，生成计划 →"}</button>
        </form>
      </section>
      <aside className="agent-lab__inspector" aria-label="任务计划">
        <div className="agent-lab__section-head"><h2>任务工作区</h2><span>{current ? labels[current.status] : "尚未开始"}</span></div>
        <div className="agent-lab__plan">
          <span className="agent-lab__eyebrow">{current?.plan ? "待执行计划 · 尚未检查图片" : "当前可执行能力"}</span>
          <h3>{current?.skuName || "商品图检查与修正"}</h3>
          <ol><li>建立独立 SKU 项目</li><li>添加商品参考和候选素材</li><li>检查、定向修正与人工复验</li></ol>
          {current?.plan && <><h4>处理目标</h4>{current.plan.changes.length ? <ul>{current.plan.changes.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p>等待明确目标。</p>}<h4>不能改变</h4>{current.plan.preserve.length ? <ul>{current.plan.preserve.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p>尚未指定；上传后仍需确认商品事实和锁定区域。</p>}</>}
          <p>{current?.projectId ? "确认只接受这版计划，沿用当前商品项目；不会自动执行修图。" : "本次确认只建立项目，不发送图片、不调用模型、不扣额度。"}</p>
          {current?.status === "AWAITING_APPROVAL" && <div className="agent-lab__actions"><button disabled={working || Boolean(objective.trim())} onClick={() => void send("approve")}>{current.projectId ? "确认本轮计划" : "确认，建立商品项目"}</button><button className="secondary" disabled={working} onClick={() => void send("stop")}>暂不执行</button>{objective.trim() && <p>你正在修改要求，请先发送补充；旧计划不会自动执行。</p>}</div>}
          {current && ["NEEDS_INPUT", "UNSUPPORTED", "FAILED"].includes(current.status) && <button className="secondary" disabled={working} onClick={() => void send("stop")}>结束这项任务</button>}
          {current?.projectId && <a className="agent-lab__primary-link" href={`/workspace/projects/${current.projectId}`}>添加素材，继续任务 →</a>}
          {current?.status === "FAILED" && <><p role="status">{current.error}</p><button disabled={working || Boolean(objective.trim())} onClick={() => { pendingId.current = null; pendingRequest.current = null; void send("create", true); }}>按原需求重新生成计划</button><p>将再次调用文字规划模型，不扣修图额度。也可以先修改左侧要求再发送。</p></>}
        </div>
        <div className="agent-lab__boundary"><h3>本地原型边界</h3><p>商品名称来自你的输入；上方处理目标与不可变内容是模型整理的计划，未经确认不当作事实。图片、脚本和视觉方向的统一交付尚未接通。</p><p>当前每个商品最多六轮完整上下文，不截断后假装记得全部内容。对话和项目仅在本次开发服务内保存，刷新可读取，重启后不保留。预算也尚未跨进程持久化，暂不可公开使用。</p></div>
      </aside>
    </div>
  </main>;
}
