"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketingAgentRun } from "../lib/visionqa/agents/local-orchestrator";
import type { ProductExpressionV01 } from "../lib/visionqa/product-expression";

type MarketingDeliveryPackProps = {
  productName: string;
  sourceLabel: string;
  reviewIssues: string[];
  isDemo: boolean;
  audienceSegments: string[];
  scenarios: string[];
  purchaseDrivers: string[];
  lockedAttributes: string[];
  productExpression: ProductExpressionV01 | null;
};

const creatorProfiles = [
  {
    name: "通勤穿搭观察型",
    fit: "擅长用全身定帧、行走中景和局部特写说明版型",
    use: "小红书种草、抖音轻剧情前的商品观察",
    risk: "真实账号必须联网核验来源、日期和授权，不复制具体博主表达",
  },
  {
    name: "服饰细节拆解型",
    fit: "能围绕印花、腰线、袖口和可见工艺建立证据链",
    use: "详情页补充、信息流短视频和评论区答疑",
    risk: "不得猜测材质成分、舒适度或未提供的商品功效",
  },
  {
    name: "轻量试穿说明型",
    fit: "用自然动作呈现正面轮廓、裙长和搭配关系",
    use: "抖音 15 秒素材、直播切片和商品卡引流",
    risk: "不得虚构显瘦、库存、折扣、销量或用户评价",
  },
] as const;

type MarketingPlatform = "小红书" | "抖音";
type L2AgentCapability = {
  runtime_ready: boolean;
  current_level: "L2_RUNTIME_SCAFFOLD";
  active_provider: "NON_MODEL_TEST_PROVIDER";
  selected_provider: "QWEN_BAILIAN";
  external_model_configured: boolean;
  external_calls_enabled: boolean;
  local_material_access: "USER_AUTHORIZED_LOCAL_ONLY";
  qwen_provider: {
    model_snapshot: string;
    adapter_ready: boolean;
    api_key_configured: boolean;
    live_ready: boolean;
    blockers: string[];
  };
};

function downloadJson(payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "VisionQA-marketing-delivery-pack.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function MarketingDeliveryPack({
  productName,
  sourceLabel,
  reviewIssues,
  isDemo,
  audienceSegments,
  scenarios,
  purchaseDrivers,
  lockedAttributes,
  productExpression,
}: MarketingDeliveryPackProps) {
  const [platform, setPlatform] = useState<MarketingPlatform>("小红书");
  const [copied, setCopied] = useState<string | null>(null);
  const [activePrompt, setActivePrompt] = useState(0);
  const [agentRun, setAgentRun] = useState<MarketingAgentRun | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentCapability, setAgentCapability] = useState<L2AgentCapability | null>(null);
  const copy = agentRun?.output.social_copy[platform] ?? null;
  const painPointMap = useMemo(() => agentRun?.output.pain_points ?? [], [agentRun]);
  const generatedScripts = useMemo(() => agentRun?.output.scripts ?? [], [agentRun]);
  const generatedPrompts = useMemo(() => agentRun?.output.video_prompts ?? [], [agentRun]);

  useEffect(() => {
    let active = true;
    void fetch("/api/agent-runs", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<L2AgentCapability> : Promise.reject(new Error("能力接口不可用")))
      .then((capability) => { if (active) setAgentCapability(capability); })
      .catch(() => { if (active) setAgentCapability(null); });
    return () => { active = false; };
  }, []);

  const deliveryPack = useMemo(
    () => ({
      schema_version: "marketing-delivery-pack-v0.2",
      product_name: productName,
      source: sourceLabel,
      evidence_status: isDemo ? "DEMO_ONLY" : "HUMAN_REVIEW_REQUIRED",
      creator_profiles: creatorProfiles,
      real_creator_candidates: [],
      pain_point_map: painPointMap,
      agent_run_id: agentRun?.run_id ?? null,
      agent_execution_mode: agentRun?.execution_mode ?? null,
      claim_ledger: agentRun?.claims ?? [],
      social_copy: agentRun?.output.social_copy ?? {},
      verbatim_scripts: generatedScripts,
      information_flow_video_outline: [
        "0-3 秒：完整正面建立商品识别",
        "3-8 秒：腰线、袖口和图案位置近景",
        "8-12 秒：自然动作检查版型与非目标区域",
        "12-15 秒：回到完整正面并保留确认提醒",
      ],
      video_generation_prompts: generatedPrompts,
      review_issues: reviewIssues,
      prohibited_claims: ["折扣", "库存", "销量", "评价", "未确认材质", "未证实功效", "竞品结论"],
      human_final_review_required: true,
    }),
    [agentRun, generatedPrompts, generatedScripts, isDemo, painPointMap, productName, reviewIssues, sourceLabel],
  );

  const runAgents = async () => {
    setAgentRunning(true);
    setAgentError(null);
    try {
      const response = await fetch("/api/agent-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: productName,
          source_label: sourceLabel,
          evidence_mode: isDemo ? "DEMO_ONLY" : "HUMAN_REVIEW_REQUIRED",
          audience_segments: audienceSegments,
          scenarios,
          purchase_drivers: purchaseDrivers,
          review_issues: reviewIssues,
          locked_attributes: lockedAttributes,
          product_expression: productExpression,
        }),
      });
      if (!response.ok) throw new Error("智能体输入未通过校验");
      setAgentRun(await response.json() as MarketingAgentRun);
      setActivePrompt(0);
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : "智能体运行失败");
    } finally {
      setAgentRunning(false);
    }
  };

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  return (
    <section className="marketing-pack" aria-labelledby="marketing-pack-title">
      <div className="marketing-pack-heading">
        <div>
          <span>营销交付包</span>
          <h2 id="marketing-pack-title">把质量评审结论变成可执行的推广素材。</h2>
          <p>{isDemo ? "当前为示例模板，不构成真实客户营销建议。" : "当前草案只使用已评审结果，仍需人工确认商品事实和发布信息。"}</p>
        </div>
        <button className="quiet-button" type="button" disabled={!agentRun} onClick={() => downloadJson(deliveryPack)}>导出交付包 JSON</button>
      </div>

      <section className="agent-workbench" aria-labelledby="agent-workbench-title">
        <div className="agent-workbench-head">
          <div>
            <span>L2 领域智能体运行时</span>
            <h3 id="agent-workbench-title">让决策循环调用工具，让事实 Gate 决定停止。</h3>
            <p>千问已设为首选外部 Provider；在 API Key 与付费调用获准前，当前仍使用非模型测试 Provider 验证“决策 → 工具 → 观察 → 审计 → 停止”，不联网、不上传图片、不产生模型费用。</p>
          </div>
          <button className="primary-button" type="button" disabled={agentRunning || !agentCapability?.runtime_ready} onClick={() => void runAgents()}>{agentRunning ? "正在执行工具循环…" : agentRun ? "重新运行 L2 测试" : "运行 L2 测试链路"}</button>
        </div>
        <dl className="agent-capability-strip">
          <div><dt>运行时</dt><dd>{agentCapability?.current_level ?? "检查中"}</dd></div>
          <div><dt>首选 Provider</dt><dd>{agentCapability?.selected_provider === "QWEN_BAILIAN" ? "千问 · 百炼" : "检查中"}</dd></div>
          <div><dt>千问状态</dt><dd>{agentCapability?.qwen_provider.live_ready ? "已获准启用" : agentCapability?.qwen_provider.adapter_ready ? "适配完成 · 等待授权" : "检查中"}</dd></div>
          <div><dt>本地素材</dt><dd>{agentCapability?.local_material_access === "USER_AUTHORIZED_LOCAL_ONLY" ? "已授权 · 仅本地" : "检查中"}</dd></div>
        </dl>
        {agentError ? <p className="agent-error" role="alert">{agentError}</p> : null}
        {agentRun ? (
          <>
            <div className="agent-run-summary">
              <strong>{agentRun.status === "READY_FOR_HUMAN_REVIEW" ? "可进入人工审核" : agentRun.status === "NEEDS_INPUT" ? "需要补充输入" : "发现不支持声明"}</strong>
              <span>{agentRun.execution_mode}</span><span>{agentRun.run_id}</span>
            </div>
            {agentRun.runtime ? (
              <section className="agent-runtime-trace" aria-labelledby="agent-runtime-trace-title">
                <div><span>工具执行轨迹</span><h4 id="agent-runtime-trace-title">{agentRun.runtime.trace.length} 个可审计事件</h4><small>{agentRun.runtime.provider_id} · {agentRun.runtime.provider_kind}</small></div>
                <ol>{agentRun.runtime.trace.map((event, index) => <li key={`${event.step}-${event.kind}-${index}`}><span className="mono">{String(event.step).padStart(2, "0")}</span><strong>{event.kind === "PROVIDER_DECISION" ? "决策" : event.kind === "TOOL_RESULT" ? "工具返回" : "停止"}</strong><code>{event.tool_name ?? "FINAL"}</code><p>{event.summary}</p></li>)}</ol>
              </section>
            ) : null}
            <div className="agent-chain">
              {agentRun.agents.map((agent, index) => (
                <article key={agent.id}><span className="mono">{String(index + 1).padStart(2, "0")}</span><div><strong>{agent.name}</strong><p>{agent.responsibility}</p></div><div><small>{agent.status}</small><p>{agent.note}</p></div></article>
              ))}
            </div>
            <details className="claim-ledger"><summary>查看事实账本与未知项 · {agentRun.claims.length} 条事实 / {agentRun.unknowns.length} 项待确认</summary><div className="claim-ledger-grid"><div>{agentRun.claims.map((claim) => <p key={claim.id}><b>{claim.id}</b><span>{claim.statement}</span><small>{claim.source_ref}</small></p>)}</div><ul>{agentRun.unknowns.map((item) => <li key={item}>{item}</li>)}</ul></div></details>
          </>
        ) : <div className="agent-empty"><strong>尚未运行 L2 工具循环</strong><p>千问适配层已就绪（{agentCapability?.qwen_provider.model_snapshot ?? "固定模型版本检查中"}）。授权启用前，本地测试 Provider 只验证运行机制。</p></div>}
      </section>

      <section className="creator-benchmark" aria-labelledby="creator-benchmark-title">
        <div className="section-title-row">
          <div>
            <span>对标推广博主</span>
            <h3 id="creator-benchmark-title">先交付博主画像，再核验真实账号。</h3>
          </div>
          <strong>真实账号候选 0</strong>
        </div>
        <div className="creator-benchmark-rows">
          {creatorProfiles.map((profile) => (
            <article key={profile.name}>
              <h4>{profile.name}</h4>
              <p>{profile.fit}</p>
              <dl>
                <div><dt>适用</dt><dd>{profile.use}</dd></div>
                <div><dt>边界</dt><dd>{profile.risk}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="pain-point-map" aria-labelledby="pain-point-map-title">
        <div className="section-title-row">
          <div><span>痛点分析</span><h3 id="pain-point-map-title">从人群阻力出发，不凭空制造需求。</h3></div>
          <strong>事实绑定</strong>
        </div>
        <div className="pain-point-rows">
          {painPointMap.length ? painPointMap.map((item, index) => (
            <article key={item.audience}>
              <span className="mono">{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{item.audience}</strong><p>{item.scene}</p></div>
              <div><small>决策阻力</small><p>{item.friction}</p></div>
              <div><small>内容回应</small><p>{item.response}</p></div>
              <div><small>证据引用</small><p>{item.evidence_refs.join(" / ") || "待补充"}</p></div>
            </article>
          )) : <div className="output-empty">运行智能体后生成基于人群、场景和质量证据的痛点分析。</div>}
        </div>
      </section>

      <div className="marketing-output-grid">
        <section className="social-copy-sheet" aria-labelledby="social-copy-title">
          <div className="output-sheet-head">
            <div>
              <span>平台营销文案</span>
              <h3 id="social-copy-title">小红书 / 抖音</h3>
            </div>
            <div className="platform-switch" role="tablist" aria-label="营销平台">
              {(["小红书", "抖音"] as MarketingPlatform[]).map((item) => (
                <button key={item} type="button" role="tab" aria-selected={platform === item} onClick={() => setPlatform(item)}>{item}</button>
              ))}
            </div>
          </div>
          <div className="copy-output">
            {copy ? <><strong>{copy.title}</strong><p>{copy.body}</p><span>{copy.tags} · 证据 {copy.evidence_refs.join(" / ")}</span></> : <p>尚未生成。请先运行营销智能体。</p>}
          </div>
          <button className="text-button" type="button" disabled={!copy} onClick={() => copy && void copyText(`copy-${platform}`, `${copy.title}\n\n${copy.body}\n\n${copy.tags}`)}>{copied === `copy-${platform}` ? "已复制" : "复制整段文案"}</button>
        </section>

        <section className="video-outline-sheet" aria-labelledby="video-outline-title">
          <span>信息流视频大纲</span>
          <h3 id="video-outline-title">15 秒，四段证据节奏</h3>
          <ol>
            <li><span>00-03s</span><p>完整正面，建立商品识别。</p></li>
            <li><span>03-08s</span><p>腰线、袖口和图案位置近景。</p></li>
            <li><span>08-12s</span><p>自然动作，检查版型与非目标区域。</p></li>
            <li><span>12-15s</span><p>回到完整正面，保留事实确认提醒。</p></li>
          </ol>
          <p className="review-binding">评审绑定：{reviewIssues.length ? reviewIssues.join(" / ") : "当前没有真实评审问题，使用示例结构"}</p>
        </section>
      </div>

      <section className="verbatim-script-sheet" aria-labelledby="verbatim-script-title">
        <div className="section-title-row">
          <div><span>场景化话术</span><h3 id="verbatim-script-title">可交给运营继续审核的逐字稿。</h3></div>
          <strong>15 秒 / 30 秒</strong>
        </div>
        <div className="verbatim-script-grid">
          {generatedScripts.length ? generatedScripts.map((script) => (
            <article key={script.name}>
              <div><h4>{script.name}</h4><button className="text-button" type="button" onClick={() => void copyText(script.name, script.lines.join("\n"))}>{copied === script.name ? "已复制" : "复制逐字稿"}</button></div>
              <ol>{script.lines.map((line) => <li key={line}>{line}</li>)}</ol>
            </article>
          )) : <div className="output-empty">尚未生成逐字稿。</div>}
        </div>
      </section>

      <section className="generation-prompt-sheet" aria-labelledby="generation-prompt-title">
        <div className="prompt-index">
          <span>商业片制作参考</span>
          <h3 id="generation-prompt-title">两条可交给生视频模型或制作团队的指令。</h3>
          <div role="tablist" aria-label="视频提示词">
            {generatedPrompts.map((prompt, index) => (
              <button key={prompt.name} type="button" role="tab" aria-selected={activePrompt === index} onClick={() => setActivePrompt(index)}>{prompt.name}</button>
            ))}
          </div>
        </div>
        <div className="prompt-delivery">
          {generatedPrompts[activePrompt] ? <><div>
            <span>当前提示词</span>
            <button className="text-button" type="button" onClick={() => void copyText(`prompt-${activePrompt}`, generatedPrompts[activePrompt].text)}>{copied === `prompt-${activePrompt}` ? "已复制" : "复制提示词"}</button>
          </div><p>{generatedPrompts[activePrompt].text}</p><small>@商品正面参考图 需在实际视频模型中替换为已授权素材；交付前仍需人工终审。</small></> : <div className="output-empty inverse">尚未生成视频模型提示词。</div>}
        </div>
      </section>
    </section>
  );
}
