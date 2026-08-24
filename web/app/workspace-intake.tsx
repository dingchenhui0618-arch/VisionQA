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
  { value: "confirmed_ai", label: "确认是 AI 生成图", note: "进入 AI 痕迹与商品漂移检查" },
  { value: "confirmed_real", label: "确认是真人或实拍图", note: "不默认存在 AI 生成过程" },
  { value: "unknown", label: "暂不确定", note: "正式评分前需要人工补充来源" },
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
          <p className="page-context">第二步 · AI 模特草图</p>
          <h1 id="intake-title">上传需要修正的模特母图。</h1>
          <p>当前版本只处理同一 SKU 的 AI 模特图，建议先放入 1 张，最多 3 张同用途候选；详情页和促销排版不与母图混在同一任务。</p>
        </div>
        <button className="primary-button" type="button" disabled={!items.length} onClick={onContinue}>
          下一步：定位问题
        </button>
      </header>

      <section className="intake-command-sheet" aria-labelledby="intake-command-title">
        <div className="intake-command-copy">
          <span>固定任务范围</span>
          <h2 id="intake-command-title">AI 模特图修正</h2>
          <div className="intake-scope-ledger" role="note">
            <div><span>素材角色</span><strong>AI 模特母图</strong></div>
            <div><span>商品真值</span><strong>以上一步白底图为准</strong></div>
            <div><span>促销信息</span><strong>不要求，缺少时不扣分</strong></div>
          </div>
        </div>
        <div className="intake-context-fields intake-context-choice-fields">
          <fieldset className="intake-choice-field">
            <legend>主要发布渠道</legend>
            <div className="channel-choice-grid">
              {channelOptions.map((channel) => (
                <button key={channel} type="button" aria-pressed={submissionContext.channel === channel} onClick={() => setSubmissionContext((current) => ({ ...current, channel }))}>{channel}</button>
              ))}
            </div>
          </fieldset>
          <fieldset className="intake-choice-field">
            <legend>图片来源确认</legend>
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
      </section>

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
        <strong>{processing ? "正在建立素材批次" : items.length ? "继续添加或更换本批素材" : "选择需要评审的图片"}</strong>
        <p>支持 JPG、PNG、WebP，单张不超过 10 MB。文件保存在当前浏览器项目中，不会因自动保存上传第三方。</p>
      </label>

      {errorMessage && <p className="intake-error" role="alert">{errorMessage}</p>}

      <section className="intake-queue" aria-labelledby="intake-queue-title">
        <div className="section-title-row">
          <div>
            <span>当前修正任务</span>
            <h2 id="intake-queue-title">{items.length ? `${items.length} 张同用途模特图` : "尚未加入模特草图"}</h2>
          </div>
          <div className="intake-queue-actions">
            <strong>已选 {selectedCount}</strong>
            {items.length > 0 && <button type="button" className="text-button" onClick={onClear}>清空批次</button>}
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
                <span className={`queue-status ${item.status}`}>{item.status === "ready" ? "等待评审" : item.status === "running" ? "评审中" : item.status === "done" ? "已完成" : "失败"}</span>
                {item.error && <small>{item.error}</small>}
              </label>
            ))}
          </div>
        ) : (
          <div className="intake-empty-state">
            <strong>从真实素材开始</strong>
            <p>上传完成前，这里不会显示示例图片、模拟分数或自动通过结论。</p>
          </div>
        )}
      </section>

      <section className="intake-handoff" role="note">
        <div>
          <span>进入评审后</span>
          <strong>先对照商品真值定位漂移，再判断局部修复还是重新生成。</strong>
        </div>
        <button className="primary-button" type="button" disabled={!items.length} onClick={onContinue}>进入问题诊断</button>
      </section>
    </section>
  );
}
