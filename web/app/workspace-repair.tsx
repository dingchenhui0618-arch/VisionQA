"use client";

import { useEffect, useMemo, useState } from "react";

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

export function RepairWorkspace({ asset, isDemo, onBack, onContinue }: RepairWorkspaceProps) {
  const [provider, setProvider] = useState<(typeof providers)[number]["id"]>("seedream");
  const [taskCreated, setTaskCreated] = useState(false);
  const [outputFile, setOutputFile] = useState<File | null>(null);
  const [checks, setChecks] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const outputUrl = useMemo(() => outputFile ? URL.createObjectURL(outputFile) : "", [outputFile]);
  useEffect(() => () => { if (outputUrl) URL.revokeObjectURL(outputUrl); }, [outputUrl]);

  const selectedProvider = providers.find((item) => item.id === provider)!;
  const reviewed = Boolean(outputFile) && checks.length === reviewChecks.length;

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

  return (
    <section className="workspace-page repair-page" aria-labelledby="repair-title">
      <header className="page-heading">
        <div>
          <p className="page-context">第四步 · 改图复审</p>
          <h1 id="repair-title">只改问题区域，商品身份保持不变。</h1>
          <p>先生成可审计的改图任务，再由外部工具或未来 API 产生候选图。修改结果必须重新检查商品一致性与非目标区域漂移。</p>
        </div>
        <button className="quiet-button" type="button" onClick={onBack}>返回质量评审</button>
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
            <figcaption><span>BEFORE</span><strong>原始待评审图</strong></figcaption>
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
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setOutputFile(event.currentTarget.files?.[0] ?? null); setChecks([]); event.currentTarget.value = ""; }} />
          <strong>{outputFile ? "更换改图结果" : "上传改图结果"}</strong>
          <span>{outputFile?.name ?? "当前为半自动工作流：外部生成，VisionQA 统一复审"}</span>
        </label>
      </section>

      <section className="repair-review-sheet" aria-labelledby="repair-review-title">
        <div><span>人工复审 Gate</span><h2 id="repair-review-title">不是变好看就算完成。</h2><p>四项全部确认后，才可以把改图候选作为营销内容依据。</p></div>
        <div className="repair-check-list">
          {reviewChecks.map((check) => <label key={check}><input type="checkbox" checked={checks.includes(check)} disabled={!outputFile} onChange={() => setChecks((current) => current.includes(check) ? current.filter((item) => item !== check) : [...current, check])} /><span>{check}</span></label>)}
        </div>
        <div className="repair-handoff">
          <span>{reviewed ? "已形成一张人工确认的改图候选。" : "未完成复审时，营销交付只能作为结构草案。"}</span>
          <button className="primary-button" type="button" onClick={onContinue}>{reviewed ? "进入营销交付" : "查看营销交付草案"}</button>
        </div>
      </section>
    </section>
  );
}
