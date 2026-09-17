"use client";
import { useEffect, useRef, useState } from "react";
import type { CreditBalance, RepairAttempt, ScreeningItem } from "../../lib/beta/contracts";
import { materialPayload, type Material } from "../../lib/agent/material-client";
import { lockedOutside, regionProblem, type Region } from "../../lib/agent/repair-client";

type Snapshot = { assets: Material[]; items: ScreeningItem[]; repairs: RepairAttempt[]; credits: CreditBalance };
const defaultRegion: Region = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
export function RepairPanel({ projectId, initialItemId }: { projectId: string; initialItemId?: string }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [itemId, setItemId] = useState(initialItemId ?? "");
  const [sourceId, setSourceId] = useState("");
  const [issue, setIssue] = useState("");
  const [region, setRegion] = useState<Region>(defaultRegion);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [checks, setChecks] = useState([false, false, false]);
  const [checkedVersion, setCheckedVersion] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<Record<string, unknown> | null>(null);
  const lock = useRef(false);
  const live = useRef(true);
  const initialized = useRef(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  function chooseItem(item: ScreeningItem, attempt?: RepairAttempt) {
    setItemId(item.id); setSourceId(attempt?.sourceAssetId ?? item.assetId);
    setIssue(attempt?.issue ?? item.primaryIssue ?? ""); setRegion(attempt?.issueRegion ?? item.issueRegion ?? defaultRegion);
    setConsent(false); setChecks([false, false, false]); setSelectedVersion(""); pending.current = null;
  }
  async function refresh() {
    const next = await materialPayload<Snapshot>(await fetch(`/api/local-agent/materials?project=${encodeURIComponent(projectId)}`, { cache: "no-store" }));
    if (!live.current) return;
    setData(next);
    if (!initialized.current && next.items.length) {
      const last = next.repairs.at(-1);
      const first = next.items.find(i => i.id === initialItemId) ?? next.items.find(i => i.id === last?.screeningItemId) ?? next.items[0];
      chooseItem(first, next.repairs.filter(a => a.screeningItemId === first.id).at(-1));
      initialized.current = true;
    }
    if (pending.current && next.repairs.some(a => a.idempotencyKey === pending.current?.idempotency_key)) {
      setUncertain(false);
      pending.current = null; setConsent(false);
    }
  }
  useEffect(() => {
    live.current = true;
    let reading = false;
    const read = async () => {
      if (reading || lock.current) return;
      reading = true;
      try { await refresh(); } catch (cause) { if (live.current) setError(cause instanceof Error ? cause.message : "无法读取修图记录。"); }
      finally { reading = false; }
    };
    void read();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void read(); }, 3000);
    return () => { live.current = false; window.clearInterval(timer); };
    // Project/item changes remount this component; polling must not replace user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const item = data?.items.find(i => i.id === itemId);
  const attempts = data?.repairs.filter(a => a.screeningItemId === itemId) ?? [];
  const versions = attempts.filter(a => a.status === "CAPTURED" && a.outputAssetId);
  const version = versions.find(a => a.id === selectedVersion) ?? versions.at(-1);
  const fullyReviewed = Boolean(version && checkedVersion === version.id && checks.every(Boolean));
  const running = data?.repairs.find(a => a.status === "HELD" || a.status === "RUNNING");
  const disabled = busy || Boolean(running) || uncertain;
  const latest = attempts.at(-1);
  const available = (id: string) => Boolean(data?.assets.some(a => a.id === id));
  const name = (id: string) => data?.assets.find(a => a.id === id)?.fileName ?? "图片已过期";
  const problem = regionProblem(region);

  async function submit() {
    if (lock.current || !item || running) return;
    if (!uncertain && (!consent || !issue.trim() || problem || !available(sourceId))) return;
    pending.current ??= { project_id: projectId, screening_item_id: item.id, source_asset_id: sourceId, issue: issue.trim(), issue_region: region, locked_regions: lockedOutside(region), idempotency_key: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError(""); setChecks([false, false, false]);
    try {
      const response = await fetch("/api/repair-attempts", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pending.current),
      });
      // Validation rejection cannot have dispatched a task. Transport/server errors remain uncertain.
      if ([400, 401, 402, 403, 404, 422].includes(response.status)) pending.current = null;
      const payload = await materialPayload<{ state: string; attempt: RepairAttempt; error?: { message: string } }>(response);
      if (live.current) { setUncertain(false); setConsent(false); setSelectedVersion(""); if (payload.error) setError(payload.error.message); }
      // Only confirmed server acknowledgement clears the request identity.
      pending.current = null;
      await refresh();
    } catch (cause) {
      if (live.current) { setUncertain(Boolean(pending.current)); setError(`${cause instanceof Error ? cause.message : "连接未完成。"}${pending.current ? " 请先核对本轮状态；再次确认沿用同一任务编号，不会新建重复任务。" : ""}`); }
    } finally { lock.current = false; if (live.current) setBusy(false); }
  }
  async function download(requireReview: boolean, suffix: string) {
    if (!version || (requireReview && !fullyReviewed) || lock.current || !available(version.outputAssetId!)) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await materialPayload<{ state: string; download_url?: string }>(await fetch(`/api/repair-attempts?attempt_id=${encodeURIComponent(version.id)}`, { cache: "no-store" }));
      if (result.state !== "COMPLETED" || !result.download_url) throw new Error("该版本暂时无法下载，请刷新确认图片是否仍有效。");
      const url = new URL(result.download_url, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/assets/")) throw new Error("下载地址无法使用。");
      const response = await fetch(url.href, { cache: "no-store" });
      if (!response.ok) throw new Error("该版本文件已过期，请刷新后确认是否仍可预览。");
      const mime = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
      const extension = mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : null;
      if (!extension) throw new Error("下载内容不是可复验的图片文件。");
      const blob = await response.blob();
      if (blob.size > 20 * 1024 * 1024) throw new Error("图片文件超过 20MB，本次未下载。");
      const blobUrl = URL.createObjectURL(blob);
      const versionNumber = versions.findIndex(entry => entry.id === version.id) + 1;
      const link = document.createElement("a"); link.href = blobUrl; link.download = `VisionQA-V${versionNumber}-${suffix}.${extension}`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (cause) { if (live.current) setError(cause instanceof Error ? cause.message : "下载没有完成。"); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  }
  if (!data?.items.length || !item) return <p role="status">完成图片筛查后，可在这里选择问题图并开始修正。</p>;
  return <section className="agent-repair" aria-label="对话内修图与版本" aria-busy={Boolean(running) || busy}>
    <h2>修这张，保留其他部分</h2>
    <label>待修图片<select value={itemId} disabled={disabled} onChange={e => { const next = data.items.find(i => i.id === e.target.value); if (next) chooseItem(next); }}>
      {data.items.map((i, index) => <option value={i.id} key={i.id}>{index + 1}. {name(i.assetId)} · {i.primaryIssue ?? "人工指定问题"}</option>)}
    </select></label>
    <label>本轮以哪个版本为基础<select value={sourceId} disabled={disabled} onChange={e => { setSourceId(e.target.value); setConsent(false); pending.current = null; }}>
      <option value={item.assetId}>原图 · {name(item.assetId)}</option>
      {versions.map((a, index) => <option value={a.outputAssetId!} key={a.id} disabled={!available(a.outputAssetId!)}>修正版 {index + 1}{!available(a.outputAssetId!) ? "（已过期）" : ""}</option>)}
    </select></label>
    <div className="agent-repair__region" role="group" aria-label="框选修改区域，也可使用下方百分比输入" onPointerDown={event => {
      if (disabled || !available(sourceId)) return;
      const rect = event.currentTarget.getBoundingClientRect(); drag.current = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }; event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={event => {
      if (!drag.current || disabled) return;
      const rect = event.currentTarget.getBoundingClientRect(), end = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
      setRegion({ x: Math.min(drag.current.x, end.x), y: Math.min(drag.current.y, end.y), width: Math.abs(end.x - drag.current.x), height: Math.abs(end.y - drag.current.y) }); setConsent(false);
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/assets/${sourceId}`} alt="本轮修图母版" draggable={false} />
      <span className="agent-repair__box" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} />
    </div>
    <p>拖动框选问题，或输入百分比。框外区域将作为保持不变的范围记录；生成后仍需检查是否漂移。</p>
    <div className="agent-repair__coordinates">{(["x", "y", "width", "height"] as const).map((key, index) => <label key={key}>{["左边距", "上边距", "宽度", "高度"][index]} %<input type="number" min="0" max="100" step="1" disabled={disabled} value={Math.round(region[key] * 100)} onChange={e => { setRegion(r => ({ ...r, [key]: Number(e.target.value) / 100 })); setConsent(false); }} /></label>)}</div>
    <label>只修改什么<textarea value={issue} rows={3} maxLength={500} disabled={disabled} onChange={e => { setIssue(e.target.value); setConsent(false); }} /></label>
    {problem && <p role="status">{problem}</p>}
    <p>内测额度：可用 {data.credits.available} 次，冻结 {data.credits.held} 次。成功返回并通过基础检查后扣 1 次，预计 1–3 分钟；技术失败或基础检查拦截时退回。</p>
    <label className="agent-materials__consent"><input type="checkbox" checked={consent} disabled={disabled} onChange={e => setConsent(e.target.checked)} />确认当前母版、修改范围及要求，同意发送图片进行本轮修正。</label>
    {uncertain ? <button disabled={busy} onClick={() => void submit()}>重新确认本轮提交状态</button> : <button disabled={disabled || !consent || !issue.trim() || Boolean(problem) || !available(sourceId) || data.credits.available < 1} onClick={() => void submit()}>提交本轮修正</button>}
    {data.credits.available < 1 && <p>额度不足，请联系内测管理员申请；已有版本仍可查看和下载。</p>}
    {running && <p role="status">正在修正。不要重复提交；可稍后回到这个商品对话查看。</p>}
    {latest?.status === "RELEASED" && <p role="status">上轮未完成，未扣额度。{latest.failureReason}</p>}
    {error && <p className="agent-lab__error" role="alert">{error}</p>}
    {version && <div className="agent-repair__delivery"><h3>前后对比与历史版本</h3><label>查看修正版<select value={version.id} disabled={busy} onChange={e => { setSelectedVersion(e.target.value); setChecks([false, false, false]); }}>
      {versions.map((v, i) => <option value={v.id} key={v.id}>修正版 {i + 1} · {v.issue}</option>)}
    </select></label><div className="agent-repair__compare">{[{ id: version.sourceAssetId, label: "这一轮修改前" }, { id: version.outputAssetId!, label: "这一轮修改后" }].map(part => <figure key={part.label}><figcaption>{part.label}</figcaption>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {available(part.id) ? <img src={`/api/assets/${part.id}`} alt={part.label} /> : <p>图片已过期，无法预览。</p>}
    </figure>)}</div>
      {["商品颜色、结构与参考一致", "人物、构图及非目标区域未异常变化", "目标问题已解决，可以交付"].map((text, i) => <label className="agent-materials__consent" key={text}><input type="checkbox" checked={checkedVersion === version.id && checks[i]} onChange={e => { setCheckedVersion(version.id); setChecks(old => old.map((v, j) => j === i ? e.target.checked : checkedVersion === version.id && v)); }} />{text}</label>)}
      <div className="agent-lab__actions"><button disabled={busy || !available(version.outputAssetId!)} onClick={() => void download(false, "待复验稿")}>下载待复验稿</button><button disabled={busy || !fullyReviewed || !available(version.outputAssetId!)} onClick={() => void download(true, "已确认版本")}>下载已确认版本</button><button className="secondary" disabled={disabled || !available(version.outputAssetId!)} onClick={() => { setSourceId(version.outputAssetId!); setIssue(""); setConsent(false); pending.current = null; }}>以此版本继续修正</button></div>
      <p>待复验稿仅供人工复核，不代表商品已通过或可交付。继续修正会创建新一轮，保留旧版本；基础检查通过不代表商品绝对正确。</p>
    </div>}
  </section>;
}
