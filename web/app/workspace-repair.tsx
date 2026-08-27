"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadBlob } from "../lib/visionqa/batch-download";
import {
  executeQwenRepair,
  getRepairProviderCapability,
  RepairProviderApiError,
} from "../lib/visionqa/repair-provider-client";
import {
  createRepairProviderJob,
  QWEN_IMAGE_EDIT_MODEL_SNAPSHOT,
  QWEN_IMAGE_EDIT_PROVIDER_ID,
  QWEN_IMAGE_3_MODEL_SNAPSHOT,
  QWEN_IMAGE_3_PROVIDER_ID,
  updateRepairProviderJob,
  type RepairProviderCapability,
  type RepairProviderJobSnapshot,
  type RepairProviderRoute,
} from "../lib/visionqa/repair-provider-contract";
import { runRepairCollaboration } from "../lib/visionqa/agents/repair-orchestrator";
import {
  validateRepairOutputFiles,
  type RepairOutputGateResult,
} from "../lib/visionqa/repair-output-gate";
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
  sourceSha256: string;
  referenceFiles: File[];
  diagnosisReady: boolean;
  outputFile: File | null;
  onOutputFileChange: (file: File | null) => void;
  checks: string[];
  onChecksChange: (checks: string[]) => void;
  upscaleOutputFile: File | null;
  upscaleReceipt: UpscaleJobReceipt | null;
  onUpscaleReady: (file: File, receipt: UpscaleJobReceipt) => void;
  providerJob: RepairProviderJobSnapshot | null;
  onProviderJobChange: (job: RepairProviderJobSnapshot | null) => void;
  isDemo: boolean;
  onBack: () => void;
  onContinue: () => void;
};

const providers = [
  { id: "qwen-image-3", route: "qwen-image-3", name: "Qwen Image 3.0 Pro", fit: "实验主通道 · 单图局部修正", state: "受控适配已完成" },
  { id: "qwen-image", route: "qwen-image-edit-max", name: "千问 Image Edit Max", fit: "稳定回退 · 同一修正链路", state: "受控适配已完成" },
  { id: "seedream", name: "Seedream", fit: "保留为图像编辑适配器候选", state: "后续适配" },
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
  sourceSha256,
  referenceFiles,
  diagnosisReady,
  outputFile,
  onOutputFileChange,
  checks,
  onChecksChange,
  upscaleOutputFile,
  upscaleReceipt,
  onUpscaleReady,
  providerJob,
  onProviderJobChange,
  isDemo,
  onBack,
  onContinue,
}: RepairWorkspaceProps) {
  const [provider, setProvider] = useState<(typeof providers)[number]["id"]>("qwen-image-3");
  const [copied, setCopied] = useState(false);
  const [providerCapability, setProviderCapability] = useState<
    | { kind: "loading" }
    | { kind: "ready"; value: RepairProviderCapability }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const [repairConsent, setRepairConsent] = useState(false);
  const [selectedReferenceKeys, setSelectedReferenceKeys] = useState<string[]>([]);
  const [referenceSelectionTouched, setReferenceSelectionTouched] = useState(false);
  const [providerRunError, setProviderRunError] = useState<string | null>(null);
  const [blockedOutput, setBlockedOutput] = useState<{
    file: File;
    gate: RepairOutputGateResult;
  } | null>(null);
  const [sourceInspection, setSourceInspection] = useState<{
    sourceKey: string;
    width: number;
    height: number;
  } | null>(null);
  const [repairSourceDimensions, setRepairSourceDimensions] = useState<{
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

  const previewOutputFile = outputFile ?? blockedOutput?.file ?? null;
  const outputUrl = useMemo(
    () => previewOutputFile ? URL.createObjectURL(previewOutputFile) : "",
    [previewOutputFile],
  );
  useEffect(() => () => { if (outputUrl) URL.revokeObjectURL(outputUrl); }, [outputUrl]);

  const selectedProvider = providers.find((item) => item.id === provider)!;
  const selectedQwenRoute = "route" in selectedProvider
    ? selectedProvider.route as RepairProviderRoute
    : null;
  const referenceOptions = useMemo(
    () =>
      referenceFiles.map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}`,
        file,
      })),
    [referenceFiles],
  );
  const maxProviderReferences =
    providerCapability.kind === "ready"
      ? providerCapability.value.maxReferenceImages
      : 2;
  const availableReferenceKeys = new Set(referenceOptions.map((item) => item.key));
  const retainedReferenceKeys = selectedReferenceKeys
    .filter((key) => availableReferenceKeys.has(key))
    .slice(0, maxProviderReferences);
  const effectiveReferenceKeys =
    referenceSelectionTouched || retainedReferenceKeys.length > 0
      ? retainedReferenceKeys
      : referenceOptions.slice(0, maxProviderReferences).map((item) => item.key);
  const selectedReferenceFiles = referenceOptions
    .filter((item) => effectiveReferenceKeys.includes(item.key))
    .slice(0, maxProviderReferences)
    .map((item) => item.file);
  const repairPlanReady =
    diagnosisReady &&
    Boolean(asset.repairPrompt.trim()) &&
    Boolean(asset.lockedAttributes.trim());
  const workflowEvidenceReady = repairPlanReady && referenceFiles.length > 0;
  const reviewed =
    workflowEvidenceReady &&
    Boolean(outputFile) &&
    checks.length === reviewChecks.length;
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
  const collaboration = runRepairCollaboration({
    caseId: `repair-case-${asset.id}-${sourceSha256.slice(0, 12) || "demo"}`,
    sourceAssetId: asset.id,
    sourceName: asset.productLabel,
    sourceSha256,
    referenceAssetCount: referenceFiles.length,
    diagnosisReady,
    issueCount: asset.issues.length,
    repairPromptReady: Boolean(asset.repairPrompt.trim()),
    lockedAttributeCount: asset.lockedAttributes.split("、").filter(Boolean).length,
    providerJob,
    repairOutputAvailable: Boolean(outputFile),
    humanChecksCompleted: checks.length,
    upscaleOutputAvailable: Boolean(readyUpscaleFile),
  });

  useEffect(() => {
    const controller = new AbortController();
    if (!selectedQwenRoute) {
      return () => controller.abort();
    }
    getRepairProviderCapability(selectedQwenRoute, controller.signal)
      .then((value) => setProviderCapability({ kind: "ready", value }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setProviderCapability({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "无法读取千问改图能力状态。",
        });
      });
    return () => controller.abort();
  }, [selectedQwenRoute]);

  useEffect(() => {
    let active = true;
    if (!sourceFile) return () => { active = false; };
    const sourceKey = `${sourceFile.name}-${sourceFile.size}-${sourceFile.lastModified}`;
    inspectImageFile(sourceFile)
      .then((dimensions) => { if (active) setRepairSourceDimensions({ sourceKey, ...dimensions }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [sourceFile]);

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
    if (!repairPlanReady) return;
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
      selected_product_truth_files: selectedReferenceFiles.map((file) => file.name),
      human_final_review_required: true,
      provider_job: providerJob,
      collaboration,
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

  const buildProviderJob = () => {
    if (
      !sourceFile ||
      !sourceSha256 ||
      !repairPlanReady ||
      (selectedQwenRoute && selectedReferenceFiles.length === 0)
    ) return;
    const capability =
      providerCapability.kind === "ready" ? providerCapability.value : null;
    const qwenSelected = Boolean(selectedQwenRoute);
    const providerId = selectedQwenRoute === "qwen-image-3"
      ? QWEN_IMAGE_3_PROVIDER_ID
      : QWEN_IMAGE_EDIT_PROVIDER_ID;
    const modelSnapshot = selectedQwenRoute === "qwen-image-3"
      ? QWEN_IMAGE_3_MODEL_SNAPSHOT
      : QWEN_IMAGE_EDIT_MODEL_SNAPSHOT;
    onProviderJobChange(
      createRepairProviderJob({
        sourceAssetId: asset.id,
        sourceSha256,
        providerId: qwenSelected
          ? providerId
          : provider,
        modelSnapshot: qwenSelected
          ? modelSnapshot
          : null,
        status: qwenSelected
          ? capability?.liveReady
            ? "READY"
            : "BLOCKED_AUTHORIZATION"
          : "ADAPTER_NOT_CONFIGURED",
        authorizationBlockers: qwenSelected
          ? capability?.blockers ?? ["CAPABILITY_UNAVAILABLE"]
          : ["PROVIDER_ADAPTER_NOT_IMPLEMENTED"],
      }),
    );
    setProviderRunError(null);
    setRepairConsent(false);
  };

  const inspectRepairOutput = async (file: File) => {
    if (!sourceFile) throw new Error("缺少原始 AI 模特母版，无法执行漂移复验。");
    return validateRepairOutputFiles(sourceFile, file);
  };

  const runQwenProvider = async () => {
    const sourceKey = sourceFile
      ? `${sourceFile.name}-${sourceFile.size}-${sourceFile.lastModified}`
      : "";
    if (
      !sourceFile ||
      !repairPlanReady ||
      !providerJob ||
      !selectedQwenRoute ||
      providerCapability.kind !== "ready" ||
      providerJob.providerId !== providerCapability.value.providerId ||
      !providerCapability.value.liveReady ||
      !repairConsent ||
      !repairSourceDimensions ||
      repairSourceDimensions.sourceKey !== sourceKey
    ) {
      return;
    }
    onProviderJobChange(
      updateRepairProviderJob(providerJob, {
        status: "RUNNING",
        authorizationBlockers: [],
        failureCode: null,
      }),
    );
    setProviderRunError(null);
    try {
      const result = await executeQwenRepair({
        route: selectedQwenRoute,
        source: sourceFile,
        references: selectedReferenceFiles,
        sourceSha256,
        prompt: asset.repairPrompt,
        sourceWidth: repairSourceDimensions.width,
        sourceHeight: repairSourceDimensions.height,
      });
      const outputGate = await inspectRepairOutput(result.file);
      if (outputGate.decision === "BLOCK_MAJOR_DRIFT") {
        setBlockedOutput({ file: result.file, gate: outputGate });
        onOutputFileChange(null);
        onChecksChange([]);
        onProviderJobChange(
          updateRepairProviderJob(providerJob, {
            status: "FAILED",
            authorizationBlockers: [],
            providerRequestId: result.providerRequestId,
            outputSource: "QWEN_BAILIAN",
            externalNetworkUsed: true,
            modelInferenceUsed: true,
            imageCount: result.imageCount,
            outputWidth: result.outputWidth,
            outputHeight: result.outputHeight,
            failureCode: "REPAIR_OUTPUT_MAJOR_DRIFT",
          }),
        );
        setProviderRunError(
          `${outputGate.summary} 该图片只保留用于排查，不能进入人工交付确认。`,
        );
        setRepairConsent(false);
        return;
      }
      setBlockedOutput(null);
      onOutputFileChange(result.file);
      onChecksChange([]);
      onProviderJobChange(
        updateRepairProviderJob(providerJob, {
          status: "SUCCEEDED",
          authorizationBlockers: [],
          providerRequestId: result.providerRequestId,
          outputSource: "QWEN_BAILIAN",
          externalNetworkUsed: true,
          modelInferenceUsed: true,
          imageCount: result.imageCount,
          outputWidth: result.outputWidth,
          outputHeight: result.outputHeight,
          failureCode: null,
        }),
      );
      setRepairConsent(false);
    } catch (error) {
      const code =
        error instanceof RepairProviderApiError
          ? error.code
          : "REPAIR_PROVIDER_FAILED";
      const message =
        error instanceof Error ? error.message : "千问改图任务执行失败。";
      const externalProviderReached = ![
        "REPAIR_PROVIDER_NOT_AUTHORIZED",
        "DATA_TRANSFER_CONSENT_REQUIRED",
        "REPAIR_INPUT_TOO_LARGE",
        "INVALID_REPAIR_INPUT",
        "SOURCE_HASH_MISMATCH",
      ].includes(code);
      onProviderJobChange(
        updateRepairProviderJob(providerJob, {
          status: "FAILED",
          externalNetworkUsed: externalProviderReached,
          modelInferenceUsed: false,
          failureCode: code,
        }),
      );
      setProviderRunError(message);
    }
  };

  const acceptExternalOutput = async (file: File | null) => {
    onChecksChange([]);
    if (!file) {
      setBlockedOutput(null);
      onOutputFileChange(null);
      return;
    }
    try {
      const outputGate = await inspectRepairOutput(file);
      if (outputGate.decision === "BLOCK_MAJOR_DRIFT") {
        setBlockedOutput({ file, gate: outputGate });
        onOutputFileChange(null);
        setProviderRunError(
          `${outputGate.summary} 该图片已被拦截，不能进入人工交付确认。`,
        );
        return;
      }
      setBlockedOutput(null);
      setProviderRunError(null);
      onOutputFileChange(file);
      if (providerJob) {
        onProviderJobChange(
          updateRepairProviderJob(providerJob, {
            status: "OUTPUT_SUPPLIED",
            outputSource: "USER_SUPPLIED",
            failureCode: null,
          }),
        );
      }
    } catch {
      setProviderRunError("无法完成改图候选的本机构图漂移检查，该图片未进入交付候选。");
      onOutputFileChange(null);
    }
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

  const qwenCapabilityLabel =
    providerCapability.kind === "loading"
      ? "正在检查授权状态"
      : providerCapability.kind === "error"
        ? "能力状态读取失败"
        : providerCapability.value.liveReady
          ? "接口就绪 · 每次发送仍需确认"
          : `等待授权 · ${providerCapability.value.blockers.length} 项 Gate`;
  const qwenCanRun =
    Boolean(selectedQwenRoute) &&
    providerCapability.kind === "ready" &&
    providerCapability.value.liveReady &&
    selectedReferenceFiles.length > 0 &&
    selectedReferenceFiles.length <= providerCapability.value.maxReferenceImages &&
    providerJob?.status === "READY";

  const toggleReference = (key: string) => {
    setRepairConsent(false);
    setReferenceSelectionTouched(true);
    setSelectedReferenceKeys(() => {
      if (effectiveReferenceKeys.includes(key)) {
        return effectiveReferenceKeys.filter((item) => item !== key);
      }
      if (effectiveReferenceKeys.length >= maxProviderReferences) {
        return effectiveReferenceKeys;
      }
      return [...effectiveReferenceKeys, key];
    });
  };
  const collaborationStatusLabel: Record<typeof collaboration.status, string> = {
    NEEDS_PRODUCT_TRUTH: "等待商品真值",
    NEEDS_DIAGNOSIS: "等待问题诊断",
    READY_FOR_PROVIDER: "可建立改图任务",
    PROVIDER_BLOCKED: "Provider 被阻断",
    REPAIR_IN_PROGRESS: "改图处理中",
    REPAIR_OUTPUT_READY: "等待人工复验",
    READY_FOR_DELIVERY: "可以生成交付文件",
    DELIVERED: "当前案例已交付",
  };

  return (
    <section className="workspace-page repair-page" aria-labelledby="repair-title">
      <header className="page-heading">
        <div>
          <p className="page-context">第四步 · 修正与交付</p>
          <h1 id="repair-title">修正问题，再确认其他地方没有被改坏。</h1>
          <p>生成候选图，直接比较修改前后。</p>
        </div>
        <button className="quiet-button" type="button" onClick={onBack}>返回问题诊断</button>
      </header>

      <details className="repair-agent-ledger">
        <summary>
          <div>
            <span>内部处理记录</span>
            <h2>查看本次任务的状态与下一步</h2>
          </div>
          <strong>{collaborationStatusLabel[collaboration.status]} · {collaboration.status}</strong>
        </summary>
        <ol>
          {collaboration.agents.map((item, index) => (
            <li key={item.id} data-status={item.status}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{item.name}</strong><small>{item.note}</small></div>
              <em>{item.status === "COMPLETED" ? "完成" : item.status === "WAITING" ? "等待" : "阻断"}</em>
            </li>
          ))}
        </ol>
        <footer>
          <span>下一动作</span>
          <strong>{collaboration.nextAction}</strong>
          <small>当前是可追溯状态机，不冒充六个独立模型已经在线推理。</small>
        </footer>
      </details>

      <section className="repair-command" aria-labelledby="repair-command-title">
        <div className="repair-command-heading">
          <div><span>本次修正</span><h2 id="repair-command-title">确认要改什么，以及哪些地方不能变。</h2></div>
          <strong>{isDemo ? "示例素材" : `当前图片 ${String(asset.id).padStart(3, "0")}`}</strong>
        </div>
        <div className="provider-choice-grid" role="radiogroup" aria-label="改图模型方案">
          {providers.map((item) => (
            <button key={item.id} type="button" role="radio" aria-checked={provider === item.id} onClick={() => { setProvider(item.id); setProviderCapability("route" in item ? { kind: "loading" } : { kind: "error", message: "该模型适配器尚未接入。" }); onProviderJobChange(null); setRepairConsent(false); setProviderRunError(null); }}>
              <span>{item.name}</span><p>{item.fit}</p><small>{"route" in item ? qwenCapabilityLabel : item.state}</small>
            </button>
          ))}
        </div>
        <div className="repair-brief">
          <div><span>需要修复</span><strong>{asset.issues.length ? asset.issues.map((item) => item.title).join(" / ") : diagnosisReady ? "当前诊断没有可执行问题" : "尚未完成问题诊断，不使用示例问题"}</strong></div>
          <div><span>必须锁定</span><strong>{asset.lockedAttributes || (diagnosisReady ? "等待商品真值确认" : "等待真实诊断与商品真值")}</strong></div>
          <div className="repair-prompt-row"><span>改图 Prompt</span><p>{asset.repairPrompt || "当前图片尚未形成真实修正 Prompt。请返回问题诊断，不会用示例内容补齐。"}</p><button className="text-button" type="button" disabled={!repairPlanReady} onClick={() => void copyPrompt()}>{copied ? "已复制" : "复制"}</button></div>
        </div>
        <div className="repair-reference-selector">
          <div>
            <span>本次改图参考</span>
            <strong>从完整 SKU 中选择最多 {maxProviderReferences} 张最相关真值图</strong>
            <p>优先选择同角度白底图，再补一张关键细节。</p>
          </div>
          <div className="repair-reference-list" role="group" aria-label="本次发送的商品真值图">
            {referenceOptions.length ? referenceOptions.map(({ key, file }) => {
              const selected = effectiveReferenceKeys.includes(key);
              const disabled = !selected && effectiveReferenceKeys.length >= maxProviderReferences;
              return (
                <label key={key} data-selected={selected}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={disabled}
                    onChange={() => toggleReference(key)}
                  />
                  <span>{file.name}</span>
                  <small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>
                </label>
              );
            }) : <p>请先在商品真值阶段上传完整 SKU 参考图。</p>}
          </div>
          <small>已选择 {selectedReferenceFiles.length}/{maxProviderReferences} 张；选择变化后需要重新确认发送。</small>
        </div>
        <div className="repair-task-actions">
          <button className="primary-button" type="button" disabled={!sourceFile || !sourceSha256 || !repairPlanReady || (Boolean(selectedQwenRoute) && selectedReferenceFiles.length === 0) || providerJob?.status === "RUNNING"} onClick={buildProviderJob}>{providerJob ? "重建改图任务" : "建立改图任务"}</button>
          <button className="quiet-button" type="button" disabled={!providerJob} onClick={exportJob}>导出任务 JSON</button>
          <span>{providerJob ? `${selectedProvider.name} · ${providerJob.status}` : "不会在缺少诊断或授权时伪装生成成功。"}</span>
        </div>
        {qwenCanRun && (
          <div className="repair-provider-consent">
            <label><input type="checkbox" checked={repairConsent} onChange={(event) => setRepairConsent(event.currentTarget.checked)} /><span>确认本次将当前 AI 模特草图与 {selectedReferenceFiles.length} 张已选商品真值图发送至阿里云百炼；完整 SKU 中其他图片不会发送，服务返回图会立即保存到本机项目。</span></label>
            <button className="primary-button" type="button" disabled={!repairConsent} onClick={() => void runQwenProvider()}>调用千问生成候选</button>
          </div>
        )}
        {providerJob?.status === "BLOCKED_AUTHORIZATION" && (
          <p className="repair-provider-note" role="status">千问适配已经完成，但 API Key、业务空间、付费调用或数据范围仍有未授权项；本次网络请求为零。</p>
        )}
        {providerJob?.status === "RUNNING" && <p className="repair-provider-note" role="status">千问正在生成候选图，请勿重复提交付费任务。</p>}
        {providerRunError && <p className="repair-provider-error" role="alert">{providerRunError}</p>}
      </section>

      <section className="repair-comparison" aria-labelledby="repair-comparison-title">
        <div className="section-title-row">
          <div><span>修改前后对比</span><h2 id="repair-comparison-title">把外部改图结果带回同一张审片台。</h2></div>
          <strong>{reviewed ? "人工复审完成" : blockedOutput ? "已拦截 · 主体或构图漂移" : outputFile ? "等待逐项确认" : "等待改图结果"}</strong>
        </div>
        <div className="comparison-stage">
          <figure>
            <figcaption><span>BEFORE</span><strong>原始 AI 模特草图</strong></figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.src} alt={`${asset.productLabel} 修改前`} />
          </figure>
          <figure className={!outputUrl ? "comparison-empty" : undefined}>
            <figcaption><span>AFTER</span><strong>{blockedOutput ? "未通过漂移 Gate" : "改图候选"}</strong></figcaption>
            {outputUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={outputUrl} alt={`${asset.productLabel} 修改后候选`} />
                {blockedOutput && (
                  <p className="repair-output-blocked" role="alert">
                    主体或整体构图变化过大，疑似重新生成而非局部修正。该结果不可进入交付复审。
                  </p>
                )}
              </>
            ) : <div><strong>尚无改图结果</strong><p>生成候选后将在这里对比。</p></div>}
          </figure>
        </div>
        <label className="repair-output-upload">
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void acceptExternalOutput(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} />
          <strong>{previewOutputFile ? "更换改图结果" : "上传改图结果"}</strong>
          <span>{blockedOutput ? `${blockedOutput.file.name} · 已拦截` : outputFile?.name ?? "当前为半自动工作流：外部生成，VisionQA 统一复审"}</span>
        </label>
      </section>

      <section className="repair-review-sheet" aria-labelledby="repair-review-title">
        <div><span>人工复验</span><h2 id="repair-review-title">确认修好，也确认没有改坏。</h2></div>
        <div className="repair-check-list">
          {reviewChecks.map((check) => <label key={check}><input type="checkbox" checked={checks.includes(check)} disabled={!outputFile || !workflowEvidenceReady} onChange={() => onChecksChange(checks.includes(check) ? checks.filter((item) => item !== check) : [...checks, check])} /><span>{check}</span></label>)}
        </div>
        <div className="repair-handoff">
          <span>{reviewed ? "已形成一张人工确认的改图候选，可以进入清晰度交付。" : !workflowEvidenceReady ? "商品真值或真实诊断 Gate 未满足，历史勾选不能形成交付结论。" : "未完成四项复验前，不生成最终交付文件。"}</span>
          <button className="quiet-button" type="button" onClick={onContinue}>返回项目总览</button>
        </div>
      </section>

      <section className="upscale-delivery" aria-labelledby="upscale-title">
        <header>
          <div>
            <span>交付清晰度</span>
            <h2 id="upscale-title">修正完成后，再生成 4K 文件。</h2>
            <p>人工复验后再处理清晰度。</p>
          </div>
          <strong>{reviewed ? "可以处理" : workflowEvidenceReady ? "等待人工复验" : "等待证据 Gate"}</strong>
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

        {readyUpscaleFile && readyUpscaleReceipt && reviewed && (
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
        {readyUpscaleFile && readyUpscaleReceipt && !reviewed && (
          <div className="upscale-result is-blocked" role="status">
            <div>
              <span>历史输出已保留</span>
              <strong>{readyUpscaleFile.name}</strong>
              <small>当前商品真值、诊断或人工复验 Gate 未满足，暂不作为可交付终稿。</small>
            </div>
          </div>
        )}
        {activeUpscaleState.kind === "error" && <p className="upscale-error" role="alert">{activeUpscaleState.message}</p>}
      </section>
    </section>
  );
}
