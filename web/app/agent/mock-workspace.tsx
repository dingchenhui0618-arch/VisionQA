"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createMockPort } from "../../lib/agent/mock-port";
import { emptyMock, type Asset, type Command, type MockSnapshot } from "../../lib/agent/mock-contract";
import { fileProblem } from "../../lib/agent/material-client";
import "./workspace.css";
import "./mock-workspace.css";

const port = createMockPort();
export function MockWorkspace() {
  const [state, setState] = useState<MockSnapshot>(emptyMock);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [theme, setTheme] = useState("dark");
  const [checks, setChecks] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const drafts = useRef<Record<string, string>>({});
  const tail = useRef<HTMLDivElement>(null);
  const current = state.conversations.find(c => c.id === state.selectedId);
  const version = current?.versions.find(v => v.id === current.viewingVersionId);
  const selectedAsset = current?.assets.find(asset => asset.id === current.selectedAssetId);
  const truthAsset = current?.assets.find(asset => asset.role === "truth");
  useEffect(() => {
    let active = true;
    void port.load().then(next => { if (active) { setState(next); setLoaded(true); } }).catch(cause => { if (active) setError(cause.message); });
    const timer = requestAnimationFrame(() => { try { setTheme(localStorage.getItem("visionqa-agent-theme") === "light" ? "light" : "dark"); } catch { /* theme still usable */ } });
    return () => { active = false; cancelAnimationFrame(timer); };
  }, []);
  useEffect(() => { tail.current?.scrollIntoView({ block: "nearest" }); }, [current?.messages.length, busy]);

  async function execute(command: Command) {
    if (lock.current || !loaded) return;
    lock.current = true; setError(""); setNotice("");
    setBusy(command.kind === "screen" ? "模拟筛查中，不发送图片…" : command.kind === "repair" ? "模拟修正中，不调用模型…" : "正在保存到当前浏览器…");
    try {
      const next = await port.execute(state, state.selectedId, crypto.randomUUID(), command);
      setState(next); setChecks([]);
      if (command.kind === "message" || command.kind === "create") { setDraft(""); drafts.current[state.selectedId ?? "new"] = ""; }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "本次模拟未完成，请重试。"); }
    finally { lock.current = false; setBusy(""); }
  }
  async function select(id: string | null) {
    if (lock.current || !loaded) return;
    lock.current = true;
    drafts.current[state.selectedId ?? "new"] = draft;
    try { const next = { ...state, selectedId: id }; await port.save(next); setState(next); setDraft(drafts.current[id ?? "new"] ?? ""); setError(""); setChecks([]); }
    catch { setError("切换未保存，请重试。"); }
    finally { lock.current = false; }
  }
  async function attach(files: File[], role: Asset["role"]) {
    if (!files.length || lock.current || !current) return;
    const issue = files.map(fileProblem).find(Boolean);
    if (issue) { setError(issue); return; }
    if (files.length + current.assets.filter(a => a.role === role).length > (role === "truth" ? 4 : 10)) { setError("超出当前商品图片上限，本次未加入。参考最多 4 张，待检查最多 10 张。"); return; }
    lock.current = true; setBusy("正在读取本地图片，不会上传服务器…"); setError("");
    try {
      const assets: Asset[] = [];
      for (const file of files) {
        const bitmap = await createImageBitmap(file); bitmap.close();
        const url = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error(`${file.name} 无法读取`)); reader.readAsDataURL(file); });
        assets.push({ id: crypto.randomUUID(), name: file.name, role, url });
      }
      setState(await port.execute(state, current.id, crypto.randomUUID(), { kind: "attach", assets }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "图片未保存，请重新选择。"); }
    finally { lock.current = false; setBusy(""); }
  }
  function example() {
    void execute({ kind: "attach", assets: [
      { id: crypto.randomUUID(), name: "示例商品参考", role: "truth", url: "/fashion/repair-library/product-truth-grid.png" },
      { id: crypto.randomUUID(), name: "示例待检查图", role: "candidate", url: "/fashion/repair-library/sc-001-extra-button-v2.png" },
    ] });
  }
  function download() {
    if (!current || !version || !version.reviewed) return;
    const report = { mode: "MOCK_ONLY", disclaimer: "交互模拟；图片像素未修改，不是AI修图结果或真实人工验收证据。", product: current.name, version: version.number, instruction: version.instruction, sourceVersionId: version.sourceVersionId };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `VisionQA-MOCK-V${version.number}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("模拟交付记录已发起下载（JSON）；没有生成或下载真实修正版。");
  }
  function toggle() { const next = theme === "dark" ? "light" : "dark"; setTheme(next); try { localStorage.setItem("visionqa-agent-theme", next); } catch { /* current page still switches */ } }
  const ready = current?.assets.some(a => a.role === "truth") && current.assets.some(a => a.role === "candidate");
  const suggestions = current?.stage === "repair" ? ["只调整袖口，保留颜色、纽扣与背景", "修正图案位置，不改变模特和构图"] : ["检查商品细节是否与参考一致", "先找最需要处理的问题"];
  return <main className="agent-lab mock-lab" data-theme={theme}>
    <nav className="agent-lab__sidebar" aria-label="商品对话"><Link className="agent-lab__brand" href="/">VisionQA</Link>
      <button disabled={!loaded || Boolean(busy)} onClick={() => void select(null)}>＋ 新商品对话</button>
      <div className="agent-lab__products"><h2>商品上下文</h2>{state.conversations.map(c => <button key={c.id} aria-current={c.id === state.selectedId ? "page" : undefined} disabled={Boolean(busy)} onClick={() => void select(c.id)}>{c.name}<small>{c.assets.length} 张素材 · {c.versions.length} 个模拟版本</small></button>)}</div>
      <div className="mock-sidebar-foot"><p>交互模拟 · 不调用模型<br />不消耗真实额度</p><form action="/api/local-agent/mock-session?logout=1" method="post"><button className="secondary">退出模拟体验</button></form></div>
    </nav>
    <section className="agent-lab__main has-conversation" aria-label="商品智能体对话">
      <header className="agent-lab__topline"><span>{current?.name ?? "新商品对话"} · MOCK</span><button className="secondary" aria-label="切换黑白主题" aria-pressed={theme === "light"} onClick={toggle}>{theme === "dark" ? "◐ 白色" : "◑ 黑色"}</button></header>
      <div className="mock-thread">
        <p className="mock-mode">仅验证交互。回复、筛查与修图状态均为模拟；上传图只保存在本浏览器，与旧工作台隔离。</p>
        {!loaded && !error && <p role="status">正在恢复模拟对话…</p>}
        {!current && <div className="mock-welcome"><div className="agent-lab__mark">VQ</div><h1>从一件商品，开始协作。</h1><p>说明需求、添加图片、审核修正、对比交付，都在同一段对话里。</p><form onSubmit={event => { event.preventDefault(); void execute({ kind: "create", name }); }}><label htmlFor="mock-sku">这是什么商品？</label><input id="mock-sku" value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="例如：灰色针织开衫" required /><button disabled={!loaded || Boolean(busy)}>建立商品对话</button></form></div>}
        {current?.messages.map(message => <article className={`mock-message is-${message.role}`} key={message.id}><small>{message.role === "user" ? "你" : "VisionQA · 模拟助手"}</small><p>{message.text}</p>{message.assetIds && <div className="mock-thumbnails">{message.assetIds.map(id => { const asset = current.assets.find(a => a.id === id); return asset && <figure key={id}>
          <img src={asset.url} alt={asset.name} /><figcaption>{asset.role === "truth" ? "参考" : "待检查"} · {asset.name}</figcaption></figure>; })}</div>}</article>)}
        {current && <div className="mock-tool" aria-label="当前对话操作">
          {current.stage !== "delivered" && current.versions.length > 0 && <label>查看已保存版本<select value="" disabled={Boolean(busy)} onChange={e => { if (e.target.value) void execute({ kind: "view", versionId: e.target.value }); }}><option value="">选择版本（不生成新图片）</option>{current.versions.map(v => <option key={v.id} value={v.id}>{current.assets.find(a => a.id === v.assetId)?.name} · V{v.number}</option>)}</select></label>}
          {current.stage !== "intake" && <div className="agent-lab__actions">{current.stage !== "screened" && <button className="secondary" disabled={Boolean(busy)} onClick={() => void execute({ kind: "back", target: "screened" })}>返回筛查结果，处理其他图片</button>}<button className="secondary" disabled={Boolean(busy)} onClick={() => void execute({ kind: "back", target: "intake" })}>补充商品素材</button></div>}
          {current.stage === "intake" && <><h2>下一步，准备图片</h2><p>已保存：参考 {current.assets.filter(a => a.role === "truth").length}/4 张 · 待检查 {current.assets.filter(a => a.role === "candidate").length}/10 张</p><div className="mock-upload">{(["truth", "candidate"] as const).map(role => <label key={role}>{role === "truth" ? "添加商品参考图" : "添加待检查图"}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={Boolean(busy)} onChange={e => { const files = [...e.target.files ?? []]; e.target.value = ""; void attach(files, role); }} /></label>)}</div><div className="agent-lab__actions">{ready ? <button disabled={Boolean(busy)} onClick={() => void execute({ kind: "screen" })}>开始模拟筛查</button> : <button disabled={Boolean(busy)} onClick={example}>载入示例图片，体验完整流程</button>}</div>{!ready && <p>也可自行选择图片，至少 1 张参考和 1 张待检查图。</p>}</>}
          {current.stage === "screened" && <><h2>模拟筛查结果</h2><p>下列分类由演示脚本分配，不是对图片的实际判断。</p>{current.findings.map(f => { const asset = current.assets.find(a => a.id === f.assetId); return <div className="mock-finding" key={f.assetId}>{asset && <img src={asset.url} alt={asset.name} />}<div><strong>{f.disposition === "attention" ? "■ 需要处理" : f.disposition === "manual" ? "□ 人工判断" : "— 未见明显问题"}</strong><p>{asset?.name}：{f.issue}</p><button disabled={Boolean(busy)} onClick={() => void execute({ kind: "choose", assetId: f.assetId })}>在对话里修这张</button></div></div>; })}</>}
          {current.stage === "repair" && <><h2>请确认本轮修改计划</h2><div className="mock-evidence">{selectedAsset && <figure><img src={selectedAsset.url} alt={`当前待修：${selectedAsset.name}`} /><figcaption>当前待修 · {selectedAsset.name}</figcaption></figure>}{truthAsset && <figure><img src={truthAsset.url} alt={`商品参考：${truthAsset.name}`} /><figcaption>商品参考 · {truthAsset.name}</figcaption></figure>}</div><p>母版：{current.sourceVersionId ? `模拟 V${current.versions.find(v => v.id === current.sourceVersionId)?.number}` : "原图"}</p><blockquote>{current.instruction}</blockquote><p>保持不变：商品参考、非目标区域及画幅。区域框选将在真实链路批次接入；当前不发送图片。</p><button disabled={Boolean(busy) || Boolean(draft.trim())} onClick={() => void execute({ kind: "repair" })}>确认计划，生成模拟版本</button>{draft.trim() && <p>输入框有未发送的修改要求，请先发送。</p>}<details><summary>测试失败与恢复</summary><button className="secondary" disabled={Boolean(busy)} onClick={() => void execute({ kind: "repair", fail: true })}>模拟一次连接失败</button></details></>}
          {current.stage === "delivered" && version && <><h2>模拟版本 V{version.number} · 前后对比</h2><p>左右图片相同：此处只验证交互，未执行像素修改。</p><div className="agent-repair__compare">{[{ title: "本轮母版", url: version.sourceUrl }, { title: "模拟输出（未修改）", url: version.outputUrl }].map(a => <figure key={a.title}><figcaption>{a.title}</figcaption>
            <img src={a.url} alt={a.title} /></figure>)}</div><label>选择历史版本<select disabled={Boolean(busy)} value={version.id} onChange={e => void execute({ kind: "view", versionId: e.target.value })}>{current.versions.map(v => <option key={v.id} value={v.id}>V{v.number} · {current.assets.find(a => a.id === v.assetId)?.name} · {v.instruction.slice(0, 30)}</option>)}</select></label>
            <fieldset disabled={Boolean(busy)}><legend>模拟人工确认（不代表真实质量合格）</legend>{["商品信息", "非目标区域", "目标问题"].map((text, index) => { const id = `${version.id}:${index}`; return <label className="mock-check" key={id}><input type="checkbox" checked={version.reviewed || checks.includes(id)} disabled={version.reviewed} onChange={e => setChecks(old => e.target.checked ? [...old, id] : old.filter(v => v !== id))} />已体验“{text}”检查步骤</label>; })}</fieldset>
            <div className="agent-lab__actions">{!version.reviewed ? <button disabled={Boolean(busy) || [0, 1, 2].some(i => !checks.includes(`${version.id}:${i}`))} onClick={() => void execute({ kind: "review", versionId: version.id })}>记录本版模拟确认</button> : <button onClick={download}>下载模拟交付记录</button>}<button className="secondary" disabled={Boolean(busy)} onClick={() => void execute({ kind: "continue", versionId: version.id })}>以此版本继续修改</button><button className="secondary" disabled={Boolean(busy)} onClick={() => void execute({ kind: "continue", versionId: null })}>回到原图</button></div></>}
        </div>}
        {busy && <p role="status">{busy}</p>}{error && <p className="agent-lab__error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
        <div ref={tail} />
      </div>
      {current && <div className="mock-compose-wrap"><div className="mock-suggestions">{suggestions.map(text => <button className="secondary" key={text} disabled={Boolean(busy)} onClick={() => { setDraft(text); document.getElementById("mock-message")?.focus(); }}>{text}</button>)}</div><form className="agent-lab__composer" onSubmit={event => { event.preventDefault(); void execute({ kind: "message", text: draft }); }}><label htmlFor="mock-message" className="agent-lab__sr-only">给当前商品的要求</label><textarea id="mock-message" value={draft} onChange={e => setDraft(e.target.value)} placeholder="告诉我哪里需要调整，哪些部分不要改变…" maxLength={2000} required disabled={Boolean(busy)} /><div className="agent-lab__composer-bar"><small>仅「{current.name}」上下文 · 模拟对话</small><button type="submit" disabled={Boolean(busy) || !draft.trim()}>发送</button></div></form></div>}
    </section>
  </main>;
}
