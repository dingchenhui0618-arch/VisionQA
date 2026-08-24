"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadBlob } from "../lib/visionqa/batch-download";
import {
  AI_SUPER_RESOLUTION_CAPABILITY,
  calculate4kDeliveryDimensions,
  createLocal4kDelivery,
  createUpscaleFileName,
  createUpscaleJobReceipt,
  inspectImageFile,
  LOCAL_UPSCALE_CAPABILITY,
  type UpscaleJobReceipt,
} from "../lib/visionqa/upscale";

type RepairAsset = {
  id: number;
  src: string;
  productLabel: string;
  repairPrompt: string;
  lockedAttributes: string;
  issues: Array<{ title: string; severity: string }>;
};

type RepairWorkspaceProps = {
  asset: RepairAsset;
  sourceFile?: File | null;
  outputFile: File | null;
  onOutputFileChange: (file: File | null) => void;
  checks: string[];
  onChecksChange: (checks: string[]) => void;
  upscaleOutputFile: File | null;
  upscaleReceipt: UpscaleJobReceipt | null;
  onUpscaleReady: (file: File, receipt: UpscaleJobReceipt) => void;
  isDemo: boolean;
  onBack: () => void;
  onContinue: () => void;
};

const providers = [
  { id: "seedream", name: "Seedream", fit: "保留为图像编辑适配器候选", state: "API 未配置" },
  { id: "qwen-image", name: "千问图像编辑", fit: "保留为阿里云链路候选", state: "改图接口未配置" },
  { id: "gpt-image", name: "GPT Image", fit: "保留为图像编辑适配器候选", state: "API 未配置" },
] as const;

const reviewChecks = [
  "商品颜色、版型、图案与基准图一致",
  "评审指出的目标问题已经修复",
  "人物、背景和非目标商品区域没有漂移",
  "Logo、文字与品牌资产没有被模型猜写",
] as const;

export function RepairWorkspace({
  asset,
  sourceFile = null,
  outputFile,
  onOutputFileChange,
  checks,
  onChecksChange,
  upscaleOutputFile,
  upscaleReceipt,
  onUpscaleReady,
  isDemo,
  onBack,
  onContinue,
}: RepairWorkspaceProps) {
  const [provider, setProvider] = useState<(typeof providers)[number]["id"]>("seedream");
  const [taskCreated, setTaskCreated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sourceInspection, setSourceInspection] = useState<{
    sourceKey: string;
    width: number;
    height: number;
  } | null>(null);
  const [upscaleState, setUpscaleState] = useState<
    | { kind: "idle" }
    | { kind: "running"; sourceKey: string }
    | { kind: "ready"; sourceKey: string; file: File; receipt: UpscaleJobReceipt; durationMs: number }
    | { kind: "error"; sourceKey: string; message: string }
  >({ kind: "idle" });

  const outputUrl = useMemo(() => outputFile ? URL.createObjectURL(outputFile) : "", [outputFile]);
  useEffect(() => () => { if (outputUrl) URL.revokeObjectURL(outputUrl); }, [outputUrl]);

  const selectedProvider = providers.find((item) => item.id === provider)!;
  const reviewed = Boolean(outputFile) && checks.length === reviewChecks.length;
  const upscaleSource = outputFile ?? sourceFile;
  const upscaleSourceKey = upscaleSource
    ? `${upscaleSource.name}-${upscaleSource.size}-${upscaleSource.lastModified}`
    : "";
  const sourceDimensions =
    sourceInspection?.sourceKey === upscaleSourceKey
      ? { width: sourceInspection.width, height: sourceInspection.height }
      : null;
  const activeUpscaleState =
    upscaleState.kind === "idle" || upscaleState.sourceKey === upscaleSourceKey
      ? upscaleState
      : ({ kind: "idle" } as const);
  const targetDimensions = sourceDimensions
    ? calculate4kDeliveryDimensions(sourceDimensions.width, sourceDimensions.height)
    : null;
  const readyUpscaleFile =
    activeUpscaleState.kind === "ready" ? activeUpscaleState.file : upscaleOutputFile;
  const readyUpscaleReceipt =
    activeUpscaleState.kind === "ready" ? activeUpscaleState.receipt : upscaleReceipt;

  useEffect(() => {
    let active = true;
    if (!upscaleSource) return () => { active = false; };
    inspectImageFile(upscaleSource)
      .then((dimensions) => {
        if (active) setSourceInspection({ sourceKey: upscaleSourceKey, ...dimensions });
      })
      .catch(() => {
        if (active) setSourceInspection(null);
      });
    return () => { active = false; };
  }, [upscaleSource, upscaleSourceKey]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(asset.repairPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const exportJob = () => {
    const payload = {
      schema_version: "repair-job-v0.1",
      asset_id: asset.id,
      asset_name: asset.productLabel,
      provider,
      provider_execution_status: "NOT_CONNECTED",
      issue_list: asset.issues,
      repair_prompt: asset.repairPrompt,
      locked_attributes: asset.lockedAttributes.split("、").filter(Boolean),
      output_supplied_by_user: Boolean(outputFile),
      human_review_checks: checks,
      human_final_review_required: true,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "VisionQA-repair-job.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const runLocal4kDelivery = async () => {
    if (!upscaleSource || !reviewed) return;
    setUpscaleState({ kind: "running", sourceKey: upscaleSourceKey });
    try {
      const result = await createLocal4kDelivery(upscaleSource, {
        mimeType: "image/jpeg",
        quality: 0.94,
      });
      const fileName = createUpscaleFileName(
        upscaleSource.name,
        result.dimensions,
        result.mimeType,
      );
      const file = new File([result.blob], fileName, {
        type: result.mimeType,
        lastModified: Date.now(),
      });
      const receipt = createUpscaleJobReceipt({
        sourceName: upscaleSource.name,
        sourceBytes: upscaleSource.size,
        dimensions: result.dimensions,
      });
      setUpscaleState({
        kind: "ready",
        sourceKey: upscaleSourceKey,
        file,
        receipt,
        durationMs: result.durationMs,
      });
      onUpscaleReady(file, receipt);
    } catch (error) {
      setUpscaleState({
        kind: "error",
        sourceKey: upscaleSourceKey,
        message: error instanceof Error ? error.message : "4K 交付文件生成失败。",
      });
    }
  };

  const downloadUpscaleReceipt = (receipt: UpscaleJobReceipt) => {
    downloadBlob(
      new Blob([JSON.stringify(receipt, null, 2)], {
        type: "application/json;charset=utf-8",
      }),
      "VisionQA-upscale-receipt.json",
    );
  };

  return (
    <section className="workspace-page repair-page" aria-labelledby="repair-title">
      <header className="page-heading">
        <div>
          <p className="page-context">第四步 · 修正与交付</p>
          <h1 id="repair-title">只改问题区域，商品身份保持不变。</h1>
          <p>先生成可审计的改图任务，再由外部工具或未来 API 产生候选图。修改结果必须重新检查商品一致性与非目标区域漂移。</p>
        </div>
        <button className="quiet-button" type="button" onClick={onBack}>返回问题诊断</button>
      </header>

      <section className="repair-command" aria-labelledby="repair-command-title">
        <div className="repair-command-heading">
          <div><span>改图任务</span><h2 id="repair-command-title">选择执行方案，确认修复边界。</h2></div>
          <strong>{isDemo ? "示例素材" : `当前图片 ${String(asset.id).padStart(3, "0")}`}</strong>
        </div>
        <div className="provider-choice-grid" role="radiogroup" aria-label="改图模型方案">
          {providers.map((item) => (
            <button key={item.id} type="button" role="radio" aria-checked={provider === item.id} onClick={() => setProvider(item.id)}>
              <span>{item.name}</span><p>{item.fit}</p><small>{item.state}</small>
            </button>
          ))}
        </div>
        <div className="repair-brief">
          <div><span>需要修复</span><strong>{asset.issues.length ? asset.issues.map((item) => item.title).join(" / ") : "当前没有真实问题，展示任务结构"}</strong></div>
          <div><span>必须锁定</span><strong>{asset.lockedAttributes || "等待商品基准确认"}</strong></div>
          <div className="repair-prompt-row"><span>改图 Prompt</span><p>{asset.repairPrompt}</p><button className="text-button" type="button" onClick={() => void copyPrompt()}>{copied ? "已复制" : "复制"}</button></div>
        </div>
        <div className="repair-task-actions">
          <button className="primary-button" type="button" onClick={() => setTaskCreated(true)}>建立改图任务</button>
          <button className="quiet-button" type="button" onClick={exportJob}>导出任务 JSON</button>
          <span>{taskCreated ? `${selectedProvider.name} 任务草案已建立，等待外部生成或 API 接入。` : "不会在未配置 API 时伪装生成成功。"}</span>
        </div>
      </section>

      <section className="repair-comparison" aria-labelledby="repair-comparison-title">
        <div className="section-title-row">
          <div><span>修改前后对比</span><h2 id="repair-comparison-title">把外部改图结果带回同一张审片台。</h2></div>
          <strong>{reviewed ? "人工复审完成" : outputFile ? "等待逐项确认" : "等待改图结果"}</strong>
        </div>
        <div className="comparison-stage">
          <figure>
            <figcaption><span>BEFORE</span><strong>原始 AI 模特草图</strong></figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.src} alt={`${asset.productLabel} 修改前`} />
          </figure>
          <figure className={!outputUrl ? "comparison-empty" : undefined}>
            <figcaption><span>AFTER</span><strong>改图候选</strong></figcaption>
            {outputUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={outputUrl} alt={`${asset.productLabel} 修改后候选`} />
              </>
            ) : <div><strong>尚无改图结果</strong><p>可先在 Seedream、千问或 GPT 中执行任务，再上传结果进行对比复审。</p></div>}
          </figure>
        </div>
        <label className="repair-output-upload">
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { onOutputFileChange(event.currentTarget.files?.[0] ?? null); onChecksChange([]); event.currentTarget.value = ""; }} />
          <strong>{outputFile ? "更换改图结果" : "上传改图结果"}</strong>
          <span>{outputFile?.name ?? "当前为半自动工作流：外部生成，VisionQA 统一复审"}</span>
        </label>
      </section>

      <section className="repair-review-sheet" aria-labelledby="repair-review-title">
        <div><span>人工复审 Gate</span><h2 id="repair-review-title">不是变好看就算完成。</h2><p>四项全部确认后，才可以把改图候选作为营销内容依据。</p></div>
        <div className="repair-check-list">
          {reviewChecks.map((check) => <label key={check}><input type="checkbox" checked={checks.includes(check)} disabled={!outputFile} onChange={() => onChecksChange(checks.includes(check) ? checks.filter((item) => item !== check) : [...checks, check])} /><span>{check}</span></label>)}
        </div>
        <div className="repair-handoff">
          <span>{reviewed ? "已形成一张人工确认的改图候选，可以进入清晰度交付。" : "未完成四项复验前，不生成最终交付文件。"}</span>
          <button className="quiet-button" type="button" onClick={onContinue}>返回项目总览</button>
        </div>
      </section>

      <section className="upscale-delivery" aria-labelledby="upscale-title">
        <header>
          <div>
            <span>交付清晰度</span>
            <h2 id="upscale-title">修正完成后，再生成 4K 文件。</h2>
            <p>清晰度处理不会替代商品一致性复验。当前先提供完全本机的 4K 尺寸交付，真实 AI 细节重建保留独立授权 Gate。</p>
          </div>
          <strong>{reviewed ? "可以处理" : "等待人工复验"}</strong>
        </header>

        <div className="upscale-source-line">
          <div><span>当前来源</span><strong>{outputFile ? "人工复验后的改图结果" : sourceFile ? "原始 AI 模特草图" : "尚无可处理文件"}</strong></div>
          <div><span>原始尺寸</span><strong>{sourceDimensions ? `${sourceDimensions.width} × ${sourceDimensions.height}` : "等待读取"}</strong></div>
          <div><span>4K 目标</span><strong>{targetDimensions ? `${targetDimensions.targetWidth} × ${targetDimensions.targetHeight}` : "—"}</strong></div>
        </div>

        <div className="upscale-methods" role="list" aria-label="清晰度处理方式">
          <article role="listitem">
            <div><span>本机可用</span><h3>{LOCAL_UPSCALE_CAPABILITY.label}</h3></div>
            <p>{LOCAL_UPSCALE_CAPABILITY.boundary}</p>
            <dl><div><dt>图片外传</dt><dd>不会</dd></div><div><dt>新增细节</dt><dd>不会</dd></div></dl>
            <button
              className="primary-button"
              type="button"
              disabled={!reviewed || !upscaleSource || activeUpscaleState.kind === "running" || targetDimensions?.alreadyAtTarget}
              onClick={() => void runLocal4kDelivery()}
            >
              {targetDimensions?.alreadyAtTarget ? "原图已达到 4K 长边" : activeUpscaleState.kind === "running" ? "正在生成 4K 文件" : "生成 4K 尺寸文件"}
            </button>
          </article>
          <article className="is-disabled" role="listitem">
            <div><span>等待授权</span><h3>{AI_SUPER_RESOLUTION_CAPABILITY.label}</h3></div>
            <p>{AI_SUPER_RESOLUTION_CAPABILITY.boundary}</p>
            <dl><div><dt>图片外传</dt><dd>取决于 Provider</dd></div><div><dt>新增细节</dt><dd>模型重建，必须复验</dd></div></dl>
            <button className="quiet-button" type="button" disabled>Provider 未配置</button>
          </article>
        </div>

        {readyUpscaleFile && readyUpscaleReceipt && (
          <div className="upscale-result" role="status">
            <div>
              <span>本机处理完成</span>
              <strong>{readyUpscaleFile.name}</strong>
              <small>{(readyUpscaleFile.size / 1024 / 1024).toFixed(2)} MB · {activeUpscaleState.kind === "ready" ? `${activeUpscaleState.durationMs} ms · ` : "已从本机项目恢复 · "}未进行 AI 细节重建</small>
            </div>
            <div>
              <button className="primary-button" type="button" onClick={() => downloadBlob(readyUpscaleFile, readyUpscaleFile.name)}>下载 4K 文件</button>
              <button className="quiet-button" type="button" onClick={() => downloadUpscaleReceipt(readyUpscaleReceipt)}>下载处理凭证</button>
            </div>
          </div>
        )}
        {activeUpscaleState.kind === "error" && <p className="upscale-error" role="alert">{activeUpscaleState.message}</p>}
      </section>
    </section>
  );
}
