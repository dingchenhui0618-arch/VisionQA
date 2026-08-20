import type { ProductExpressionV01 } from "../product-expression";

export type EvidenceStatus = "VERIFIED_INPUT" | "DERIVED" | "UNKNOWN" | "BLOCKED";
export type AgentStatus = "COMPLETED" | "BLOCKED";

export type GroundedClaim = {
  id: string;
  statement: string;
  basis: "USER_SUPPLIED" | "REVIEW_EVIDENCE" | "CONTRACT" | "SYSTEM_BOUNDARY";
  source_ref: string;
  status: EvidenceStatus;
};

export type MarketingAgentInput = {
  product_name: string;
  source_label: string;
  evidence_mode: "DEMO_ONLY" | "HUMAN_REVIEW_REQUIRED";
  audience_segments: string[];
  scenarios: string[];
  purchase_drivers: string[];
  review_issues: string[];
  locked_attributes: string[];
  product_expression?: ProductExpressionV01 | null;
};

export type MarketingAgentRun = {
  schema_version: "marketing-agent-run-v0.1";
  run_id: string;
  execution_mode: "LOCAL_RULES_NO_NETWORK" | "L2_RUNTIME_TEST_PROVIDER_NO_NETWORK";
  status: "READY_FOR_HUMAN_REVIEW" | "NEEDS_INPUT" | "BLOCKED_UNSUPPORTED_CLAIM";
  agents: Array<{ id: string; name: string; responsibility: string; status: AgentStatus; note: string }>;
  claims: GroundedClaim[];
  unknowns: string[];
  output: {
    pain_points: Array<{ audience: string; scene: string; friction: string; response: string; evidence_refs: string[] }>;
    social_copy: Record<"小红书" | "抖音", { title: string; body: string; tags: string; evidence_refs: string[] }>;
    scripts: Array<{ name: string; lines: string[]; evidence_refs: string[] }>;
    video_prompts: Array<{ name: string; text: string; evidence_refs: string[] }>;
  };
  audit: { unsupported_claims: string[]; prohibited_claim_terms: string[]; human_final_review_required: true };
  runtime?: {
    level: "L2_DOMAIN_AGENT";
    provider_id: string;
    provider_kind: "NON_MODEL_TEST_PROVIDER" | "EXTERNAL_MODEL";
    external_network_used: boolean;
    model_inference_used: boolean;
    max_steps: number;
    stop_reason: "PROVIDER_FINAL" | "MAX_STEPS" | "TOOL_REJECTED" | "PROVIDER_ERROR";
    trace: AgentRuntimeTrace[];
  };
};

export type AgentRuntimeTrace = {
  step: number;
  kind: "PROVIDER_DECISION" | "TOOL_RESULT" | "FINAL";
  tool_name: string | null;
  status: "OK" | "BLOCKED" | "ERROR";
  summary: string;
};

const prohibitedClaimTerms = ["折扣", "库存", "销量", "用户评价", "纯棉", "真丝", "显瘦", "防水", "治愈", "第一", "全网最低"];

function clean(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 12);
}

function localRunId(input: MarketingAgentInput): string {
  const source = JSON.stringify(input);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return `local-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function runGroundedMarketingAgents(raw: MarketingAgentInput): MarketingAgentRun {
  const input = {
    ...raw,
    audience_segments: clean(raw.audience_segments), scenarios: clean(raw.scenarios), purchase_drivers: clean(raw.purchase_drivers),
    review_issues: clean(raw.review_issues), locked_attributes: clean(raw.locked_attributes),
  };
  const claims: GroundedClaim[] = [];
  const addClaim = (statement: string, basis: GroundedClaim["basis"], source_ref: string) => {
    const id = `C${String(claims.length + 1).padStart(2, "0")}`;
    claims.push({ id, statement, basis, source_ref, status: "VERIFIED_INPUT" });
    return id;
  };
  const productRef = addClaim(`商品标识：${input.product_name}`, "USER_SUPPLIED", "input.product_name");
  const audienceRefs = input.audience_segments.map((value, index) => addClaim(`目标人群：${value}`, "USER_SUPPLIED", `input.audience_segments.${index}`));
  const scenarioRefs = input.scenarios.map((value, index) => addClaim(`使用场景：${value}`, "USER_SUPPLIED", `input.scenarios.${index}`));
  const driverRefs = input.purchase_drivers.map((value, index) => addClaim(`关注因素：${value}`, "USER_SUPPLIED", `input.purchase_drivers.${index}`));
  const issueRefs = input.review_issues.map((value, index) => addClaim(`质量评审发现：${value}`, "REVIEW_EVIDENCE", `input.review_issues.${index}`));
  const lockedRefs = input.locked_attributes.map((value, index) => addClaim(`改图锁定项：${value}`, "REVIEW_EVIDENCE", `input.locked_attributes.${index}`));
  if (input.product_expression) addClaim(`商品表达效能 Gate：${input.product_expression.sku_consistency_gate}`, "CONTRACT", "input.product_expression.sku_consistency_gate");

  const unknowns: string[] = [];
  if (!audienceRefs.length) unknowns.push("目标人群未确认");
  if (!scenarioRefs.length) unknowns.push("使用场景未确认");
  if (!driverRefs.length) unknowns.push("购买关注因素未确认");
  if (!input.product_expression) unknowns.push("商品表达效能新版评审尚未接入当前素材");
  unknowns.push("材质成分、尺码、价格、库存、销量与促销信息未作为已核验事实输入");

  const count = Math.max(1, Math.min(3, audienceRefs.length || scenarioRefs.length || driverRefs.length));
  const painPoints = Array.from({ length: count }, (_, index) => {
    const audience = input.audience_segments[index] ?? "待确认人群";
    const scene = input.scenarios[index] ?? "待确认场景";
    const driver = input.purchase_drivers[index] ?? "商品信息清晰度";
    const issue = input.review_issues[index] ?? "当前没有对应的真实质量问题输入";
    return {
      audience, scene,
      friction: `在${scene}中，${audience}需要先确认“${driver}”，同时避免素材问题影响判断。`,
      response: `内容先呈现已确认的商品结构，再针对“${issue}”安排复核镜头；未确认信息不作承诺。`,
      evidence_refs: [audienceRefs[index], scenarioRefs[index], driverRefs[index], issueRefs[index]].filter(Boolean) as string[],
    };
  });
  const mainAudience = input.audience_segments[0] ?? "目标用户";
  const mainScene = input.scenarios[0] ?? "实际使用场景";
  const mainDriver = input.purchase_drivers[0] ?? "商品结构与细节";
  const sharedRefs = [productRef, audienceRefs[0], scenarioRefs[0], driverRefs[0], issueRefs[0], lockedRefs[0]].filter(Boolean) as string[];
  const socialCopy = {
    小红书: {
      title: `${mainScene}选款，先看清${mainDriver}`,
      body: `面向${mainAudience}，这组内容先用完整画面确认商品轮廓，再用近景核对已确认细节。画面结论只覆盖当前素材；材质、尺码、价格等信息请以商品方最终资料为准。`,
      tags: `#服饰细节 #${mainScene.replace(/\s/g, "")} #商品展示`, evidence_refs: sharedRefs,
    },
    抖音: {
      title: `15 秒看清${mainDriver}`,
      body: `先看完整商品，再看关键细节，最后回到${mainScene}中的实际呈现。只表达已经确认的画面事实，未知信息不作承诺。`,
      tags: "#服饰展示 #商品细节 #电商短视频", evidence_refs: sharedRefs,
    },
  };
  const scripts = [{
    name: "15 秒场景化逐字稿",
    lines: [
      `0–3 秒｜完整商品。口播：先看清这件商品本身，再判断它是否适合${mainScene}。`,
      `3–8 秒｜关键细节。口播：这一步重点核对${mainDriver}，画面只保留已经确认的信息。`,
      `8–12 秒｜自然动作。口播：动作中继续观察轮廓与细节，不用夸张效果遮住问题。`,
      "12–15 秒｜完整画面。口播：材质、尺码和价格，请以商品方最终资料为准。",
    ], evidence_refs: sharedRefs,
  }];
  const videoPrompts = [{
    name: "15 秒商品证据片提示词",
    text: `竖屏 9:16，15 秒。以 @商品正面参考图 作为商品结构唯一依据。0-3 秒完整正面；3-8 秒推进至${mainDriver}相关可见细节；8-12 秒在${mainScene}中做自然动作；12-15 秒回到完整正面。锁定所有已确认商品结构与${input.locked_attributes.join("、") || "原商品可见属性"}；不得新增文字、价格、促销、材质效果或未经输入确认的卖点。`,
    evidence_refs: sharedRefs,
  }];
  const serializedOutput = JSON.stringify({ painPoints, socialCopy, scripts, videoPrompts });
  const unsupported = prohibitedClaimTerms.filter((term) => serializedOutput.includes(term) && !["价格", "促销"].includes(term));
  const factsReady = audienceRefs.length > 0 && scenarioRefs.length > 0 && driverRefs.length > 0;
  const expressionReady = Boolean(input.product_expression && input.product_expression.sku_consistency_gate !== "NOT_ASSESSABLE");
  const status = unsupported.length ? "BLOCKED_UNSUPPORTED_CLAIM" : !factsReady || !expressionReady ? "NEEDS_INPUT" : "READY_FOR_HUMAN_REVIEW";
  return {
    schema_version: "marketing-agent-run-v0.1", run_id: localRunId(input), execution_mode: "LOCAL_RULES_NO_NETWORK", status,
    agents: [
      { id: "fact-guard", name: "商品事实守门员", responsibility: "整理允许使用的事实与未知项", status: factsReady ? "COMPLETED" : "BLOCKED", note: factsReady ? `登记 ${claims.length} 条可追溯事实` : "缺少人群、场景或关注因素" },
      { id: "expression-reviewer", name: "商品表达评审员", responsibility: "读取商品表达效能与质量问题", status: expressionReady ? "COMPLETED" : "BLOCKED", note: expressionReady ? "已绑定可评估的新版契约" : "当前仅使用质量问题，等待可评估的新版评审结果" },
      { id: "marketing-strategist", name: "营销策略生成员", responsibility: "生成痛点、文案、逐字稿与视频提示词", status: factsReady ? "COMPLETED" : "BLOCKED", note: factsReady ? "所有输出附证据引用" : "输入不足，不形成可交付结论" },
      { id: "evidence-auditor", name: "证据审计员", responsibility: "拦截无来源承诺与禁用事实", status: unsupported.length ? "BLOCKED" : "COMPLETED", note: unsupported.length ? `发现 ${unsupported.length} 项不支持声明` : "未发现未授权的事实型承诺" },
    ], claims, unknowns, output: { pain_points: painPoints, social_copy: socialCopy, scripts, video_prompts: videoPrompts },
    audit: { unsupported_claims: unsupported, prohibited_claim_terms: prohibitedClaimTerms, human_final_review_required: true },
  };
}
