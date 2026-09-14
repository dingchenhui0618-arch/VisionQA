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
  const lock = useRef(false);
  const pendingId = useRef<string | null>(null);
  const pendingRequest = useRef<object | null>(null);
  const current = tasks.at(-1);
  const continuing = current && ["NEEDS_INPUT", "UNSUPPORTED", "AWAITING_APPROVAL", "FAILED"].includes(current.status);
  const working = busy || current?.status === "STARTING";
  useEffect(() => {
    let alive = true;
    const refresh = () => fetch("/api/local-agent/tasks").then(async r => ({ ...await r.json(), unauthorized: r.status === 401 })).then(p => {
      if (!alive) return;
      setNeedsLogin(p.unauthorized);
      if (p.error) setError(p.error); else { setTasks(p.tasks); setError(""); }
    }).catch(() => { if (alive) setError("无法读取本地任务，请刷新重试。"); });
    void refresh();
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 3000);
    return () => { alive = false; window.removeEventListener("focus", refresh); window.clearInterval(interval); };
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
      setTasks(old => [...old.filter(t => t.id !== payload.task.id).map(t => t.id === payload.task.parentId ? { ...t, status: "SUPERSEDED" as const } : t), payload.task]);
      if (action === "create") { pendingId.current = null; pendingRequest.current = null; setObjective(""); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "连接未完成，请重试。"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <main className="agent-lab">
    <header><Link href="/">VisionQA</Link><span>视觉智能体 / 本地开发</span><a href="/workspace">原工作台 ↗</a></header>
    <div className="agent-lab__body">
      <section className="agent-lab__conversation" aria-label="任务对话">
        <p className="agent-lab__eyebrow">从你的目标开始</p>
        <h1>这一次，<br />想完成什么视觉任务？</h1>
        <p>交代目标，确认计划，再进入素材工作区。</p>
        <div className="agent-lab__history" aria-live="polite">
          {!tasks.length && <p className="agent-lab__intro">首个能力包：商品图检查与修正。先告诉我 SKU 名称，以及哪些地方需要处理、哪些不能改变。</p>}
          {tasks.map(task => <article key={task.id}><small>{task.parentId ? "补充需求" : "你的任务"} · {task.skuName}</small><p>{task.objective}</p><strong>{labels[task.status]}</strong>{task.plan && <><p>{task.plan.summary}</p>{task.plan.question && <p><strong>{task.plan.question}</strong></p>}</>}{task.error && <p>{task.error}</p>}{task.projectId && <a href={`/workspace/projects/${task.projectId}`}>打开素材工作区 →</a>}</article>)}
        </div>
        {error && <div className="agent-lab__error" role="alert">{error} {needsLogin && <a href="/login" target="_blank" rel="noreferrer">打开本地登录</a>}</div>}
        <form onSubmit={event => { event.preventDefault(); void send("create"); }}>
          <label htmlFor="agent-sku">{continuing ? "当前 SKU" : "SKU 名称"}</label>
          <input id="agent-sku" required disabled={working} readOnly={Boolean(continuing)} maxLength={100} value={continuing ? current?.skuName : skuName} onChange={e => { setSkuName(e.target.value); pendingId.current = null; pendingRequest.current = null; }} placeholder="例如：灰色针织开衫" />
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
          <p>本次确认只建立项目，不发送图片、不调用模型、不扣额度。</p>
          {current?.status === "AWAITING_APPROVAL" && <div className="agent-lab__actions"><button disabled={working || Boolean(objective.trim())} onClick={() => void send("approve")}>确认，建立项目</button><button className="secondary" disabled={working} onClick={() => void send("stop")}>暂不执行</button>{objective.trim() && <p>你正在修改要求，请先发送补充；旧计划不会自动执行。</p>}</div>}
          {current && ["NEEDS_INPUT", "UNSUPPORTED", "FAILED"].includes(current.status) && <button className="secondary" disabled={working} onClick={() => void send("stop")}>结束这项任务</button>}
          {current?.projectId && <a className="agent-lab__primary-link" href={`/workspace/projects/${current.projectId}`}>添加素材，继续任务 →</a>}
          {current?.status === "FAILED" && <><p role="status">{current.error}</p><button disabled={working || Boolean(objective.trim())} onClick={() => { pendingId.current = null; pendingRequest.current = null; void send("create", true); }}>按原需求重新生成计划</button><p>将再次调用文字规划模型，不扣修图额度。也可以先修改左侧要求再发送。</p></>}
        </div>
        <div className="agent-lab__boundary"><h3>本轮接入范围</h3><p>Mastra + DeepSeek 负责文字需求理解与追问，工作流负责确认后建立项目。图片操作仍在原工作台执行；这里的计划尚不自动填入修图指令。</p><p>不会自动循环修图、自动重试付费请求或伪造智能体对话。对话任务仅在本次开发服务内保存，刷新可读取，重启后不保留。预算计数也尚未跨进程持久化，暂不可公开使用。</p></div>
      </aside>
    </div>
  </main>;
}
