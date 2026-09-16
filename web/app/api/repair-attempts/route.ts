import { after } from "next/server";
import { requireBetaSessionFromRequest } from "../../../lib/beta/auth";
import { createSignedDownloadUrl } from "../../../lib/beta/asset-urls";
import { getBetaBackend } from "../../../lib/beta/backend";
import { authorizeModelDispatch } from "../../../lib/beta/budget";
import { CustomerVisibleError, customerErrorResponse, type BetaSessionView, type RepairAttempt } from "../../../lib/beta/contracts";
import { runServerRepairGate } from "../../../lib/beta/repair-gate";
import type { RepairStartInput } from "../../../lib/beta/service";
import {
  createQwenImage3Provider,
  getQwenImage3Readiness,
  QWEN_IMAGE_3_MODEL,
  QWEN_IMAGE_3_PROVIDER_ID,
  QwenImage3ProviderError,
  type QwenImage3EditResult,
} from "../../../lib/visionqa/providers/qwen-image-3";
import { planCustomerRepair } from "../../../lib/visionqa/agents/repair-planning-service";
import { createTrackedRealProvider, getModelCallLedger } from "../../../lib/agent/runtime-registry";
import { runBoundedAgentLoop } from "../../../lib/agent/bounded-agent-loop";
import type { ProviderResult } from "../../../lib/agent/provider-runtime";

type Region = RepairStartInput["issueRegion"];

export async function POST(request: Request) {
  const service = getBetaBackend();
  try {
    const session = await requireBetaSessionFromRequest(request);
    const input = (await request.json()) as Record<string, unknown>;
    const region = parseRegion(input.issue_region) ?? { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const lockedRegions = parseRegions(input.locked_regions);
    const attempt = await service.beginRepair(session, {
      projectId: String(input.project_id ?? ""),
      screeningItemId: String(input.screening_item_id ?? ""),
      sourceAssetId: typeof input.source_asset_id === "string" ? input.source_asset_id : undefined,
      issue: String(input.issue ?? ""),
      issueRegion: region,
      lockedRegions: lockedRegions.length ? lockedRegions : perimeterLocks(region),
      idempotencyKey: String(input.idempotency_key ?? ""),
    });
    if (attempt.status === "CAPTURED") {
      return Response.json(await completedPayload(session, attempt));
    }
    if (attempt.status === "RUNNING") return Response.json(await runningPayload(session, attempt), { status: 202 });
    if (attempt.status === "RELEASED") return Response.json({ state: "FAILED", attempt, credits: await service.getCredits(session), error: { message: attempt.failureReason ?? "本轮未完成，额度已退回。", next_action: "请开始新一轮。" } });
    const running = await service.markRepairRunning(session, attempt.id);
    after(async () => {
      await executeRepairAttempt(session, running.id);
    });
    return Response.json(await runningPayload(session, running), {
      status: 202,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CustomerVisibleError) return customerErrorResponse(error);
    return customerErrorResponse(
      new CustomerVisibleError(
        "MODEL_FAILED",
        "修图任务没有成功创建，且没有扣除内测额度。",
        503,
        "图片、问题描述和框选区域已保留，请再次提交。",
      ),
    );
  }
}

export async function GET(request: Request) {
  try {
    const session = await requireBetaSessionFromRequest(request);
    const attemptId = new URL(request.url).searchParams.get("attempt_id") ?? "";
    const service = getBetaBackend();
    const attempt = await service.getRepairAttempt(session, attemptId);
    if (attempt.status === "CAPTURED") return Response.json(await completedPayload(session, attempt));
    if (attempt.status === "RELEASED") {
      return Response.json({
        state: "FAILED",
        attempt,
        credits: await service.getCredits(session),
        error: {
          message: attempt.failureReason ?? "本次修图没有完成，且没有扣除内测额度。",
          next_action: "图片、问题描述和框选区域已保留，你可以再次提交。",
        },
      }, { headers: { "cache-control": "no-store" } });
    }
    return Response.json(await runningPayload(session, attempt), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CustomerVisibleError) return customerErrorResponse(error);
    return customerErrorResponse(new CustomerVisibleError(
      "MODEL_FAILED",
      "暂时无法读取修图进度。",
      503,
      "请刷新页面，任务记录和额度状态不会丢失。",
    ));
  }
}

async function executeRepairAttempt(session: BetaSessionView, attemptId: string) {
  const service = getBetaBackend();
  try {
    const attempt = await service.getRepairAttempt(session, attemptId);
    const source = await service.readAsset(session, attempt.sourceAssetId);
    const batch = await service.getRepairReferenceBatch(session, attempt.id);
    if (!batch) throw new Error("Repair batch is unavailable");
    const references = await Promise.all(batch.truthAssetIds.slice(0, 2).map((id) => service.readAsset(session, id)));

    let providerResult: QwenImage3EditResult | null = null;
    let output: { bytes: Uint8Array; mimeType: "image/png" | "image/jpeg" | "image/webp"; width: number | null; height: number | null };
    {
      const readiness = getQwenImage3Readiness(process.env);
      if (!readiness.liveReady) {
        throw new CustomerVisibleError(
          "MODEL_UNAVAILABLE",
          "当前修图服务暂时不可用，本次没有扣除内测额度。",
          503,
          "图片、问题描述和框选区域都已保留，请稍后再次提交。",
        );
      }
      const episode = await service.getRepairEvolution(session, attempt.id);
      if (!episode) throw new Error("Repair evolution episode is unavailable");
      const planningStarted = Date.now();
      const planning = await planCustomerRepair({
        episode,
        routing: {
          localizedRegionAvailable: true,
          referenceImageCount: references.length,
          priority: "QUALITY",
          approvedRouteIds: ["qwen-image-3-pro-edit"],
        },
        env: process.env,
        authorizeExternalDispatch: () => authorizeModelDispatch(1),
      });
      if (planning.mode === "DEEPSEEK_V4_FLASH" || planning.plannerFailureCode) {
        getModelCallLedger().record({
          request: `repair-plan:${attempt.id}`,
          project: attempt.projectId,
          conversation: null,
          operation: "TEXT_PLAN",
          provider: "deepseek",
          model: "deepseek-v4-flash",
          status: planning.mode === "DEEPSEEK_V4_FLASH" ? "SUCCEEDED" : "FAILED",
          cost: null,
          token: null,
          image: null,
          latency: Date.now() - planningStarted,
          retry: 0,
          idempotency: `repair-plan:${attempt.id}`,
          ...(planning.plannerFailureCode ? { errorCode: planning.plannerFailureCode } : {}),
        });
      }
      const plannedEpisode = await service.applyRepairPlannerDecision(
        session,
        attempt.id,
        planning.decision,
        planning.allowedRouteIds,
      );
      if (plannedEpisode.status !== "READY_TO_EXECUTE" || plannedEpisode.selectedRoute !== "qwen-image-3-pro-edit") {
        throw new CustomerVisibleError(
          "MODEL_UNAVAILABLE",
          "当前没有适合这张图片的自动修正路线，本次没有扣除内测额度。",
          422,
          "问题描述和框选区域已保留，你可以调整后重试或转人工处理。",
        );
      }
      const budget = authorizeModelDispatch(50);
      try {
        const provider = createQwenImage3Provider(process.env);
        const runtime = createTrackedRealProvider({
          tenantId: session.tenantId,
          provider: QWEN_IMAGE_3_PROVIDER_ID,
          model: QWEN_IMAGE_3_MODEL,
          executor: () => provider.edit({
            source: { bytes: source.bytes, mimeType: source.asset.mimeType },
            references: references.map((entry) => ({ bytes: entry.bytes, mimeType: entry.asset.mimeType })),
            prompt: buildCustomerRepairPrompt(attempt.issue, attempt.issueRegion),
            negativePrompt: "禁止改变人物身份、姿势、脸、手脚、背景、镜头、构图和画幅；禁止新增文字、水印、促销信息或未提供的商品细节；禁止修改框选区域以外的商品结构。",
            sourceWidth: source.asset.width,
            sourceHeight: source.asset.height,
            signal: AbortSignal.timeout(180_000),
          }),
        });
        const request = {
          request: `repair-image:${attempt.id}`,
          project: attempt.projectId,
          conversation: null,
          operation: "IMAGE" as const,
          idempotency: `repair-image:${attempt.id}`,
          confirmed: true,
          image: {
            inputCount: 1 + references.length,
            outputCount: 1,
            inputBytes: source.bytes.byteLength + references.reduce((total, entry) => total + entry.bytes.byteLength, 0),
            mimeTypes: [source.asset.mimeType, ...references.map((entry) => entry.asset.mimeType)],
            width: source.asset.width,
            height: source.asset.height,
          },
        };
        let dispatched = false;
        const loop = await runBoundedAgentLoop({
          runtime,
          maxTextSteps: 0,
          maxImageCalls: 1,
          maxAttempts: 2,
          next: () => {
            if (dispatched) return { kind: "done" as const };
            dispatched = true;
            return { kind: "image" as const, request, confirmed: true };
          },
        });
        const result = loop.results[0] as ProviderResult<QwenImage3EditResult> | undefined;
        if (!result) throw new QwenImage3ProviderError("NETWORK", loop.error ?? "Repair provider was not dispatched");
        if (!result.ok) {
          const code = (["CONFIGURATION", "INVALID_INPUT", "AUTHENTICATION", "RATE_LIMITED", "QUOTA", "NETWORK", "INVALID_OUTPUT", "OUTPUT_FETCH"] as const)
            .find((candidate) => candidate === result.error.code) ?? "NETWORK";
          throw new QwenImage3ProviderError(code, result.error.message);
        }
        providerResult = result.output;
      } finally {
        budget.record();
      }
      output = {
        bytes: providerResult.outputBytes,
        mimeType: providerResult.outputMimeType,
        width: providerResult.outputWidth,
        height: providerResult.outputHeight,
      };
    }

    const gate = runServerRepairGate({
      source: {
        bytes: source.bytes,
        mimeType: source.asset.mimeType,
        width: source.asset.width,
        height: source.asset.height,
      },
      output: {
        bytes: output.bytes,
        mimeType: output.mimeType,
        reportedWidth: output.width,
        reportedHeight: output.height,
      },
      issueRegion: attempt.issueRegion,
      lockedRegions: attempt.lockedRegions,
    });
    if (!gate.passed || !gate.outputDimensions) {
      await service.releaseRepair(session, attempt.id, "修正版未通过基础文件与画幅检查，额度已自动释放。", true);
      throw new CustomerVisibleError(
        "GATE_BLOCKED",
        "修正版没有通过基础检查，本次没有扣除内测额度。",
        422,
        "请调整问题描述或框选区域后再试；如果属于整体结构变化，建议重新生成候选图。",
      );
    }
    const outputAsset = await service.createOutputAsset(session, {
      projectId: attempt.projectId,
      sourceFileName: source.asset.fileName,
      mimeType: output.mimeType,
      bytes: output.bytes,
      width: gate.outputDimensions.width,
      height: gate.outputDimensions.height,
    });
    const captured = await service.captureRepair(session, attempt.id, outputAsset.id);
    return captured;
  } catch (error) {
    let reason = "修图任务未形成可用结果，额度已自动释放。";
    if (error instanceof CustomerVisibleError) reason = `${error.message} ${error.nextAction ?? ""}`.trim();
    if (error instanceof QwenImage3ProviderError) {
      const customerError = customerErrorForProviderFailure(error.code);
      reason = `${customerError.message} ${customerError.nextAction ?? ""}`.trim();
      console.warn("[repair-attempt] provider request did not complete", {
        attemptId,
        category: error.code,
      });
    }
    try {
      const attempt = await service.getRepairAttempt(session, attemptId);
      if (attempt.status !== "RELEASED" && attempt.status !== "CAPTURED") {
        await service.releaseRepair(session, attemptId, reason, error instanceof CustomerVisibleError && error.code === "GATE_BLOCKED");
      }
    } catch {
      // Preserve the original failure while ensuring the background task settles.
    }
  }
}

async function runningPayload(session: BetaSessionView, attempt: RepairAttempt) {
  return {
    state: "RUNNING",
    attempt,
    credits: await getBetaBackend().getCredits(session),
    poll_url: `/api/repair-attempts?attempt_id=${encodeURIComponent(attempt.id)}`,
    message: "正在修正图片，通常需要 1–3 分钟。你可以停留在页面，也可以稍后刷新回来查看。",
  };
}

async function completedPayload(session: BetaSessionView, attempt: RepairAttempt) {
  return {
    state: "COMPLETED",
    attempt,
    credits: await getBetaBackend().getCredits(session),
    output_url: `/api/assets/${attempt.outputAssetId}`,
    download_url: await createSignedDownloadUrl(session, attempt.outputAssetId!),
    gate: { message: "修正版已通过基础检查；仍需你人工确认。", human_confirmation_required: true },
    next_step: "对比修正前后，并确认商品、人物和非目标区域后再下载。",
  };
}

function customerErrorForProviderFailure(code: QwenImage3ProviderError["code"]): CustomerVisibleError {
  if (code === "AUTHENTICATION" || code === "QUOTA" || code === "CONFIGURATION") {
    return new CustomerVisibleError(
      "MODEL_UNAVAILABLE",
      "当前修图服务暂时不可用，本次没有扣除内测额度。",
      503,
      "请联系内测管理员检查服务额度；你的问题描述和框选区域仍然保留。",
    );
  }
  if (code === "INVALID_INPUT" || code === "INVALID_OUTPUT") {
    return new CustomerVisibleError(
      "MODEL_FAILED",
      "本次没有形成可用修正版，也没有扣除内测额度。",
      422,
      "请缩小问题区域或简化修改要求后再次提交。",
    );
  }
  return new CustomerVisibleError(
    "MODEL_FAILED",
    "本次修图服务连接没有完成，且没有扣除内测额度。",
    503,
    "请直接再次提交；系统会创建一笔新的修图任务。",
  );
}

function buildCustomerRepairPrompt(issue: string, region: Region): string {
  return [
    `只处理这个问题：${issue.slice(0, 500)}。`,
    `归一化目标区域：x=${region.x.toFixed(3)}, y=${region.y.toFixed(3)}, width=${region.width.toFixed(3)}, height=${region.height.toFixed(3)}。`,
    "以商品真值图为唯一商品依据。修复目标区域后自然衔接材质、边缘、遮挡与光影。",
    "目标区域以外的商品、人物、背景、镜头、构图、画幅和像素比例全部锁定不变。",
  ].join(" ");
}

function parseRegion(value: unknown): Region | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const region = {
    x: Number(source.x),
    y: Number(source.y),
    width: Number(source.width),
    height: Number(source.height),
  };
  return Object.values(region).every(Number.isFinite) ? region : null;
}

function parseRegions(value: unknown): Region[] {
  return Array.isArray(value) ? value.map(parseRegion).filter((entry): entry is Region => Boolean(entry)).slice(0, 12) : [];
}

function perimeterLocks(region: Region): Region[] {
  const locks: Region[] = [];
  if (region.y > 0.01) locks.push({ x: 0, y: 0, width: 1, height: region.y });
  if (region.x > 0.01) locks.push({ x: 0, y: region.y, width: region.x, height: region.height });
  if (region.x + region.width < 0.99) locks.push({ x: region.x + region.width, y: region.y, width: 1 - region.x - region.width, height: region.height });
  if (region.y + region.height < 0.99) locks.push({ x: 0, y: region.y + region.height, width: 1, height: 1 - region.y - region.height });
  return locks.length ? locks : [{ x: 0, y: 0, width: 0.01, height: 0.01 }];
}
