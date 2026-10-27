"use client";

// The compact desktop plugin serves its bundled SVG marks directly; routing
// these tiny local assets through the image optimizer would add no value.
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { VisualReviewRequest, VisualReviewResponse } from "../../lib/visionqa/visual-review-contract";

type Provider = "mock" | "auto";
type RunState = "idle" | "running" | "success" | "error";
type ResultPayload = { contract?: VisualReviewResponse; provider?: { providerId: string; modelSnapshot: string; latencyMs: number; warnings: string[] }; error?: { code: string; message: string; request_id?: string } };
type DesktopRuntimeStatus = { provider_mode?: "off" | "real"; provider_calls?: boolean; provider_config_source?: string };
type ProviderSettings = { mode: "off" | "real"; provider_id: string; endpoint: string; model: string; max_total_requests: number; api_key_configured: boolean; secrets_file?: string | null; settings_file?: string | null; source?: string; restart_required?: boolean };
type ProviderCheck = ProviderSettings & { server?: { reachable: boolean; mode: "off" | "real" | null; available: boolean; missing: string[] } };
type ProviderSettingsForm = { mode: "off" | "real"; provider_id: string; endpoint: string; model: string; max_total_requests: string; api_key: string };
type DesktopBridge = {
  runtime?: { getStatus?: () => Promise<DesktopRuntimeStatus> };
  provider?: { getSettings?: () => Promise<ProviderSettings>; check?: () => Promise<ProviderCheck>; saveSettings?: (input: ProviderSettingsForm) => Promise<ProviderSettings>; clearKey?: () => Promise<ProviderSettings>; restart?: () => Promise<{ accepted: boolean }> };
};

const initialProviderForm: ProviderSettingsForm = {
  mode: "off",
  provider_id: "deepseek",
  endpoint: "https://api.deepseek.com/chat/completions",
  model: "deepseek-flash",
  max_total_requests: "10",
  api_key: "",
};

const newId = () => crypto.randomUUID();

function decisionLabel(decision: VisualReviewResponse["decision"]): string {
  return {
    PASS: "可以继续",
    NEEDS_REVISION: "建议修正",
    MANUAL_REVIEW: "需要人工判断",
    BLOCKED: "暂时阻止",
    NEEDS_CONTEXT: "需要更多上下文",
    NOT_ASSESSABLE: "暂不可评估",
  }[decision];
}

function runtimeStatus(status: DesktopRuntimeStatus | null, state: RunState): { label: string; tone: "preview" | "ready" | "pending" | "offline" | "running" | "success" | "error" } {
  if (state === "running") return { label: "正在评审", tone: "running" };
  if (state === "success") return { label: "评审完成", tone: "success" };
  if (state === "error") return { label: "评审未完成", tone: "error" };
  if (!status) return { label: "浏览器预览", tone: "preview" };
  if (status.provider_mode === "real" && status.provider_calls !== false) return { label: "本地服务 · 可用", tone: "ready" };
  if (status.provider_mode === "real") return { label: "本地服务 · 待检查", tone: "pending" };
  return { label: "离线预览", tone: "offline" };
}

function formatFileSize(file: File | null): string {
  if (!file) return "";
  if (file.size < 1024 * 1024) return `${Math.max(1, Math.round(file.size / 1024))} KB`;
  return `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
}

function makeRequest(args: { conversationId: string; goal: string; context: string; mustKeep: string; candidate: File | null; provider: Provider }): VisualReviewRequest {
  const mustKeep = args.mustKeep.split(/[\n,，]/).map(item => item.trim()).filter(Boolean).slice(0, 32);
  return {
    schema_version: "visual-review-v0.1",
    request_id: newId(),
    conversation_id: args.conversationId,
    host: { type: "visionqa-local-plugin", adapter_version: "0.1.0" },
    artifact: {
      type: "image",
      name: args.candidate?.name || "宿主视觉产物",
      mime_type: args.candidate?.type || "image/png",
      screenshot_ref: args.candidate ? "browser://candidate-upload" : "browser://host-context",
      viewport: typeof window === "undefined" ? undefined : { width: window.innerWidth, height: window.innerHeight, device_scale_factor: window.devicePixelRatio || 1 },
    },
    intent: {
      goal: args.goal.trim() || "从当前上下文出发检查这份视觉产物是否可用，并给出可执行的修正方向。",
      audience: args.context.trim() || undefined,
      platform: "local-web",
    },
    constraints: mustKeep.length ? { must_keep: mustKeep } : undefined,
    permissions: { can_read_source: false, can_write_source: false, can_call_model: args.provider === "auto", can_render: false, can_run_commands: false },
    operation: "review",
  };
}

export function PluginWorkspace() {
  const [candidate, setCandidate] = useState<File | null>(null);
  const [references, setReferences] = useState<File[]>([]);
  const [goal, setGoal] = useState("检查这份视觉产物的层级、可读性和整体完成度");
  const [context, setContext] = useState("网页首屏，面向第一次访问的用户");
  const [mustKeep, setMustKeep] = useState("保留品牌标识\n不改变核心内容");
  const [message, setMessage] = useState("");
  const [conversationId] = useState(newId);
  const [runState, setRunState] = useState<RunState>("idle");
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [attachmentNotice, setAttachmentNotice] = useState("");
  const [activeTab, setActiveTab] = useState<"review" | "context" | "versions" | "settings">("review");
  const [desktopStatus, setDesktopStatus] = useState<DesktopRuntimeStatus | null>(null);
  const [providerSettings, setProviderSettings] = useState<ProviderSettings | null>(null);
  const [providerForm, setProviderForm] = useState<ProviderSettingsForm>(initialProviderForm);
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerMessage, setProviderMessage] = useState("");
  const [providerError, setProviderError] = useState("");
  const [providerCheck, setProviderCheck] = useState<ProviderCheck | null>(null);

  function getDesktopBridge(): DesktopBridge | null {
    if (typeof window === "undefined") return null;
    return (window as Window & { visionqaDesktop?: DesktopBridge }).visionqaDesktop || null;
  }

  useEffect(() => {
    const desktop = getDesktopBridge();
    if (!desktop) return;
    let active = true;
    desktop.runtime?.getStatus?.()?.then(status => { if (active) setDesktopStatus(status); }).catch(() => undefined);
    desktop.provider?.getSettings?.()?.then(settings => {
      if (!active) return;
      setProviderSettings(settings);
      setProviderForm(form => ({ ...form, mode: settings.mode, provider_id: settings.provider_id, endpoint: settings.endpoint, model: settings.model, max_total_requests: String(settings.max_total_requests) }));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const isBusy = runState === "running";
  const runtime = runtimeStatus(desktopStatus, runState);
  // Offline/browser preview must use the existing local Mock contract. Only a
  // desktop session that explicitly owns a real Provider may send `auto`.
  const provider: Provider = desktopStatus?.provider_mode === "real" ? "auto" : "mock";
  const candidatePreviewUrl = useMemo(() => candidate ? URL.createObjectURL(candidate) : null, [candidate]);
  useEffect(() => candidatePreviewUrl ? () => URL.revokeObjectURL(candidatePreviewUrl) : undefined, [candidatePreviewUrl]);
  const requestPreview = useMemo(() => makeRequest({ conversationId, goal, context, mustKeep, candidate, provider }), [conversationId, goal, context, mustKeep, candidate, provider]);

  async function runReview(event?: FormEvent) {
    event?.preventDefault();
    setRunState("running");
    setResult(null);
    const request = makeRequest({ conversationId, goal: message.trim() || goal, context, mustKeep, candidate, provider });
    const form = new FormData();
    form.set("request", JSON.stringify(request));
    form.set("provider", provider);
    if (candidate) form.set("candidate", candidate, candidate.name);
    references.forEach(file => form.append("references", file, file.name));
    try {
      const response = await fetch("/api/visual-review", { method: "POST", body: form, headers: { "x-request-id": request.request_id } });
      const payload = await response.json() as ResultPayload;
      if (!response.ok) throw new Error(payload.error?.message || "本次评审没有形成结果。");
      setResult(payload);
      setMessage("");
      setRunState("success");
    } catch (error) {
      setResult({ error: { code: "CLIENT_REQUEST_FAILED", message: error instanceof Error ? error.message : "本次评审没有形成结果，请稍后重试。" } });
      setRunState("error");
    }
  }

  async function saveProvider(event: FormEvent) {
    event.preventDefault();
    const desktop = getDesktopBridge();
    if (!desktop?.provider?.saveSettings) {
      setProviderError("请从 VisionQA 桌面应用打开 Provider 设置；浏览器预览不会保存密钥。");
      return;
    }
    setProviderSaving(true);
    setProviderMessage("");
    setProviderError("");
    try {
      const saved = await desktop.provider.saveSettings(providerForm);
      setProviderSettings(saved);
      setProviderForm(form => ({ ...form, api_key: "", mode: saved.mode, provider_id: saved.provider_id, endpoint: saved.endpoint, model: saved.model, max_total_requests: String(saved.max_total_requests) }));
      setProviderMessage(saved.restart_required ? "配置已保存。重启桌面应用后生效。" : "配置已保存。");
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "Provider 设置保存失败。");
    } finally {
      setProviderSaving(false);
    }
  }

  async function restartDesktop() {
    const desktop = getDesktopBridge();
    await desktop?.provider?.restart?.();
  }

  async function checkProvider() {
    const desktop = getDesktopBridge();
    if (!desktop?.provider?.check) {
      setProviderError("请从 VisionQA 桌面应用检查 Provider；浏览器预览不会连接本地服务。");
      return;
    }
    setProviderSaving(true);
    setProviderMessage("");
    setProviderError("");
    try {
      const checked = await desktop.provider.check();
      setProviderCheck(checked);
      setProviderSettings(checked);
      if (!checked.server?.reachable) setProviderMessage("配置已读取，但本地服务当前未响应；重启桌面应用后再检查。 ");
      else if (!checked.server.available) setProviderError(`服务端未就绪：${checked.server.missing.join("、") || "请检查配置"}`);
      else setProviderMessage("服务端配置已就绪。此检查未发送图片，不消耗模型额度。");
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "Provider 配置检查失败。");
    } finally {
      setProviderSaving(false);
    }
  }

  async function clearProviderKey() {
    const desktop = getDesktopBridge();
    if (!desktop?.provider?.clearKey) return;
    if (!window.confirm("确认清除本机保存的 Provider API Key？清除后真实模式将无法调用，直到重新输入。")) return;
    setProviderSaving(true);
    setProviderMessage("");
    setProviderError("");
    try {
      const cleared = await desktop.provider.clearKey();
      setProviderSettings(cleared);
      setProviderCheck(null);
      setProviderMessage("本机 API Key 已清除。重启桌面应用后，真实 Provider 将保持失败关闭。");
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "本机 API Key 清除失败。");
    } finally {
      setProviderSaving(false);
    }
  }

  return (
    <main className="plugin-host" data-state={runState}>
      <section className="plugin-card" aria-label="VisionQA 视觉评审插件">
        <header className="plugin-titlebar">
          <div className="plugin-titlebar__left">
            <button className="plugin-edit-button" type="button" onClick={() => setActiveTab("context")} aria-label="编辑评审上下文" title="编辑评审上下文"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m11.8 2.2 2 2-7.9 7.9-2.7.7.7-2.7 7.9-7.9Z" /><path d="m10.7 3.3 2 2" /></svg><em>编辑</em></button>
            <div className="plugin-title"><img className="plugin-title__mark" src="/brand/visionqa-favicon.svg" alt="" /><strong>VisionQA</strong><span>视觉判断插件</span></div>
          </div>
          <div className="plugin-titlebar__actions"><span className={`plugin-connection is-${runtime.tone}`} title="当前评审运行状态" aria-live="polite"><b /> {runtime.label}</span></div>
        </header>
        <nav className="plugin-tabs" role="tablist" aria-label="插件视图">
          {([['review', '评审'], ['context', '上下文'], ['versions', '版本'], ['settings', '设置']] as const).map(([id, label]) => <button type="button" role="tab" id={`plugin-tab-${id}`} aria-selected={activeTab === id} aria-controls={`plugin-panel-${id}`} key={id} className={activeTab === id ? "is-active" : ""} onClick={() => setActiveTab(id)}>{label}</button>)}
        </nav>

        {activeTab === "review" && <div id="plugin-panel-review" className="plugin-body" role="tabpanel" aria-labelledby="plugin-tab-review" tabIndex={0}>
          <div className="plugin-statusline"><div className="plugin-session"><span className="plugin-kicker">当前会话</span><span className="plugin-session-value">{candidate ? `1 件待检查作品 · ${candidate.name}` : "等待添加作品"}</span></div><span className={`plugin-evidence-state ${candidate ? "is-ready" : "is-empty"}`}><i /> {candidate ? "已添加作品" : "等待作品"}</span></div>
          {!result && <div className="plugin-empty"><div className="plugin-empty__identity"><div className="plugin-mark"><img src="/brand/visionqa-favicon.svg" alt="VisionQA" /></div><span className="plugin-kicker">视觉检查</span></div><h1>先放入一件要检查的作品。</h1><p>上传截图或导出的图片，VisionQA 会帮你找出最需要处理的地方，并给出下一步建议。</p><div className={`plugin-evidence-anchor ${candidate ? "has-file" : "is-empty"}`} aria-label="当前待检查作品"><div className="plugin-evidence-media">{candidatePreviewUrl ? <img src={candidatePreviewUrl} alt="当前待检查作品缩略图" /> : <span aria-hidden="true">—</span>}</div><div className="plugin-evidence-copy"><span className="plugin-kicker">当前作品</span><strong>{candidate ? candidate.name : "尚未添加作品"}</strong><small>{candidate ? `${formatFileSize(candidate)} · 可以开始检查` : "支持截图或导出的 JPG、PNG、WebP"}</small></div><em>{candidate ? "待检查" : "等待添加"}</em></div><div className="plugin-goal-anchor"><span className="plugin-kicker">检查目标</span><strong>{goal || "等待补充检查目标"}</strong></div></div>}
          {result?.contract && <article className="plugin-result" aria-live="polite">
            <div className="plugin-result__headline"><span className={`plugin-decision decision-${result.contract.decision.toLowerCase()}`} aria-hidden="true" /><div><span className="plugin-kicker">评审结果</span><h2>{decisionLabel(result.contract.decision)}</h2></div><small>{result.provider?.modelSnapshot || "DeepSeek Flash"}</small></div>
            <p className="plugin-summary">{result.contract.summary}</p>
            {result.contract.issues.length > 0 ? <div className="plugin-issues">{result.contract.issues.map(issue => <div className="plugin-issue" key={issue.id}><div><strong>{issue.category}</strong><span>{issue.severity} · {Math.round(issue.confidence * 100)}%</span></div><p>{issue.suggested_fix}</p>{issue.evidence[0] && <small>{issue.evidence[0].description}</small>}</div>)}</div> : <p className="plugin-no-issues">当前没有需要单独列出的视觉问题。</p>}
            <div className="plugin-repair"><span className="plugin-kicker">下一步</span><p>{result.contract.repair_plan.operations[0]?.action || "人工确认当前结果，再决定是否写回或继续修改。"}</p><div className="plugin-checks">{result.contract.verification.checks.slice(0, 3).map(check => <span key={check}>○ {check}</span>)}</div></div>
          </article>}
          {result?.error && <div className="plugin-error" role="alert"><strong>这次没有完成</strong><p>{result.error.message}</p><small>{result.error.code}</small></div>}
          <form className="plugin-composer" onSubmit={runReview}>
            <label htmlFor="plugin-message">这次想重点看什么？</label>
            <textarea id="plugin-message" value={message} onChange={event => setMessage(event.target.value)} placeholder="例如：先看首屏是否清楚，保留现有品牌标识…" maxLength={2000} disabled={isBusy} />
            <div className="plugin-composer__bar"><label className="plugin-file"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { setCandidate(event.target.files?.[0] || null); setAttachmentNotice(""); }} disabled={isBusy} />{candidate ? `作品 · ${candidate.name}` : "添加要检查的作品"}</label><button type="submit" className="plugin-send" disabled={isBusy || !candidate} aria-label={isBusy ? "检查中" : "开始检查"}><span>{isBusy ? "检查中" : "开始检查"}</span><b aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 8h9" /><path d="m8.5 4.5 3.5 3.5-3.5 3.5" /></svg></b></button></div>
            {attachmentNotice && <small className="plugin-attachment-notice">{attachmentNotice}</small>}
          </form>
        </div>}

        {activeTab === "context" && <div id="plugin-panel-context" className="plugin-body plugin-context" role="tabpanel" aria-labelledby="plugin-tab-context" tabIndex={0}><div className="plugin-section-heading"><span className="plugin-kicker">宿主上下文</span><h2>让判断有依据</h2><p>这些字段会进入 VisualReview Contract；不会写入公开日志。</p></div><div className="plugin-provider-note">Provider 开关由桌面启动配置控制，密钥只从包外 secrets 文件进入本地服务。</div><label>目标<textarea value={goal} onChange={event => setGoal(event.target.value)} maxLength={2000} /></label><label>场景 / 受众<textarea value={context} onChange={event => setContext(event.target.value)} maxLength={500} /></label><label>必须保留（每行一项）<textarea value={mustKeep} onChange={event => setMustKeep(event.target.value)} maxLength={2000} /></label><div className="plugin-reference"><span className="plugin-kicker">参考图（可选，最多 4 张）</span><label className="plugin-file plugin-file--large"><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={event => { const files = Array.from(event.target.files || []); setReferences(files.slice(0, 4)); setAttachmentNotice(files.length > 4 ? "参考图最多参与 4 张，超出的文件未加入。" : ""); }} disabled={isBusy} />{references.length ? `已选择 ${references.length} 张参考图` : "添加同一上下文里的参考图"}</label></div></div>}

        {activeTab === "versions" && <div id="plugin-panel-versions" className="plugin-body plugin-versions" role="tabpanel" aria-labelledby="plugin-tab-versions" tabIndex={0}><div className="plugin-section-heading"><span className="plugin-kicker">版本</span><h2>每次评审都是一个可追踪节点</h2><p>当前第一版只记录请求与结果，不会自动覆盖宿主文件。</p></div><div className="plugin-version-row is-current"><span>V0</span><div><strong>当前宿主产物</strong><small>{candidate?.name || "尚未添加图片"}</small></div><em>当前</em></div>{result?.contract && <div className="plugin-version-row"><span>V1</span><div><strong>评审结果</strong><small>{result.contract.decision} · {result.provider?.modelSnapshot || "DeepSeek Flash"}</small></div><em>待确认</em></div>}<pre className="plugin-contract-preview">{JSON.stringify(requestPreview, null, 2)}</pre></div>}

        {activeTab === "settings" && <div id="plugin-panel-settings" className="plugin-body plugin-settings" role="tabpanel" aria-labelledby="plugin-tab-settings" tabIndex={0}><div className="plugin-section-heading"><span className="plugin-kicker">桌面 Provider</span><h2>把模型配置留在本机</h2><p>Key 只写入桌面用户目录的外置配置文件，不会进入网页、localStorage 或导出结果。</p></div><div className="plugin-settings-status"><span className={`plugin-provider-status ${desktopStatus?.provider_mode === "off" ? "is-disabled" : ""}`}><i /> 当前运行：{desktopStatus?.provider_mode === "real" ? "Provider 已开启" : desktopStatus?.provider_mode === "off" ? "Provider 已关闭" : "浏览器预览"}</span>{providerSettings?.api_key_configured && <small>已检测到本机密钥（仅显示状态）</small>}</div><form className="plugin-settings-form" onSubmit={saveProvider}><label>运行模式<select value={providerForm.mode} onChange={event => setProviderForm(form => ({ ...form, mode: event.target.value === "real" ? "real" : "off" }))}><option value="off">关闭真实调用（离线）</option><option value="real">开启真实 Provider</option></select></label><label>Provider ID<input value={providerForm.provider_id} onChange={event => setProviderForm(form => ({ ...form, provider_id: event.target.value }))} placeholder="deepseek / qwen / custom" maxLength={100} /></label><label>Endpoint<input type="url" value={providerForm.endpoint} onChange={event => setProviderForm(form => ({ ...form, endpoint: event.target.value }))} placeholder="https://.../chat/completions" maxLength={500} /></label><label>模型<input value={providerForm.model} onChange={event => setProviderForm(form => ({ ...form, model: event.target.value }))} placeholder="deepseek-flash" maxLength={160} /></label><label>API Key<input type="password" value={providerForm.api_key} onChange={event => setProviderForm(form => ({ ...form, api_key: event.target.value }))} placeholder={providerSettings?.api_key_configured ? "已配置，留空保持当前密钥" : "只在本机输入，不会回显"} autoComplete="new-password" /></label><label>本地请求上限<input type="number" min="1" max="100" value={providerForm.max_total_requests} onChange={event => setProviderForm(form => ({ ...form, max_total_requests: event.target.value }))} /></label><div className="plugin-settings-actions"><button className="plugin-settings-save" type="submit" disabled={providerSaving}>{providerSaving ? "保存中" : "保存配置"}</button><button className="plugin-settings-check" type="button" onClick={checkProvider} disabled={providerSaving}>检查服务端配置</button>{providerSettings?.api_key_configured && <button className="plugin-settings-clear" type="button" onClick={clearProviderKey} disabled={providerSaving}>清除 Key</button>}{providerSettings?.restart_required && <button className="plugin-settings-restart" type="button" onClick={restartDesktop}>立即重启生效</button>}</div>{providerCheck?.server && <p className="plugin-settings-checkline" role="status">服务端：{providerCheck.server.reachable ? providerCheck.server.available ? "已就绪（未发起模型请求）" : `未就绪 · ${providerCheck.server.missing.join("、") || "请检查配置"}` : "未响应"}</p>}{providerMessage && <p className="plugin-settings-message" role="status">{providerMessage}</p>}{providerError && <p className="plugin-settings-error" role="alert">{providerError}</p>}</form><small className="plugin-settings-footnote">配置文件：{providerSettings?.secrets_file || "桌面用户目录 / VisionQA / secrets / provider.env"}</small></div>}
      </section>
      <p className="plugin-disclaimer">VisionQA 视觉评审插件 · 服务端密钥不进入浏览器 · 所有结论仍需人工确认</p>
    </main>
  );
}
