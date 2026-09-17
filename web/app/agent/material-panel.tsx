"use client";
import { useEffect, useRef, useState } from "react";
import type { ScreeningBatch, ScreeningItem } from "../../lib/beta/contracts";
import { fileProblem, materialPayload, selectionProblem, type Material } from "../../lib/agent/material-client";
import { RepairPanel } from "./repair-panel";

type Snapshot = { assets: Material[]; batch: ScreeningBatch | null };
const decisionLabels = { NEEDS_ATTENTION: "■ 需要处理", NEEDS_MANUAL_CHECK: "□ 需要人工判断", NO_OBVIOUS_ISSUE: "— 未见明显问题" };

export function MaterialPanel({ projectId, skuName, onDiscuss }: { projectId: string; skuName: string; onDiscuss: (text: string) => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [repairItem, setRepairItem] = useState<string | undefined>();
  const [view, setView] = useState<"materials" | "results" | "repair" | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const applySnapshot = (next: Snapshot) => {
    setSnapshot(next);
    setSelected(previous => previous.filter(id => next.assets.some(asset => asset.id === id)));
  };
  useEffect(() => {
    alive.current = true;
    let inFlight = false, initialized = false;
    const refresh = async () => {
      if (inFlight || lock.current) return;
      inFlight = true;
      try {
        const next = await materialPayload<Snapshot>(await fetch(`/api/local-agent/materials?project=${encodeURIComponent(projectId)}`, { cache: "no-store" }));
        if (!alive.current) return;
        setSnapshot(next);
        if (!initialized) {
          setSelected(next.batch ? [...next.batch.truthAssetIds, ...next.batch.candidateAssetIds] : next.assets.filter(a => a.role !== "REPAIR_OUTPUT").map(a => a.id));
          initialized = true;
        }
      } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "无法读取商品素材。"); }
      finally { inFlight = false; }
    };
    void refresh();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 4000);
    return () => { alive.current = false; window.clearInterval(interval); };
  }, [projectId]);

  async function reload() {
    const next = await materialPayload<Snapshot>(await fetch(`/api/local-agent/materials?project=${encodeURIComponent(projectId)}`, { cache: "no-store" }));
    if (alive.current) applySnapshot(next);
    return next;
  }

  async function upload(files: File[], role: "TRUTH" | "CANDIDATE") {
    if (lock.current || !files.length) return;
    const problem = files.map(fileProblem).find(Boolean);
    if (problem) { setError(problem); return; }
    const limit = role === "TRUTH" ? 4 : 10;
    if (files.length > limit) { setError(`这次最多添加 ${limit} 张，请重新选择；没有自动丢弃任何图片。`); return; }
    lock.current = true; setError(""); setConsent(false);
    try {
      for (const [index, file] of files.entries()) {
        if (alive.current) setBusy(`正在保存 ${index + 1}/${files.length}：${file.name}`);
        let bitmap: ImageBitmap;
        try { bitmap = await createImageBitmap(file); } catch { throw new Error(`${file.name} 无法读取，请重新导出图片。`); }
        const { width, height } = bitmap; bitmap.close();
        if (width < 64 || height < 64) throw new Error(`${file.name} 尺寸为 ${width}×${height}，请使用两边均不少于 64px 的图片。`);
        const intent = await materialPayload<{ asset_id: string; upload: { url: string } }>(await fetch("/api/assets/upload-intent", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ project_id: projectId, role, file_name: file.name, mime_type: file.type, byte_size: file.size, width, height }),
        }));
        await materialPayload(await fetch(intent.upload.url, { method: "PUT", body: file }));
        if (alive.current) setSelected(previous => [...previous, intent.asset_id]);
      }
    } catch (cause) { if (alive.current) setError(`${cause instanceof Error ? cause.message : "图片保存未完成。"} 已成功保存的图片会保留；请只重选失败的文件。`); }
    finally {
      try { await reload(); } catch { if (alive.current) setError("图片状态暂时无法确认，请刷新后查看已保存素材，再决定是否重传。"); }
      lock.current = false; if (alive.current) setBusy("");
    }
  }

  async function screen() {
    if (lock.current || !snapshot || snapshot.batch?.status === "RUNNING" || !consent || selectionProblem(snapshot.assets, selected)) return;
    lock.current = true; setBusy("正在筛查所选图片，可留在这里等待结果…"); setError("");
    const ids = (role: Material["role"]) => snapshot.assets.filter(a => a.role === role && selected.includes(a.id)).map(a => a.id);
    try {
      const payload = await materialPayload<{ batch: ScreeningBatch }>(await fetch("/api/screening-batches", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: projectId, sku_name: skuName, truth_asset_ids: ids("TRUTH"), candidate_asset_ids: ids("CANDIDATE") }),
      }));
      if (alive.current) {
        setSnapshot(previous => previous ? { ...previous, batch: payload.batch } : previous);
        if (payload.batch.status === "COMPLETED") setView("results");
      }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "连接中断，请先查看任务状态，不要重复提交。"); }
    finally {
      try { await reload(); } catch { /* Keep the original outcome; the next read will recover status. */ }
      lock.current = false; if (alive.current) { setBusy(""); setConsent(false); }
    }
  }
  const running = Boolean(busy) || snapshot?.batch?.status === "RUNNING";
  const problem = snapshot ? selectionProblem(snapshot.assets, selected) : "正在读取当前商品的素材…";
  const activeView = view ?? (snapshot?.batch?.status === "COMPLETED" ? "results" : "materials");
  const readyResults = snapshot?.batch?.status === "COMPLETED";
  const discuss = (item: ScreeningItem) => {
    const name = snapshot?.assets.find(a => a.id === item.assetId)?.fileName ?? "这张图";
    onDiscuss(`关于图片「${name}」：${item.primaryIssue ?? "请帮我确认是否需要修改"}。可见证据：${item.visibleEvidence}。请先整理修改范围与需要保留的部分，不要直接执行修图。`);
  };
  return <section className="agent-materials" aria-label="当前商品素材与筛查" aria-busy={running}>
    <header className="agent-materials__heading"><h2>商品工作区</h2><small>{snapshot ? `${snapshot.assets.filter(a => a.role === "TRUTH").length} 张参考 · ${snapshot.assets.filter(a => a.role === "CANDIDATE").length} 张待检查` : "正在读取素材…"}</small></header>
    <div className="agent-materials__views" role="group" aria-label="切换商品工作区视图">
      {([{ id: "materials", label: "素材" }, { id: "results", label: "检查结果" }, { id: "repair", label: "修图与版本" }] as const).map(option => <button key={option.id} className="secondary" aria-pressed={activeView === option.id} aria-controls={`agent-view-${option.id}`} onClick={() => setView(option.id)}>{option.label}</button>)}
    </div>
    <p className="agent-materials__guidance" role="status">{running ? busy || "图片正在检查，结果会自动更新。" : activeView === "materials" ? "先选商品参考与待检查图，再确认发送。切换视图不会清空选择。" : activeView === "results" ? readyResults ? "逐张核对证据，选择要修正的图片；也可以先在对话中讨论。" : "还没有完成的检查结果，请先到素材视图添加图片并开始检查。" : "框选要修改的区域，再对比版本。只有你确认后才提交修图。"}</p>
    {error && <p className="agent-lab__error" role="alert">{error}</p>}
    <div id="agent-view-materials" hidden={activeView !== "materials"}>
    <h2>把图片放进这个商品对话</h2>
    <p>参考图说明商品真实长什么样；待检查图是你想审核的版本。上传只保存到本地，不会自动筛查。</p>
    <div className="agent-materials__upload-grid">
    {(["TRUTH", "CANDIDATE"] as const).map(role => <div className="agent-materials__group" key={role}>
      <label className="agent-materials__upload">{role === "TRUTH" ? "商品参考图 · 选择 1–4 张" : "待检查图 · 选择 1–10 张"}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={running || !snapshot} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void upload(files, role); }} />
      </label>
      <div className="agent-materials__images">{snapshot?.assets.filter(a => a.role === role).map(asset => <label key={asset.id}>
        {/* Authenticated original preview, not an optimized public image URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/assets/${asset.id}`} alt={asset.fileName} loading="lazy" />
        <span><input type="checkbox" checked={selected.includes(asset.id)} disabled={running} onChange={event => { setConsent(false); setSelected(previous => event.target.checked ? [...previous, asset.id] : previous.filter(id => id !== asset.id)); }} />{asset.fileName}</span>
        <small>{(asset.byteSize / 1024 / 1024).toFixed(2)} MB</small>
      </label>)}</div>
    </div>)}
    </div>
    <p role="status">{busy || (snapshot?.batch?.status === "RUNNING" ? "这个商品正在筛查，请等待结果，不要重复提交。" : problem ?? "图片已齐。下一步：确认图片发送范围，然后开始筛查。")}</p>
    {!problem && <label className="agent-materials__consent"><input type="checkbox" checked={consent} disabled={running} onChange={event => setConsent(event.target.checked)} />我有权使用所选图片，同意发送给已配置的筛查服务。筛查不扣修图额度，但会产生模型接口费用。</label>}
    <button disabled={running || Boolean(problem) || !consent} onClick={() => void screen()}>{snapshot?.batch ? "重新筛查所选图片" : "开始筛查所选图片"}</button>
    {snapshot?.batch?.status === "FAILED" && <p role="status">上次筛查未完成，已保存的素材仍在；确认选择后可重新筛查。</p>}
    </div>
    <div id="agent-view-results" hidden={activeView !== "results"}>
    {!readyResults && <div className="agent-materials__empty"><h3>{snapshot?.batch?.status === "RUNNING" ? "正在检查图片" : "检查结果会留在这里"}</h3><p>{snapshot?.batch?.status === "FAILED" ? "上次检查未完成，素材已保留；回到素材视图确认后重试。" : "上传商品参考图和待检查图，确认发送后开始。不会自动调用模型。"}</p><button className="secondary" onClick={() => setView("materials")}>查看商品素材</button></div>}
    {snapshot?.batch?.status === "COMPLETED" && <div className="agent-materials__results"><h3>检查结果 · {snapshot.batch.items.length} 张</h3><p>选择要修正的图片，或先在对话中讨论。结果仅对应上次提交的素材。</p>{snapshot.batch.items.map(item => <article className="agent-materials__result" key={item.id}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/assets/${item.assetId}`} alt={`检查结果：${snapshot.assets.find(a => a.id === item.assetId)?.fileName ?? "待检查图"}`} loading="lazy" />
      <div>
      <strong>{decisionLabels[item.decision]}</strong><small>{snapshot.assets.find(a => a.id === item.assetId)?.fileName ?? "原图已过期"}</small>
      <p>{item.primaryIssue ?? (item.decision === "NO_OBVIOUS_ISSUE" ? "未见明显问题，仍需要人工复验。" : "信息不足，暂不能形成可靠结论，请人工核对。")}</p><p>{item.visibleEvidence}</p>
      <div className="agent-lab__actions"><button disabled={running} onClick={() => {
        setView("repair");
        if (repairItem === item.id) {
          requestAnimationFrame(() => { const panel = document.querySelector<HTMLElement>(".agent-repair"); panel?.scrollIntoView({ block: "start" }); panel?.focus({ preventScroll: true }); });
        } else setRepairItem(item.id);
      }}>修这张</button>
      {item.decision !== "NO_OBVIOUS_ISSUE" && <button className="secondary" onClick={() => discuss(item)}>先讨论问题</button>}</div>
      </div>
    </article>)}</div>}
    </div>
    <div id="agent-view-repair" hidden={activeView !== "repair"}>
    {snapshot && <RepairPanel key={`${projectId}:${repairItem ?? "restore"}`} projectId={projectId} initialItemId={repairItem} />}
    </div>
  </section>;
}
