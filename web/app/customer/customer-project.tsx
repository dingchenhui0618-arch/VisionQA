"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  BetaProject,
  BetaSessionView,
  CreditBalance,
  RepairAttempt,
  ScreeningBatch,
  ScreeningItem,
} from "../../lib/beta/contracts";
import { CustomerShell } from "./customer-shell";

type LocalFile = { id: string; file: File; url: string; width: number; height: number };
type Region = { x: number; y: number; width: number; height: number };
type RepairDelivery = {
  attempt: RepairAttempt;
  output_url: string;
  download_url: string;
  credits: CreditBalance;
  gate: { message: string; human_confirmation_required: boolean };
};

export function CustomerProject({
  session,
  initialProject,
  initialCredits,
  initialBatch,
  initialRepair,
  initialDownloadUrl,
}: {
  session: BetaSessionView;
  initialProject: BetaProject;
  initialCredits: CreditBalance;
  initialBatch: ScreeningBatch | null;
  initialRepair: RepairAttempt | null;
  initialDownloadUrl: string | null;
}) {
  const [project] = useState(initialProject);
  const [credits, setCredits] = useState(initialCredits);
  const [skuName, setSkuName] = useState(project.name === "新 SKU 检查批次" ? "" : project.name);
  const [truthFiles, setTruthFiles] = useState<LocalFile[]>([]);
  const [candidateFiles, setCandidateFiles] = useState<LocalFile[]>([]);
  const [batch, setBatch] = useState(initialBatch);
  const [selectedItem, setSelectedItem] = useState<ScreeningItem | null>(() => {
    if (initialRepair && initialBatch) return initialBatch.items.find((item) => item.id === initialRepair.screeningItemId) ?? null;
    return null;
  });
  const [issue, setIssue] = useState(selectedItem?.primaryIssue ?? "");
  const [region, setRegion] = useState<Region>(selectedItem?.issueRegion ?? { x: 0.28, y: 0.28, width: 0.42, height: 0.36 });
  const [delivery, setDelivery] = useState<RepairDelivery | null>(() =>
    initialRepair?.status === "CAPTURED" && initialRepair.outputAssetId
      ? {
          attempt: initialRepair,
          output_url: `/api/assets/${initialRepair.outputAssetId}`,
          download_url: initialDownloadUrl ?? "",
          credits: initialCredits,
          gate: { message: "修正版已通过基础检查；仍需你人工确认。", human_confirmation_required: true },
        }
      : null,
  );
  const [busy, setBusy] = useState<"example" | "screen" | "repair" | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<{ message: string; next_action?: string } | null>(null);
  const [confirmations, setConfirmations] = useState([false, false, false]);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const stage = delivery ? 3 : batch?.status === "COMPLETED" ? (selectedItem ? 3 : 2) : 1;
  const primaryActionDisabled = !skuName.trim() || truthFiles.length < 1 || candidateFiles.length < 1 || busy !== null;
  const selectedSourceUrl = selectedItem ? `/api/assets/${selectedItem.assetId}` : "";

  async function addFiles(files: FileList | null, role: "truth" | "candidate") {
    if (!files?.length) return;
    setError(null);
    const max = role === "truth" ? 4 : 10;
    const existing = role === "truth" ? truthFiles : candidateFiles;
    const room = Math.max(0, max - existing.length);
    const additions: LocalFile[] = [];
    for (const file of [...files].slice(0, room)) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        setError({ message: `${file.name} 不是支持的格式。`, next_action: "请改用 JPG、PNG 或 WebP。" });
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError({
          message: `${file.name}（${formatBytes(file.size)}）超过单张 10 MB 限制。`,
          next_action: "请先压缩这张图片，或导出为 10 MB 以内的 JPG/WebP。",
        });
        continue;
      }
      const dimensions = await imageDimensions(file);
      additions.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), ...dimensions });
    }
    if (role === "truth") setTruthFiles((current) => [...current, ...additions].slice(0, 4));
    else setCandidateFiles((current) => [...current, ...additions].slice(0, 10));
  }

  async function loadExample() {
    if (busy) return;
    setBusy("example");
    setError(null);
    try {
      const [truth, defect, repaired] = await Promise.all([
        fileFromPublic("/fashion/demo-cardigan-truth.png", "demo-cardigan-truth.png"),
        fileFromPublic("/fashion/demo-cardigan-defect.png", "demo-cardigan-defect.png"),
        fileFromPublic("/fashion/demo-cardigan-repaired.png", "demo-cardigan-repaired.png"),
      ]);
      setSkuName("示例 SKU · 灰色针织开衫");
      setTruthFiles([truth]);
      setCandidateFiles([defect, repaired]);
    } catch {
      setError({ message: "示例 SKU 没有加载成功。", next_action: "请刷新页面后重试，或直接上传自己的图片。" });
    } finally {
      setBusy(null);
    }
  }

  async function startScreening() {
    if (primaryActionDisabled) return;
    setBusy("screen");
    setError(null);
    try {
      const total = truthFiles.length + candidateFiles.length;
      let complete = 0;
      const upload = async (entry: LocalFile, role: "TRUTH" | "CANDIDATE") => {
        setProgress(`正在上传 ${++complete}/${total}：${entry.file.name}`);
        const intentResponse = await fetch("/api/assets/upload-intent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            project_id: project.id,
            role,
            file_name: entry.file.name,
            mime_type: entry.file.type,
            byte_size: entry.file.size,
            width: entry.width,
            height: entry.height,
          }),
        });
        const intent = await readPayload<{ asset_id: string; upload: { url: string } }>(intentResponse);
        const uploadResponse = await fetch(intent.upload.url, { method: "PUT", body: entry.file });
        if (!uploadResponse.ok) throw await readCustomerError(uploadResponse);
        return String(intent.asset_id);
      };
      const truthAssetIds = [];
      for (const file of truthFiles) truthAssetIds.push(await upload(file, "TRUTH"));
      const candidateAssetIds = [];
      for (const file of candidateFiles) candidateAssetIds.push(await upload(file, "CANDIDATE"));
      setProgress("图片已上传，正在免费筛查候选图…");
      const response = await fetch("/api/screening-batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          sku_name: skuName.trim(),
          truth_asset_ids: truthAssetIds,
          candidate_asset_ids: candidateAssetIds,
        }),
      });
      const payload = await readPayload<{ batch: ScreeningBatch; credits: CreditBalance }>(response);
      setBatch(payload.batch as ScreeningBatch);
      setCredits(payload.credits as CreditBalance);
      setProgress("");
    } catch (cause) {
      setError(asCustomerError(cause));
      setProgress("");
    } finally {
      setBusy(null);
    }
  }

  function chooseRepair(item: ScreeningItem) {
    setSelectedItem(item);
    setIssue(item.primaryIssue ?? "请描述需要修正的问题");
    setRegion(item.issueRegion ?? { x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    setDelivery(null);
    setConfirmations([false, false, false]);
    setIdempotencyKey(crypto.randomUUID());
    setError(null);
  }

  async function submitRepair() {
    if (!selectedItem || !issue.trim() || busy) return;
    setBusy("repair");
    setError(null);
    try {
      const response = await fetch("/api/repair-attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          screening_item_id: selectedItem.id,
          issue: issue.trim(),
          issue_region: region,
          locked_regions: perimeterLocks(region),
          idempotency_key: idempotencyKey,
        }),
      });
      const payload = await readPayload<RepairDelivery>(response);
      setDelivery(payload);
      setCredits(payload.credits);
    } catch (cause) {
      setError(asCustomerError(cause));
      const creditResponse = await fetch("/api/credits", { cache: "no-store" });
      if (creditResponse.ok) setCredits((await creditResponse.json()) as CreditBalance);
    } finally {
      setBusy(null);
    }
  }

  return (
    <CustomerShell session={session} credits={credits}>
      <main className="customer-project">
        <header className="customer-project__header">
          <a href="/workspace">← 返回项目</a>
          <div><p className="customer-eyebrow">SKU 检查批次</p><h1>{skuName || "新 SKU 检查批次"}</h1></div>
          <span>{project.isExample || skuName.startsWith("示例 SKU") ? "示例 SKU · 非客户证据" : "客户项目"}</span>
        </header>

        <ol className="customer-stagebar" aria-label="当前进度">
          {["建立批次", "批量筛查", "修正交付"].map((label, index) => (
            <li key={label} className={stage === index + 1 ? "is-current" : stage > index + 1 ? "is-complete" : ""}>
              <span>{stage > index + 1 ? "✓" : index + 1}</span><strong>{label}</strong>
            </li>
          ))}
        </ol>

        {error ? (
          <div className="customer-message is-error" role="alert">
            <strong>{error.message}</strong>{error.next_action ? <span>{error.next_action}</span> : null}
          </div>
        ) : null}

        <div className="customer-project__layout">
          <div className="customer-project__main">
            {stage === 1 ? (
              <BatchSetup
                skuName={skuName}
                setSkuName={setSkuName}
                truthFiles={truthFiles}
                candidateFiles={candidateFiles}
                addFiles={addFiles}
                removeFile={(role, id) => role === "truth" ? setTruthFiles((files) => removeLocalFile(files, id)) : setCandidateFiles((files) => removeLocalFile(files, id))}
                loadExample={loadExample}
                startScreening={startScreening}
                busy={busy}
                progress={progress}
                disabled={primaryActionDisabled}
              />
            ) : null}

            {stage === 2 && batch ? (
              <ScreeningResults batch={batch} chooseRepair={chooseRepair} />
            ) : null}

            {stage === 3 && selectedItem && !delivery ? (
              <RepairSetup
                sourceUrl={selectedSourceUrl}
                item={selectedItem}
                issue={issue}
                setIssue={setIssue}
                region={region}
                setRegion={setRegion}
                credits={credits}
                busy={busy}
                submitRepair={submitRepair}
                back={() => setSelectedItem(null)}
              />
            ) : null}

            {stage === 3 && selectedItem && delivery ? (
              <DeliveryReview
                sourceUrl={selectedSourceUrl}
                delivery={delivery}
                confirmations={confirmations}
                setConfirmations={setConfirmations}
                nextRound={() => {
                  setDelivery(null);
                  setSelectedItem(null);
                  setConfirmations([false, false, false]);
                }}
              />
            ) : null}
          </div>

          <NextStepAssistant
            stage={stage}
            hasBatch={Boolean(batch)}
            selected={Boolean(selectedItem)}
            delivered={Boolean(delivery)}
            credits={credits}
          />
        </div>
      </main>
    </CustomerShell>
  );
}

function BatchSetup(props: {
  skuName: string;
  setSkuName: (value: string) => void;
  truthFiles: LocalFile[];
  candidateFiles: LocalFile[];
  addFiles: (files: FileList | null, role: "truth" | "candidate") => void;
  removeFile: (role: "truth" | "candidate", id: string) => void;
  loadExample: () => void;
  startScreening: () => void;
  busy: "example" | "screen" | "repair" | null;
  progress: string;
  disabled: boolean;
}) {
  return (
    <section className="customer-panel customer-batch-setup" aria-labelledby="batch-title">
      <div className="customer-panel__head">
        <div><p className="customer-eyebrow">第一步</p><h2 id="batch-title">建立这次要检查的 SKU</h2><p>真值图用于确认商品本身；候选图应当是同一用途、准备发布的一组图片。</p></div>
        <button className="customer-text-button" type="button" onClick={props.loadExample} disabled={props.busy !== null}>
          {props.busy === "example" ? "正在加载…" : "加载示例 SKU"}
        </button>
      </div>
      <label className="customer-field">
        <span>SKU 名称</span>
        <input value={props.skuName} onChange={(event) => props.setSkuName(event.target.value)} placeholder="例如：灰色针织开衫 / SKU-DENIM-001" maxLength={80} />
      </label>
      <UploadGroup
        title="商品真值图"
        help="1–4 张。优先选择白底全貌，再补关键细节。"
        files={props.truthFiles}
        max={4}
        onFiles={(files) => props.addFiles(files, "truth")}
        onRemove={(id) => props.removeFile("truth", id)}
      />
      <UploadGroup
        title="同用途候选图"
        help="1–10 张。系统会先免费筛出最需要处理的图片。"
        files={props.candidateFiles}
        max={10}
        onFiles={(files) => props.addFiles(files, "candidate")}
        onRemove={(id) => props.removeFile("candidate", id)}
      />
      <div className="customer-action-row">
        <div><strong>开始后会发生什么？</strong><span>本轮只进行免费筛查，不消耗内测额度。</span></div>
        <button className="customer-primary" type="button" onClick={props.startScreening} disabled={props.disabled}>
          {props.busy === "screen" ? "正在筛查…" : "开始免费筛查"}<span aria-hidden>→</span>
        </button>
      </div>
      {props.progress ? <p className="customer-progress" role="status">{props.progress}</p> : null}
    </section>
  );
}

function UploadGroup({ title, help, files, max, onFiles, onRemove }: {
  title: string; help: string; files: LocalFile[]; max: number;
  onFiles: (files: FileList | null) => void; onRemove: (id: string) => void;
}) {
  return (
    <fieldset className="customer-upload-group">
      <legend><strong>{title}</strong><span>{help}</span></legend>
      <label className="customer-dropzone">
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { onFiles(event.target.files); event.target.value = ""; }} />
        <span>选择图片</span><small>JPG、PNG、WebP · 单张不超过 10 MB · 已选 {files.length}/{max}</small>
      </label>
      {files.length ? (
        <ul className="customer-file-grid">
          {files.map((entry) => (
            <li key={entry.id}>
              <img src={entry.url} alt="" />
              <div><strong title={entry.file.name}>{entry.file.name}</strong><span>{entry.width} × {entry.height} · {formatBytes(entry.file.size)}</span></div>
              <button type="button" onClick={() => onRemove(entry.id)} aria-label={`移除 ${entry.file.name}`}>×</button>
            </li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}

function ScreeningResults({ batch, chooseRepair }: { batch: ScreeningBatch; chooseRepair: (item: ScreeningItem) => void }) {
  const ordered = useMemo(() => [...batch.items].sort((a, b) => decisionOrder(a.decision) - decisionOrder(b.decision)), [batch.items]);
  const counts = {
    attention: batch.items.filter((item) => item.decision === "NEEDS_ATTENTION").length,
    clear: batch.items.filter((item) => item.decision === "NO_OBVIOUS_ISSUE").length,
    manual: batch.items.filter((item) => item.decision === "NEEDS_MANUAL_CHECK").length,
  };
  return (
    <section className="customer-panel customer-screening" aria-labelledby="screening-title">
      <div className="customer-panel__head">
        <div><p className="customer-eyebrow">第二步 · 免费筛查完成</p><h2 id="screening-title">先处理最影响使用的图片</h2><p>每张只显示一个主问题。其他内部观察不会在客户流程里制造额外负担。</p></div>
        <div className="customer-screening__counts"><span><i className="is-attention" />需要处理 {counts.attention}</span><span><i className="is-manual" />人工判断 {counts.manual}</span><span><i className="is-clear" />未见明显问题 {counts.clear}</span></div>
      </div>
      <div className="customer-screening__list">
        {ordered.map((item, index) => (
          <article key={item.id} className={`customer-result is-${item.decision.toLowerCase()}`}>
            <div className="customer-result__image"><img src={`/api/assets/${item.assetId}`} alt={`候选图 ${index + 1}`} /><span>{index + 1}</span></div>
            <div className="customer-result__copy">
              <span className="customer-result__status"><i aria-hidden />{decisionLabel(item.decision)}</span>
              <h3>{item.primaryIssue ?? (item.decision === "NO_OBVIOUS_ISSUE" ? "暂时不需要优先处理" : "请人工确认商品细节")}</h3>
              <p>{item.visibleEvidence}</p>
            </div>
            {item.decision !== "NO_OBVIOUS_ISSUE" ? (
              <button className="customer-secondary" type="button" onClick={() => chooseRepair(item)}>修这张 <span aria-hidden>→</span></button>
            ) : <span className="customer-result__done">可继续使用</span>}
          </article>
        ))}
      </div>
    </section>
  );
}

function RepairSetup({ sourceUrl, item, issue, setIssue, region, setRegion, credits, busy, submitRepair, back }: {
  sourceUrl: string; item: ScreeningItem; issue: string; setIssue: (value: string) => void; region: Region; setRegion: (value: Region) => void;
  credits: CreditBalance; busy: "example" | "screen" | "repair" | null; submitRepair: () => void; back: () => void;
}) {
  return (
    <section className="customer-panel customer-repair" aria-labelledby="repair-title">
      <div className="customer-panel__head">
        <div><p className="customer-eyebrow">第三步 · 本次修正</p><h2 id="repair-title">确认要改什么，以及哪些地方不能变</h2><p>在图片上拖动框选问题区域。系统会把其余区域作为锁定范围记录。</p></div>
        <button className="customer-text-button" type="button" onClick={back}>返回筛查结果</button>
      </div>
      <div className="customer-repair__grid">
        <div>
          <RegionSelector src={sourceUrl} region={region} onChange={setRegion} />
          <p className="customer-region-value">问题区域：X {percent(region.x)} · Y {percent(region.y)} · 宽 {percent(region.width)} · 高 {percent(region.height)}</p>
        </div>
        <div className="customer-repair__form">
          <label className="customer-field"><span>主问题</span><textarea value={issue} onChange={(event) => setIssue(event.target.value)} maxLength={500} rows={5} /></label>
          <div className="customer-repair__evidence"><strong>为什么修这张</strong><p>{item.visibleEvidence}</p></div>
          <div className="customer-charge-note"><div><strong>本次成功后消耗 1 次额度</strong><span>当前可用 {credits.available} 次 · 预计 1–3 分钟</span></div><p>技术失败、超时、没有有效图片或基础检查拦截时，额度会自动释放。</p></div>
          <button className="customer-primary" type="button" onClick={submitRepair} disabled={!issue.trim() || busy !== null || credits.available < 1}>
            {busy === "repair" ? "正在生成修正版…" : credits.available < 1 ? "申请更多内测额度" : "提交修正"}<span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function RegionSelector({ src, region, onChange }: { src: string; region: Region; onChange: (region: Region) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  function point(event: ReactPointerEvent) {
    const rect = ref.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
  }
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = point(event);
    onChange({ x: start.current.x, y: start.current.y, width: 0.01, height: 0.01 });
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const current = point(event);
    onChange({
      x: Math.min(start.current.x, current.x),
      y: Math.min(start.current.y, current.y),
      width: Math.max(0.01, Math.abs(current.x - start.current.x)),
      height: Math.max(0.01, Math.abs(current.y - start.current.y)),
    });
  }
  function pointerUp() { start.current = null; }
  return (
    <div className="customer-region-selector" ref={ref} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} role="img" aria-label="拖动框选问题区域">
      <img src={src} alt="待修正候选图" draggable={false} />
      <div className="customer-region-selector__mask" />
      <div className="customer-region-selector__box" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}><span>问题区域</span></div>
    </div>
  );
}

function DeliveryReview({ sourceUrl, delivery, confirmations, setConfirmations, nextRound }: {
  sourceUrl: string; delivery: RepairDelivery; confirmations: boolean[]; setConfirmations: (value: boolean[]) => void; nextRound: () => void;
}) {
  const allConfirmed = confirmations.every(Boolean);
  const labels = ["商品款式、颜色和关键细节符合真值", "人物、手脚和穿着关系没有新增异常", "背景、构图和非目标区域没有明显变化"];
  return (
    <section className="customer-panel customer-delivery" aria-labelledby="delivery-title">
      <div className="customer-panel__head"><div><p className="customer-eyebrow">修正版已返回</p><h2 id="delivery-title">对比确认后再下载</h2><p>{delivery.gate.message}</p></div><span className="customer-result__status is-captured"><i />已扣 1 次额度</span></div>
      <div className="customer-delivery__compare">
        <figure><span>修正前</span><img src={sourceUrl} alt="修正前候选图" /></figure>
        <figure><span>修正后</span><img src={delivery.output_url} alt="修正后候选图" /></figure>
      </div>
      <fieldset className="customer-confirmations"><legend>下载前请确认三项</legend>{labels.map((label, index) => <label key={label}><input type="checkbox" checked={confirmations[index]} onChange={(event) => setConfirmations(confirmations.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))} /><span>{label}</span></label>)}</fieldset>
      <div className="customer-action-row"><button className="customer-text-button" type="button" onClick={nextRound}>继续处理下一张</button><a className={`customer-primary${allConfirmed ? "" : " is-disabled"}`} href={allConfirmed ? delivery.download_url : undefined} aria-disabled={!allConfirmed} onClick={(event) => { if (!allConfirmed) event.preventDefault(); }}>下载修正版 <span aria-hidden>↓</span></a></div>
    </section>
  );
}

function NextStepAssistant({ stage, hasBatch, selected, delivered, credits }: { stage: number; hasBatch: boolean; selected: boolean; delivered: boolean; credits: CreditBalance }) {
  const copy = delivered
    ? { title: "检查三项后下载", body: "确认商品、人物和非目标区域。发现问题时先不要下载，继续发起下一轮修正。" }
    : stage === 3 && selected
      ? { title: "框选区域并提交", body: `成功后扣 1 次。你还有 ${credits.available} 次可用内测额度；技术失败会自动退回。` }
      : hasBatch
        ? { title: "先修“需要处理”的图片", body: "每张只展示一个最重要的问题。你可以先从影响商品真实性最大的图片开始。" }
        : { title: "准备两组图片", body: "商品真值 1–4 张，候选图 1–10 张。上传后点击“开始免费筛查”。" };
  return <aside className="customer-assistant" aria-live="polite"><span className="customer-assistant__face" aria-hidden>VQ</span><div><small>下一步助手</small><strong>{copy.title}</strong><p>{copy.body}</p></div></aside>;
}

async function fileFromPublic(path: string, name: string): Promise<LocalFile> {
  const response = await fetch(path);
  if (!response.ok) throw new Error("example unavailable");
  const blob = await response.blob();
  const file = new File([blob], name, { type: blob.type || "image/png" });
  const dimensions = await imageDimensions(file);
  return { id: crypto.randomUUID(), file, url: URL.createObjectURL(file), ...dimensions };
}

function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  return createImageBitmap(file).then((bitmap) => {
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  });
}

function removeLocalFile(files: LocalFile[], id: string): LocalFile[] {
  const target = files.find((file) => file.id === id);
  if (target) URL.revokeObjectURL(target.url);
  return files.filter((file) => file.id !== id);
}

async function readPayload<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: { message: string; next_action?: string } };
  if (!response.ok) throw payload.error ?? { message: "本次操作没有完成。", next_action: "请稍后重试。" };
  return payload;
}

async function readCustomerError(response: Response) {
  try { return (await response.json()).error; } catch { return { message: "图片上传没有完成。", next_action: "请重新上传这张图片。" }; }
}

function asCustomerError(cause: unknown): { message: string; next_action?: string } {
  return cause && typeof cause === "object" && "message" in cause
    ? { message: String(cause.message), next_action: "next_action" in cause ? String(cause.next_action) : undefined }
    : { message: "本次操作没有完成。", next_action: "请稍后重试。" };
}

function perimeterLocks(region: Region): Region[] {
  const locks: Region[] = [];
  if (region.y > 0.01) locks.push({ x: 0, y: 0, width: 1, height: region.y });
  if (region.x > 0.01) locks.push({ x: 0, y: region.y, width: region.x, height: region.height });
  if (region.x + region.width < 0.99) locks.push({ x: region.x + region.width, y: region.y, width: 1 - region.x - region.width, height: region.height });
  if (region.y + region.height < 0.99) locks.push({ x: 0, y: region.y + region.height, width: 1, height: 1 - region.y - region.height });
  return locks.length ? locks : [{ x: 0, y: 0, width: 0.01, height: 0.01 }];
}

function decisionOrder(decision: ScreeningItem["decision"]): number { return { NEEDS_ATTENTION: 0, NEEDS_MANUAL_CHECK: 1, NO_OBVIOUS_ISSUE: 2 }[decision]; }
function decisionLabel(decision: ScreeningItem["decision"]): string { return { NEEDS_ATTENTION: "需要处理", NEEDS_MANUAL_CHECK: "需要人工判断", NO_OBVIOUS_ISSUE: "未见明显问题" }[decision]; }
function formatBytes(bytes: number): string { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.ceil(bytes / 1024)} KB`; }
function percent(value: number): string { return `${Math.round(value * 100)}%`; }
function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
