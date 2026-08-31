"use client";

import type { Dispatch, SetStateAction } from "react";

type IntakeItem = {
  id: number;
  name: string;
  src: string;
  status: "ready" | "running" | "done" | "error";
  selected: boolean;
  error?: string;
};

type SubmissionContext = {
  channel: string;
  placement: string;
  referenceStatus: "complete" | "missing";
  provenanceStatus: "confirmed_ai" | "confirmed_real" | "unknown";
};

type AssetIntakeWorkspaceProps = {
  items: IntakeItem[];
  processing: boolean;
  errorMessage?: string;
  submissionContext: SubmissionContext;
  setSubmissionContext: Dispatch<SetStateAction<SubmissionContext>>;
  onSelect: (files: File[]) => Promise<void>;
  onToggle: (id: number) => void;
  onClear: () => void;
  onContinue: () => void;
};

const channelOptions = ["天猫", "淘宝", "唯品会", "抖音商城", "小红书商城", "京东", "拼多多", "微信小店", "独立站"] as const;
const provenanceOptions = [
  { value: "confirmed_ai", label: "确认是 AI 生成图", note: "检查商品逻辑、人物与生成漂移" },
  { value: "confirmed_real", label: "确认是真人或实拍图", note: "检查商品呈现、人物接触与画面问题" },
  { value: "unknown", label: "暂不确定", note: "系统会保留来源未知状态，不强行推断" },
] as const;

const assetRoleOptions = [
  { value: "AI商品图", label: "AI 商品图", note: "白底、场景或产品展示图" },
  { value: "AI模特图", label: "AI 模特图", note: "试穿、模特展示或换装图" },
  { value: "真人实拍图", label: "真人实拍图", note: "棚拍、外景或运营实拍素材" },
] as const;

export function AssetIntakeWorkspace({
  items,
  processing,
  errorMessage,
  submissionContext,
  setSubmissionContext,
  onSelect,
  onToggle,
  onClear,
  onContinue,
}: AssetIntakeWorkspaceProps) {
  const selectedCount = items.filter((item) => item.selected).length;

  return (
    <section className="workspace-page intake-page" aria-labelledby="intake-title">
      <header className="page-heading intake-heading">
        <div>
          <p className="page-context">第二步 · 待修素材</p>
          <h1 id="intake-title">加入这一批需要检查的图片</h1>
          <p>保持同一 SKU、同一用途，一次最多 3 张。上传后可直接进入真实模型诊断。</p>
        </div>
        <div className="intake-heading-status" aria-live="polite">
          <span>当前批次</span>
          <strong>{items.length ? `${items.length} / 3 张已加入` : "等待图片"}</strong>
        </div>
      </header>

      <div className="intake-workbench">
        <div className="intake-main-column">
          <label className={`intake-dropzone ${processing ? "is-processing" : ""}`}>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              disabled={processing}
              onChange={(event) => {
                void onSelect(Array.from(event.currentTarget.files ?? []));
                event.currentTarget.value = "";
              }}
            />
            <span className="intake-drop-index">+</span>
            <strong>{processing ? "正在建立任务" : items.length ? "更换或重新选择本批图片" : "选择待检查图片"}</strong>
            <p>JPG、PNG、WebP · 单张不超过 10 MB · 最多 3 张</p>
          </label>

          {errorMessage && <p className="intake-error" role="alert">{errorMessage}</p>}

          <section className="intake-queue" aria-labelledby="intake-queue-title">
            <div className="section-title-row">
              <div>
                <span>图片队列</span>
                <h2 id="intake-queue-title">{items.length ? `${items.length} 张待检查图片` : "尚未加入图片"}</h2>
              </div>
              <div className="intake-queue-actions">
                <strong>已选 {selectedCount}</strong>
                {items.length > 0 && <button type="button" className="text-button" onClick={onClear}>清空</button>}
              </div>
            </div>

            {items.length ? (
              <div className="intake-asset-grid">
                {items.map((item) => (
                  <label key={item.id} className="intake-asset-item">
                    <input type="checkbox" checked={item.selected} onChange={() => onToggle(item.id)} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.src} alt={item.name} />
                    <span className="intake-asset-order">{String(item.id).padStart(2, "0")}</span>
                    <span className="intake-asset-name" title={item.name}>{item.name}</span>
                    <span className={`queue-status ${item.status}`}>{item.status === "ready" ? "等待诊断" : item.status === "running" ? "诊断中" : item.status === "done" ? "已完成" : "失败"}</span>
                    {item.error && <small>{item.error}</small>}
                  </label>
                ))}
              </div>
            ) : (
              <div className="intake-empty-state">
                <strong>图片会在这里形成清晰队列</strong>
                <p>上传后确认选择，再进入真实模型诊断。</p>
              </div>
            )}
          </section>
        </div>

        <aside className="intake-inspector" aria-labelledby="intake-command-title">
          <div className="intake-command-copy">
            <span>任务设置</span>
            <h2 id="intake-command-title">本批图片上下文</h2>
            <p>这些设置随图片一起进入问题诊断。</p>
          </div>

          <div className="intake-context-fields intake-context-choice-fields">
            <fieldset className="intake-choice-field">
              <legend>图片类型</legend>
              <div className="provenance-choice-list">
                {assetRoleOptions.map((option) => (
                  <button key={option.value} type="button" aria-pressed={submissionContext.placement === option.value} onClick={() => setSubmissionContext((current) => ({ ...current, placement: option.value }))}>
                    <strong>{option.label}</strong>
                    <span>{option.note}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="intake-choice-field">
              <legend>发布渠道</legend>
              <div className="channel-choice-grid">
                {channelOptions.map((channel) => (
                  <button key={channel} type="button" aria-pressed={submissionContext.channel === channel} onClick={() => setSubmissionContext((current) => ({ ...current, channel }))}>{channel}</button>
                ))}
              </div>
            </fieldset>
            <fieldset className="intake-choice-field">
              <legend>图片来源</legend>
              <div className="provenance-choice-list">
                {provenanceOptions.map((option) => (
                  <button key={option.value} type="button" aria-pressed={submissionContext.provenanceStatus === option.value} onClick={() => setSubmissionContext((current) => ({ ...current, provenanceStatus: option.value }))}>
                    <strong>{option.label}</strong>
                    <span>{option.note}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="intake-scope-ledger" role="note">
            <div><span>商品依据</span><strong>以上一步商品真值为准</strong></div>
            <div><span>当前类型</span><strong>{submissionContext.placement || "待确认"}</strong></div>
            <div><span>诊断方式</span><strong>真实模型 + 人工终审</strong></div>
          </div>

          <div className="intake-handoff" role="note">
            <div>
              <span>{items.length ? "设置已就绪" : "下一步"}</span>
              <strong>{items.length ? "进入问题诊断并选择分析方式" : "先选择 1–3 张待检查图片"}</strong>
            </div>
            <button className="primary-button" type="button" disabled={!items.length} onClick={onContinue}>进入问题诊断</button>
          </div>
        </aside>
      </div>
    </section>
  );
}
