// Versioned UI/domain port. Mock must never import provider or beta-account modules.
export const MOCK_SCHEMA = "visual-conversation-mock-v1" as const;
export type Asset = { id: string; name: string; role: "truth" | "candidate"; url: string };
export type Message = { id: string; role: "user" | "assistant"; text: string; assetIds?: string[] };
export type Finding = { assetId: string; issue: string; disposition: "attention" | "manual" | "clear" };
export type Version = { id: string; number: number; assetId: string; sourceVersionId: string | null; sourceUrl: string; outputUrl: string; instruction: string; reviewed: boolean };
export type Conversation = {
  id: string; name: string; stage: "intake" | "screened" | "repair" | "delivered";
  messages: Message[]; assets: Asset[]; findings: Finding[]; versions: Version[];
  selectedAssetId: string | null; sourceVersionId: string | null; viewingVersionId: string | null;
  instruction: string; revision: number; error: string | null;
};
export type MockSnapshot = { schema: typeof MOCK_SCHEMA; storageRevision?: number; conversations: Conversation[]; selectedId: string | null; receipts: string[] };
export type Command =
  | { kind: "create"; name: string }
  | { kind: "message"; text: string }
  | { kind: "attach"; assets: Asset[] }
  | { kind: "screen" }
  | { kind: "choose"; assetId: string }
  | { kind: "repair"; fail?: boolean }
  | { kind: "view"; versionId: string }
  | { kind: "continue"; versionId: string | null }
  | { kind: "review"; versionId: string }
  | { kind: "back"; target: "intake" | "screened" };
export interface ConversationPort {
  readonly mode: "mock" | "live";
  load(): Promise<MockSnapshot>;
  execute(state: MockSnapshot, conversationId: string | null, commandId: string, command: Command): Promise<MockSnapshot>;
  save(state: MockSnapshot): Promise<void>;
}
export const emptyMock = (): MockSnapshot => ({ schema: MOCK_SCHEMA, conversations: [], selectedId: null, receipts: [] });

// Pure deterministic mock scenario: labels are scripted, not inferred from image pixels.
export function applyMock(state: MockSnapshot, conversationId: string | null, commandId: string, command: Command): MockSnapshot {
  if (state.receipts.includes(commandId)) return state;
  const next = structuredClone(state);
  const add = (c: Conversation, role: Message["role"], text: string, assetIds?: string[]) => c.messages.push({ id: `${commandId}-${c.messages.length}`, role, text, assetIds });
  if (command.kind === "create") {
    const name = command.name.trim().slice(0, 100);
    if (!name) throw new Error("先给这件商品起个名字。");
    const c: Conversation = { id: commandId, name, stage: "intake", messages: [], assets: [], findings: [], versions: [], selectedAssetId: null, sourceVersionId: null, viewingVersionId: null, instruction: "", revision: 0, error: null };
    add(c, "assistant", `我们围绕「${name}」开展协作。请添加商品参考图和待检查图，也可以载入示例。当前是交互模拟，不调用模型。`);
    next.conversations.push(c); next.selectedId = c.id;
  } else {
    const c = next.conversations.find(item => item.id === conversationId);
    if (!c) throw new Error("请先选择或建立一个商品对话。");
    c.error = null;
    if (command.kind === "message") {
      const text = command.text.trim().slice(0, 2000);
      if (!text) throw new Error("请写下你想完成的事情。");
      add(c, "user", text);
      if (c.selectedAssetId && (c.stage === "repair" || c.stage === "delivered")) {
        if (c.stage === "delivered") c.sourceVersionId = c.viewingVersionId;
        c.instruction = text; c.stage = "repair"; add(c, "assistant", "已更新本轮修改要求。请检查下方计划，确认后再生成模拟版本；商品参考与非目标部分保持不变。"); }
      else add(c, "assistant", "要求已记在当前商品对话中。下一步先准备图片，然后点击对话中的筛查动作。这里的回复是预设交互，不是模型推理。");
    } else if (command.kind === "attach") {
      const assets = [...c.assets, ...command.assets];
      if (assets.filter(a => a.role === "truth").length > 4 || assets.filter(a => a.role === "candidate").length > 10) throw new Error("每件商品最多 4 张参考图和 10 张待检查图，本次未加入超量文件。");
      if (command.assets.some(a => c.assets.some(old => old.id === a.id))) throw new Error("这些素材已经加入。");
      c.assets = assets; c.stage = "intake"; c.findings = []; c.selectedAssetId = null;
      add(c, "user", `添加 ${command.assets.length} 张素材`, command.assets.map(a => a.id));
      add(c, "assistant", "图片已保存在本浏览器的独立模拟工作区，不上传模型。补齐参考图和待检查图后，就可以模拟筛查。");
    } else if (command.kind === "screen") {
      if (!c.assets.some(a => a.role === "truth") || !c.assets.some(a => a.role === "candidate")) throw new Error("请至少添加 1 张参考图和 1 张待检查图。");
      c.findings = c.assets.filter(a => a.role === "candidate").map((a, i) => ({ assetId: a.id, disposition: i % 3 === 0 ? "attention" : i % 3 === 1 ? "manual" : "clear", issue: i % 3 === 0 ? "模拟问题：检查商品局部细节是否与参考一致" : i % 3 === 1 ? "模拟状态：需要人工补充判断" : "模拟状态：未见明显问题" }));
      c.stage = "screened"; add(c, "user", "开始模拟筛查"); add(c, "assistant", `筛查交互已完成，共 ${c.findings.length} 张。下方是按预设场景分配的结果，不代表这些图片真的存在或不存在问题。请选择一张继续修正。`);
    } else if (command.kind === "choose") {
      const finding = c.findings.find(f => f.assetId === command.assetId);
      if (!finding) throw new Error("请从当前筛查结果选择图片。");
      c.selectedAssetId = command.assetId; c.sourceVersionId = null; c.instruction = finding.issue; c.stage = "repair";
      add(c, "user", `选择「${c.assets.find(a => a.id === command.assetId)?.name}」进行修正`);
      add(c, "assistant", "请在输入框说明哪里需要修改、哪些内容必须保持。也可以直接确认下方的模拟计划。");
    } else if (command.kind === "repair") {
      if (!c.selectedAssetId || !c.instruction.trim() || c.stage !== "repair") throw new Error("请先选择图片并确认本轮修改要求。");
      add(c, "user", `确认本轮模拟修正：${c.instruction}`);
      if (command.fail) { c.error = "模拟连接失败：本轮未生成版本，也未扣任何额度。要求已保留，可以重试。"; add(c, "assistant", c.error); }
      else {
        const source = c.sourceVersionId ? c.versions.find(v => v.id === c.sourceVersionId && v.assetId === c.selectedAssetId) : null;
        if (c.sourceVersionId && !source) throw new Error("母版不属于这张图片。");
        const sourceUrl = source?.outputUrl ?? c.assets.find(a => a.id === c.selectedAssetId)!.url;
        const version: Version = { id: commandId, number: c.versions.filter(v => v.assetId === c.selectedAssetId).length + 1, assetId: c.selectedAssetId, sourceVersionId: source?.id ?? null, sourceUrl, outputUrl: sourceUrl, instruction: c.instruction, reviewed: false };
        c.versions.push(version); c.viewingVersionId = version.id; c.stage = "delivered";
        add(c, "assistant", `模拟版本 V${version.number} 已就绪。当前输出复用母版，像素未修改，仅验证对比、版本选择和下载交互；不代表修图成功。`);
      }
    } else if (command.kind === "view" || command.kind === "review") {
      const v = c.versions.find(v => v.id === command.versionId);
      if (!v) throw new Error("版本不存在。");
      if (command.kind === "review") { v.reviewed = true; add(c, "assistant", `已记录 V${v.number} 的模拟人工确认。你可以下载明确标注 mock 的流程记录，或继续下一轮。`); }
      else { c.viewingVersionId = v.id; c.selectedAssetId = v.assetId; c.stage = "delivered"; }
    } else if (command.kind === "back") {
      if (command.target === "screened" && !c.findings.length) throw new Error("尚未筛查，请先准备图片。");
      c.stage = command.target;
      add(c, "assistant", command.target === "intake" ? "返回素材准备，已保存图片与历史版本保留。" : "返回本商品筛查结果，选择下一张继续；已有版本保留。");
    } else if (command.kind === "continue") {
      const v = command.versionId ? c.versions.find(v => v.id === command.versionId) : null;
      if (command.versionId && !v) throw new Error("版本不存在。");
      if (v) c.selectedAssetId = v.assetId;
      if (!c.selectedAssetId) throw new Error("请先选择图片。");
      c.sourceVersionId = v?.id ?? null; c.stage = "repair";
      add(c, "user", v ? `以 V${v.number} 继续修改` : "回到原图重新修改");
      add(c, "assistant", "旧版本已保留。请在输入框补充本轮要求，再确认模拟修正。");
    }
    c.revision++;
  }
  next.receipts.push(commandId);
  return next;
}
