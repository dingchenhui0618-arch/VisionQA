import {
  ASSET_MAX_BYTES,
  ASSET_RETENTION_DAYS,
  BETA_SESSION_MAX_AGE_SECONDS,
  CustomerVisibleError,
  INITIAL_BETA_CREDITS,
  INVITE_VALID_DAYS,
  SCREENING_MAX_CANDIDATES,
  SCREENING_MAX_TRUTH_IMAGES,
  type BetaAsset,
  type BetaProject,
  type BetaRole,
  type BetaSessionView,
  type CreditBalance,
  type CreditEntryType,
  type RepairAttempt,
  type ScreeningBatch,
  type ScreeningItem,
} from "./contracts.ts";
import {
  addEvolutionEvidence,
  applyPlannerDecision,
  createRepairEvolutionEpisode,
  publicEvolutionEvents,
  type RepairEvolutionEpisode,
  type RepairPlannerDecision,
} from "../visionqa/agents/recursive-repair.ts";
import { localStateStore, type StateStore } from "./local-state.ts";
import { regionProblem } from "../agent/repair-client.ts";

type InviteRecord = {
  id: string;
  tokenHash: string;
  label: string;
  role: BetaRole;
  initialCredits: number;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
};

type UserRecord = { id: string; displayName: string; createdAt: string };
type TenantRecord = { id: string; name: string; createdAt: string };
type MembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  role: BetaRole;
  createdAt: string;
};
type SessionRecord = {
  id: string;
  tokenHash: string;
  userId: string;
  tenantId: string;
  membershipId: string;
  role: BetaRole;
  expiresAt: string;
  createdAt: string;
};
type WalletRecord = { tenantId: string; available: number; held: number; captured: number };
type LedgerRecord = {
  id: string;
  tenantId: string;
  type: CreditEntryType;
  amount: number;
  referenceId: string;
  reason: string;
  createdAt: string;
};
type HoldRecord = {
  id: string;
  tenantId: string;
  attemptId: string;
  status: "HELD" | "CAPTURED" | "RELEASED";
  createdAt: string;
  updatedAt: string;
};

type AssetBytes = { bytes: Uint8Array; sha256: string };

export type CreateUploadIntentInput = Pick<
  BetaAsset,
  "projectId" | "role" | "fileName" | "mimeType" | "byteSize" | "width" | "height"
>;

export type RepairStartInput = {
  sourceAssetId?: string;
  projectId: string;
  screeningItemId: string;
  issue: string;
  issueRegion: { x: number; y: number; width: number; height: number };
  lockedRegions: Array<{ x: number; y: number; width: number; height: number }>;
  idempotencyKey: string;
};

export class BetaService {
  private readonly storage?: StateStore;
  private readonly invites = new Map<string, InviteRecord>();
  private readonly users = new Map<string, UserRecord>();
  private readonly tenants = new Map<string, TenantRecord>();
  private readonly memberships = new Map<string, MembershipRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly projects = new Map<string, BetaProject>();
  private readonly projectByConversation = new Map<string, string>();
  private readonly assets = new Map<string, BetaAsset>();
  private readonly assetBytes = new Map<string, AssetBytes>();
  private readonly batches = new Map<string, ScreeningBatch>();
  private readonly attempts = new Map<string, RepairAttempt>();
  private readonly repairEvolutions = new Map<string, RepairEvolutionEpisode>();
  private readonly wallets = new Map<string, WalletRecord>();
  private readonly ledger: LedgerRecord[] = [];
  private readonly holds = new Map<string, HoldRecord>();
  private readonly attemptByIdempotency = new Map<string, string>();
  private readonly now: () => Date;
  private developmentInviteReady = false;

  constructor(options: { now?: () => Date; storage?: StateStore } = {}) {
    this.now = options.now ?? (() => new Date());
    this.storage = options.storage;
    const snapshot = this.storage?.load() as { version: number; maps: Record<string, Array<[string, unknown]>>; ledger: LedgerRecord[]; developmentInviteReady: boolean } | null;
    if (snapshot) {
      if (snapshot.version !== 1 || !snapshot.maps || !Array.isArray(snapshot.ledger)) throw new Error("Incompatible local beta snapshot");
      for (const [key, map] of Object.entries(this.stateMaps())) {
        // Older local v1 snapshots predate conversation-origin tracking. This
        // additive map can start empty; never discard existing project/assets.
        if (key === "projectByConversation" && snapshot.maps[key] === undefined) continue;
        if (!Array.isArray(snapshot.maps[key])) throw new Error("Invalid local beta snapshot");
        for (const [id, value] of snapshot.maps[key]) map.set(id, value);
      }
      this.ledger.push(...snapshot.ledger);
      this.developmentInviteReady = snapshot.developmentInviteReady;
      // The previous process cannot deliver pending work. Never resume paid calls automatically.
      for (const attempt of this.attempts.values()) {
        if (attempt.status !== "HELD" && attempt.status !== "RUNNING") continue;
        const session = [...this.sessions.values()].find(item => item.tenantId === attempt.tenantId);
        if (!session) throw new Error("Cannot recover orphaned local repair");
        this.releaseRepair(this.sessionView(session), attempt.id, "本地服务在修图期间中断，未交付结果，修图额度已退回；不会自动重复调用模型。");
      }
      for (const batch of this.batches.values()) {
        if (batch.status === "RUNNING") this.batches.set(batch.id, { ...batch, status: "FAILED", completedAt: this.timestamp() });
      }
      this.cleanupExpiredAssets();
      this.persistLocalState();
    }
  }

  private stateMaps(): Record<string, Map<string, unknown>> {
    return { invites: this.invites, users: this.users, tenants: this.tenants, memberships: this.memberships,
      sessions: this.sessions, projects: this.projects, projectByConversation: this.projectByConversation, assets: this.assets, assetBytes: this.assetBytes,
      batches: this.batches, attempts: this.attempts, repairEvolutions: this.repairEvolutions,
      wallets: this.wallets, holds: this.holds, attemptByIdempotency: this.attemptByIdempotency };
  }

  persistLocalState(): void {
    this.storage?.save({ version: 1, maps: Object.fromEntries(Object.entries(this.stateMaps()).map(([key, map]) => [key, [...map]])),
      ledger: this.ledger, developmentInviteReady: this.developmentInviteReady });
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private addDays(days: number): string {
    return new Date(this.now().getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  private async ensureDevelopmentInvite(): Promise<void> {
    const isHostedTest = process.env.NODE_ENV === "production" && process.env.VISIONQA_TEST_ENVIRONMENT === "true";
    if (this.developmentInviteReady || (process.env.NODE_ENV === "production" && !isHostedTest)) return;
    const inviteTokens = isHostedTest ? readHostedTestInviteTokens(process.env) : ["visionqa-local-beta"];
    if (inviteTokens.length === 0) return;
    this.developmentInviteReady = true;
    for (const [index, inviteToken] of inviteTokens.entries()) {
      const tokenHash = await sha256Hex(inviteToken);
      this.invites.set(tokenHash, {
        id: isHostedTest ? `invite_hosted_beta_${index + 1}` : "invite_local_beta",
        tokenHash,
        label: isHostedTest ? `测试环境客户体验 ${String(index + 1).padStart(2, "0")}` : "本机客户体验",
        role: "customer",
        initialCredits: INITIAL_BETA_CREDITS,
        expiresAt: "2999-01-01T00:00:00.000Z",
        consumedAt: null,
        createdAt: this.timestamp(),
      });
    }
  }

  async createInvite(input: {
    label: string;
    role?: BetaRole;
    initialCredits?: number;
    validDays?: number;
  }): Promise<{ inviteId: string; token: string; expiresAt: string }> {
    assertCustomerBetaBackendReady();
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const invite: InviteRecord = {
      id: `inv_${crypto.randomUUID()}`,
      tokenHash,
      label: cleanText(input.label, 80) || "受邀客户",
      role: input.role ?? "customer",
      initialCredits: integerBetween(input.initialCredits ?? INITIAL_BETA_CREDITS, 0, 1000),
      expiresAt: this.addDays(integerBetween(input.validDays ?? INVITE_VALID_DAYS, 1, 30)),
      consumedAt: null,
      createdAt: this.timestamp(),
    };
    this.invites.set(tokenHash, invite);
    return { inviteId: invite.id, token, expiresAt: invite.expiresAt };
  }

  async consumeInvite(token: string): Promise<{ session: BetaSessionView; sessionToken: string }> {
    assertCustomerBetaBackendReady();
    await this.ensureDevelopmentInvite();
    const tokenHash = await sha256Hex(token.trim());
    const invite = this.invites.get(tokenHash);
    if (!invite) {
      throw new CustomerVisibleError(
        "INVITE_INVALID",
        "这个邀请链接无效。",
        404,
        "请联系内测管理员重新发送邀请链接。",
      );
    }
    const reusableLocalInvite = invite.id === "invite_local_beta" &&
      (process.env.NODE_ENV !== "production" || process.env.VISIONQA_TEST_ENVIRONMENT === "true");
    if (invite.consumedAt && !reusableLocalInvite) {
      throw new CustomerVisibleError(
        "INVITE_ALREADY_USED",
        "这个邀请链接已经使用过。",
        409,
        "如果会话丢失，请联系内测管理员发送恢复邀请。",
      );
    }
    if (Date.parse(invite.expiresAt) <= this.now().getTime()) {
      throw new CustomerVisibleError(
        "INVITE_EXPIRED",
        "这个邀请链接已经过期。",
        410,
        "请联系内测管理员重新发送邀请链接。",
      );
    }

    const createdAt = this.timestamp();
    const user: UserRecord = {
      id: `usr_${crypto.randomUUID()}`,
      displayName: invite.label,
      createdAt,
    };
    const tenant: TenantRecord = {
      id: `ten_${crypto.randomUUID()}`,
      name: `${invite.label}的工作区`,
      createdAt,
    };
    const membership: MembershipRecord = {
      id: `mem_${crypto.randomUUID()}`,
      userId: user.id,
      tenantId: tenant.id,
      role: invite.role,
      createdAt,
    };
    const sessionToken = randomToken();
    const session: SessionRecord = {
      id: `ses_${crypto.randomUUID()}`,
      tokenHash: await sha256Hex(sessionToken),
      userId: user.id,
      tenantId: tenant.id,
      membershipId: membership.id,
      role: membership.role,
      expiresAt: new Date(
        this.now().getTime() + BETA_SESSION_MAX_AGE_SECONDS * 1000,
      ).toISOString(),
      createdAt,
    };

    invite.consumedAt = reusableLocalInvite ? null : createdAt;
    this.users.set(user.id, user);
    this.tenants.set(tenant.id, tenant);
    this.memberships.set(membership.id, membership);
    this.sessions.set(session.tokenHash, session);
    this.wallets.set(tenant.id, { tenantId: tenant.id, available: 0, held: 0, captured: 0 });
    this.grantCreditsInternal(tenant.id, invite.initialCredits, invite.id, "受邀内测初始额度");
    return { session: this.sessionView(session), sessionToken };
  }

  async resolveSession(token: string | null | undefined): Promise<BetaSessionView | null> {
    if (!token) return null;
    const record = this.sessions.get(await sha256Hex(token));
    if (!record || Date.parse(record.expiresAt) <= this.now().getTime()) return null;
    return this.sessionView(record);
  }

  private sessionView(record: SessionRecord): BetaSessionView {
    const user = this.users.get(record.userId);
    return {
      userId: record.userId,
      tenantId: record.tenantId,
      membershipId: record.membershipId,
      role: record.role,
      displayName: user?.displayName ?? "受邀客户",
      expiresAt: record.expiresAt,
    };
  }

  getCredits(session: BetaSessionView): CreditBalance {
    const wallet = this.wallets.get(session.tenantId) ?? {
      tenantId: session.tenantId,
      available: 0,
      held: 0,
      captured: 0,
    };
    return { available: wallet.available, held: wallet.held, captured: wallet.captured, label: "内测额度" };
  }

  grantCredits(session: BetaSessionView, tenantId: string, amount: number, reason: string): CreditBalance {
    requireInternalRole(session);
    if (!this.tenants.has(tenantId)) {
      throw new CustomerVisibleError("FORBIDDEN", "找不到这个客户工作区。", 404, "请刷新邀请列表后重试。");
    }
    this.grantCreditsInternal(tenantId, integerBetween(amount, 1, 1000), session.userId, cleanText(reason, 160));
    return this.getCredits({ ...session, tenantId });
  }

  grantCreditsByInternalActor(tenantId: string, amount: number, reason: string, actorId: string): CreditBalance {
    if (!this.tenants.has(tenantId)) {
      throw new CustomerVisibleError("FORBIDDEN", "找不到这个客户工作区。", 404, "请刷新客户列表后重试。");
    }
    this.grantCreditsInternal(tenantId, integerBetween(amount, 1, 1000), actorId, cleanText(reason, 160));
    const wallet = this.wallets.get(tenantId)!;
    return { available: wallet.available, held: wallet.held, captured: wallet.captured, label: "内测额度" };
  }

  private grantCreditsInternal(tenantId: string, amount: number, referenceId: string, reason: string): void {
    const wallet = this.wallets.get(tenantId) ?? { tenantId, available: 0, held: 0, captured: 0 };
    wallet.available += amount;
    this.wallets.set(tenantId, wallet);
    this.addLedger(tenantId, "GRANT", amount, referenceId, reason);
  }

  createProjectForConversation(session: BetaSessionView, name: string, conversationId: string): BetaProject {
    const key = `${session.tenantId}:${session.userId}:${conversationId}`;
    const existing = this.projectByConversation.get(key);
    if (existing) return this.getProject(session, existing);
    const project = this.createProject(session, name);
    this.projectByConversation.set(key, project.id);
    return project;
  }

  createProject(session: BetaSessionView, name: string, isExample = false): BetaProject {
    const now = this.timestamp();
    const project: BetaProject = {
      id: `prj_${crypto.randomUUID()}`,
      tenantId: session.tenantId,
      name: cleanText(name, 80) || "未命名 SKU",
      status: "DRAFT",
      candidateCount: 0,
      attentionCount: 0,
      repairedCount: 0,
      isExample,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.projects.set(project.id, project);
    return { ...project };
  }

  listProjects(session: BetaSessionView): BetaProject[] {
    return [...this.projects.values()]
      .filter((project) => project.tenantId === session.tenantId && !project.deletedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((project) => ({ ...project }));
  }

  getProject(session: BetaSessionView, projectId: string): BetaProject {
    const project = this.projects.get(projectId);
    if (!project || project.deletedAt || project.tenantId !== session.tenantId) {
      throw new CustomerVisibleError("PROJECT_NOT_FOUND", "找不到这个 SKU 项目。", 404, "返回项目首页后重新选择。");
    }
    return { ...project };
  }

  deleteProject(session: BetaSessionView, projectId: string): void {
    const project = this.getProject(session, projectId);
    const now = this.timestamp();
    this.projects.set(project.id, { ...project, deletedAt: now, updatedAt: now });
    for (const asset of this.assets.values()) {
      if (asset.tenantId === session.tenantId && asset.projectId === projectId) {
        this.assets.set(asset.id, { ...asset, uploadStatus: "DELETED" });
        this.assetBytes.delete(asset.id);
      }
    }
  }

  listProjectAssets(session: BetaSessionView, projectId: string) {
    this.getProject(session, projectId);
    return [...this.assets.values()]
      .filter(asset => asset.tenantId === session.tenantId && asset.projectId === projectId
        && asset.uploadStatus === "READY" && asset.retentionUntil > this.timestamp())
      .map(({ id, role, fileName, byteSize, width, height }) => ({ id, role, fileName, byteSize, width, height }));
  }

  createUploadIntent(session: BetaSessionView, input: CreateUploadIntentInput): BetaAsset {
    this.getProject(session, input.projectId);
    if (!/^image\/(jpeg|png|webp)$/.test(input.mimeType)) {
      throw new CustomerVisibleError("ASSET_INVALID", `${input.fileName} 不是支持的图片格式。`, 415, "请改用 JPG、PNG 或 WebP 文件。");
    }
    if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > ASSET_MAX_BYTES) {
      const size = Number.isFinite(input.byteSize) ? formatMegabytes(input.byteSize) : "未知大小";
      throw new CustomerVisibleError(
        "ASSET_TOO_LARGE",
        `${input.fileName}（${size}）超过单张 10 MB 限制。`,
        413,
        "请先压缩这张图片，或导出为 10 MB 以内的 JPG/WebP 后重试。",
      );
    }
    if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 64 || input.height < 64) {
      throw new CustomerVisibleError("ASSET_INVALID", `${input.fileName} 的尺寸无法使用。`, 422, "请重新导出边长不少于 64px 的图片。");
    }
    const id = `ast_${crypto.randomUUID()}`;
    const asset: BetaAsset = {
      id,
      tenantId: session.tenantId,
      projectId: input.projectId,
      role: input.role,
      fileName: cleanText(input.fileName, 160),
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      width: input.width,
      height: input.height,
      sha256: null,
      objectKey: `beta/visionqa/${session.tenantId}/${id}`,
      uploadStatus: "PENDING",
      retentionUntil: this.addDays(ASSET_RETENTION_DAYS),
      createdAt: this.timestamp(),
    };
    this.assets.set(id, asset);
    return { ...asset };
  }

  async putAsset(session: BetaSessionView, assetId: string, bytes: Uint8Array): Promise<BetaAsset> {
    const asset = this.requireAsset(session, assetId);
    if (asset.uploadStatus !== "PENDING" || bytes.byteLength !== asset.byteSize) {
      throw new CustomerVisibleError("ASSET_INVALID", `${asset.fileName} 上传不完整。`, 409, "请删除该文件并重新上传。");
    }
    const sha256 = await sha256Hex(bytes);
    const ready = { ...asset, sha256, uploadStatus: "READY" as const };
    this.assets.set(assetId, ready);
    this.assetBytes.set(assetId, { bytes: new Uint8Array(bytes), sha256 });
    return { ...ready };
  }

  readAsset(session: BetaSessionView, assetId: string): { asset: BetaAsset; bytes: Uint8Array } {
    const asset = this.requireAsset(session, assetId);
    const content = this.assetBytes.get(assetId);
    if (!content || asset.uploadStatus !== "READY") {
      throw new CustomerVisibleError("ASSET_NOT_FOUND", "这张图片还没有上传完成。", 404, "请重新上传后继续。");
    }
    return { asset: { ...asset }, bytes: new Uint8Array(content.bytes) };
  }

  createScreeningBatch(
    session: BetaSessionView,
    input: { projectId: string; skuName: string; truthAssetIds: string[]; candidateAssetIds: string[] },
  ): ScreeningBatch {
    const project = this.getProject(session, input.projectId);
    if ([...this.batches.values()].some(batch => batch.projectId === project.id && batch.status === "RUNNING")) {
      throw new CustomerVisibleError("BATCH_INVALID", "这个商品已有筛查正在进行。", 409, "请等待当前结果，不要重复提交。");
    }
    if (
      input.truthAssetIds.length < 1 ||
      input.truthAssetIds.length > SCREENING_MAX_TRUTH_IMAGES ||
      input.candidateAssetIds.length < 1 ||
      input.candidateAssetIds.length > SCREENING_MAX_CANDIDATES
    ) {
      throw new CustomerVisibleError(
        "BATCH_INVALID",
        `请上传 1–${SCREENING_MAX_TRUTH_IMAGES} 张商品真值图和 1–${SCREENING_MAX_CANDIDATES} 张候选图。`,
        422,
        "补齐图片或移除超出上限的图片后重新开始筛查。",
      );
    }
    const all = [...new Set([...input.truthAssetIds, ...input.candidateAssetIds])];
    for (const id of all) {
      if (this.requireAsset(session, id).projectId !== project.id) {
        throw new CustomerVisibleError("BATCH_INVALID", "所选图片不属于当前商品。", 422, "请返回当前商品重新选择图片。");
      }
    }
    if (all.length !== input.truthAssetIds.length + input.candidateAssetIds.length) {
      throw new CustomerVisibleError("BATCH_INVALID", "同一张图片不能同时作为真值图和候选图。", 422, "请检查图片分组后重试。");
    }
    input.truthAssetIds.forEach((id) => requireReadyRole(this.requireAsset(session, id), "TRUTH"));
    input.candidateAssetIds.forEach((id) => requireReadyRole(this.requireAsset(session, id), "CANDIDATE"));
    const batch: ScreeningBatch = {
      id: `scr_${crypto.randomUUID()}`,
      tenantId: session.tenantId,
      projectId: project.id,
      skuName: cleanText(input.skuName, 80) || project.name,
      truthAssetIds: [...input.truthAssetIds],
      candidateAssetIds: [...input.candidateAssetIds],
      status: "RUNNING",
      items: [],
      createdAt: this.timestamp(),
      completedAt: null,
    };
    this.batches.set(batch.id, batch);
    this.projects.set(project.id, { ...project, name: batch.skuName, status: "SCREENING", candidateCount: input.candidateAssetIds.length, updatedAt: this.timestamp() });
    return cloneBatch(batch);
  }

  completeScreeningBatch(session: BetaSessionView, batchId: string, items: Omit<ScreeningItem, "id" | "tenantId" | "batchId" | "customerReviewedAt">[]): ScreeningBatch {
    const batch = this.requireBatch(session, batchId);
    if (items.length !== batch.candidateAssetIds.length) {
      throw new Error("Screening item count must match candidate count");
    }
    const completedItems = items.map((item) => ({
      ...item,
      id: `sci_${crypto.randomUUID()}`,
      tenantId: session.tenantId,
      batchId,
      customerReviewedAt: null,
    }));
    const completed: ScreeningBatch = {
      ...batch,
      status: "COMPLETED",
      items: completedItems,
      completedAt: this.timestamp(),
    };
    this.batches.set(batchId, completed);
    const project = this.getProject(session, batch.projectId);
    this.projects.set(project.id, {
      ...project,
      status: completedItems.some((item) => item.decision === "NEEDS_ATTENTION") ? "REPAIRING" : "COMPLETED",
      attentionCount: completedItems.filter((item) => item.decision === "NEEDS_ATTENTION").length,
      updatedAt: this.timestamp(),
    });
    return cloneBatch(completed);
  }

  failScreeningBatch(session: BetaSessionView, batchId: string): ScreeningBatch {
    const batch = this.requireBatch(session, batchId);
    const failed: ScreeningBatch = {
      ...batch,
      status: "FAILED",
      completedAt: this.timestamp(),
    };
    this.batches.set(batchId, failed);
    const project = this.getProject(session, batch.projectId);
    this.projects.set(project.id, { ...project, status: "DRAFT", updatedAt: this.timestamp() });
    return cloneBatch(failed);
  }

  getBatch(session: BetaSessionView, batchId: string): ScreeningBatch {
    return cloneBatch(this.requireBatch(session, batchId));
  }

  latestBatchForProject(session: BetaSessionView, projectId: string): ScreeningBatch | null {
    this.getProject(session, projectId);
    const batch = [...this.batches.values()]
      .filter((entry) => entry.tenantId === session.tenantId && entry.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return batch ? cloneBatch(batch) : null;
  }

  beginRepair(session: BetaSessionView, input: RepairStartInput): RepairAttempt {
    const project = this.getProject(session, input.projectId);
    const item = this.findScreeningItem(session, input.screeningItemId);
    if (item.batch.projectId !== project.id) {
      throw new CustomerVisibleError("FORBIDDEN", "这张图片不属于当前 SKU。", 403, "返回筛查结果后重新选择图片。");
    }
    const key = `${session.tenantId}:${cleanText(input.idempotencyKey, 128)}`;
    const replayId = this.attemptByIdempotency.get(key);
    if (replayId) {
      const replay = this.attempts.get(replayId)!;
      if (replay.projectId !== project.id || replay.screeningItemId !== input.screeningItemId || replay.sourceAssetId !== (input.sourceAssetId ?? item.item.assetId)
        || replay.issue !== cleanText(input.issue, 500) || JSON.stringify(replay.issueRegion) !== JSON.stringify(normalizeRegion(input.issueRegion))
        || JSON.stringify(replay.lockedRegions) !== JSON.stringify(input.lockedRegions.map(normalizeRegion).slice(0, 12))) {
        throw new CustomerVisibleError("BATCH_INVALID", "本次修图内容与原提交不一致。", 409, "请确认原任务状态后再开始新一轮。");
      }
      return { ...replay };
    }
    if ([...this.attempts.values()].some(a => a.projectId === project.id && ["HELD", "RUNNING"].includes(a.status))) {
      throw new CustomerVisibleError("BATCH_INVALID", "当前商品还有修图任务进行中。", 409, "请等待结果后再开始下一轮。");
    }
    const sourceAssetId = input.sourceAssetId ?? item.item.assetId;
    if (input.sourceAssetId && regionProblem(input.issueRegion)) throw new CustomerVisibleError("BATCH_INVALID", regionProblem(input.issueRegion)!, 422, "请调整本轮修改范围。");
    const source = this.readAsset(session, sourceAssetId).asset;
    if (source.projectId !== project.id || (sourceAssetId !== item.item.assetId && ![...this.attempts.values()].some(a =>
      a.projectId === project.id && a.screeningItemId === item.item.id && a.outputAssetId === sourceAssetId && a.status === "CAPTURED"))) {
      throw new CustomerVisibleError("BATCH_INVALID", "这个版本不能作为当前图片的修图母版。", 422, "请选择这张图片的原图或已完成修正版。");
    }
    if (!input.issue.trim() || !input.idempotencyKey.trim()) throw new CustomerVisibleError("BATCH_INVALID", "请填写修改要求。", 422, "确认问题与范围后再提交。");
    const wallet = this.wallets.get(session.tenantId);
    if (!wallet || wallet.available < 1) {
      throw new CustomerVisibleError(
        "INSUFFICIENT_CREDITS",
        "当前内测额度不足，无法开始修图。",
        402,
        "点击“申请更多内测额度”，告诉管理员这个 SKU 的用途。",
      );
    }
    const now = this.timestamp();
    const attemptId = `rep_${crypto.randomUUID()}`;
    const holdId = `hld_${crypto.randomUUID()}`;
    wallet.available -= 1;
    wallet.held += 1;
    this.wallets.set(session.tenantId, wallet);
    this.holds.set(holdId, { id: holdId, tenantId: session.tenantId, attemptId, status: "HELD", createdAt: now, updatedAt: now });
    this.addLedger(session.tenantId, "HOLD", -1, attemptId, "修图任务冻结 1 次额度");
    const attempt: RepairAttempt = {
      id: attemptId,
      tenantId: session.tenantId,
      projectId: project.id,
      screeningItemId: item.item.id,
      sourceAssetId,
      outputAssetId: null,
      issue: cleanText(input.issue, 500),
      issueRegion: normalizeRegion(input.issueRegion),
      lockedRegions: input.lockedRegions.map(normalizeRegion).slice(0, 12),
      status: "HELD",
      holdId,
      gateVersion: "customer-basic-gate-v0.1",
      gateResult: "PENDING",
      idempotencyKey: input.idempotencyKey,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };
    this.attempts.set(attemptId, attempt);
    this.attemptByIdempotency.set(key, attemptId);
    const episode = addEvolutionEvidence(
      createRepairEvolutionEpisode({
        projectId: project.id,
        repairAttemptId: attemptId,
        now,
      }),
      [
        {
          fingerprint: `screening:${item.item.id}:issue`,
          kind: "CUSTOMER_CORRECTION",
          summary: attempt.issue,
          verifiedBy: "HUMAN",
        },
        {
          fingerprint: `screening:${item.item.id}:evidence`,
          kind: "VISIBLE_ISSUE",
          summary: item.item.visibleEvidence,
          verifiedBy: "SYSTEM",
        },
      ],
      now,
    );
    this.repairEvolutions.set(attemptId, episode);
    return { ...attempt };
  }

  applyRepairPlannerDecision(
    session: BetaSessionView,
    attemptId: string,
    decision: RepairPlannerDecision,
    allowedRouteIds: readonly string[],
  ): RepairEvolutionEpisode {
    this.requireAttempt(session, attemptId);
    const current = this.repairEvolutions.get(attemptId);
    if (!current) throw new Error("Repair evolution episode is unavailable");
    const next = applyPlannerDecision(current, decision, allowedRouteIds, this.timestamp());
    this.repairEvolutions.set(attemptId, next);
    return cloneRepairEvolution(next);
  }

  listProjectRepairs(session: BetaSessionView, projectId: string): RepairAttempt[] {
    this.getProject(session, projectId);
    return [...this.attempts.values()].filter(a => a.tenantId === session.tenantId && a.projectId === projectId)
      .map(a => ({ ...a, issueRegion: { ...a.issueRegion }, lockedRegions: a.lockedRegions.map(r => ({ ...r })) }));
  }

  listProjectScreeningItems(session: BetaSessionView, projectId: string): ScreeningItem[] {
    this.getProject(session, projectId);
    return [...this.batches.values()].filter(b => b.tenantId === session.tenantId && b.projectId === projectId && b.status === "COMPLETED")
      .flatMap(b => cloneBatch(b).items);
  }

  getRepairReferenceBatch(session: BetaSessionView, attemptId: string): ScreeningBatch {
    const attempt = this.requireAttempt(session, attemptId);
    return cloneBatch(this.findScreeningItem(session, attempt.screeningItemId).batch);
  }

  getRepairEvolution(session: BetaSessionView, attemptId: string) {
    this.requireAttempt(session, attemptId);
    const episode = this.repairEvolutions.get(attemptId);
    return episode ? cloneRepairEvolution(episode) : null;
  }

  latestRepairEvolutionForProject(session: BetaSessionView, projectId: string): RepairEvolutionEpisode | null {
    const attempt = this.latestRepairForProject(session, projectId);
    if (!attempt) return null;
    const episode = this.repairEvolutions.get(attempt.id);
    return episode ? cloneRepairEvolution(episode) : null;
  }

  publicRepairEvolutionEventsForProject(session: BetaSessionView, projectId: string) {
    const episode = this.latestRepairEvolutionForProject(session, projectId);
    return episode ? publicEvolutionEvents(episode) : [];
  }

  markRepairRunning(session: BetaSessionView, attemptId: string): RepairAttempt {
    const attempt = this.requireAttempt(session, attemptId);
    if (attempt.status !== "HELD") return { ...attempt };
    const next = { ...attempt, status: "RUNNING" as const, updatedAt: this.timestamp() };
    this.attempts.set(attemptId, next);
    return { ...next };
  }

  captureRepair(session: BetaSessionView, attemptId: string, outputAssetId: string, protection?: RepairAttempt["protection"]): RepairAttempt {
    const attempt = this.requireAttempt(session, attemptId);
    if (attempt.status === "CAPTURED") return { ...attempt };
    if (!["HELD", "RUNNING"].includes(attempt.status)) throw new Error("Released repair cannot be captured");
    const output = this.requireAsset(session, outputAssetId);
    if (output.projectId !== attempt.projectId) throw new Error("Repair output must belong to the same project");
    requireReadyRole(output, "REPAIR_OUTPUT");
    const wallet = this.wallets.get(session.tenantId)!;
    wallet.held -= 1;
    wallet.captured += 1;
    const hold = this.holds.get(attempt.holdId)!;
    this.holds.set(hold.id, { ...hold, status: "CAPTURED", updatedAt: this.timestamp() });
    this.addLedger(session.tenantId, "CAPTURE", 0, attemptId, "修正版通过基础检查，正式扣除 1 次额度");
    const next: RepairAttempt = {
      ...attempt,
      outputAssetId,
      status: "CAPTURED",
      gateResult: "PASSED",
      ...(protection ? { protection: { ...protection }, gateVersion: `${attempt.gateVersion}+${protection.version}` } : {}),
      updatedAt: this.timestamp(),
    };
    this.attempts.set(attemptId, next);
    const project = this.getProject(session, attempt.projectId);
    this.projects.set(project.id, { ...project, status: "COMPLETED", repairedCount: project.repairedCount + 1, updatedAt: this.timestamp() });
    return { ...next };
  }

  releaseRepair(session: BetaSessionView, attemptId: string, reason: string, gateBlocked = false): RepairAttempt {
    const attempt = this.requireAttempt(session, attemptId);
    if (attempt.status === "RELEASED") return { ...attempt };
    if (attempt.status === "CAPTURED") throw new Error("Captured repair cannot be released without an adjustment");
    const wallet = this.wallets.get(session.tenantId)!;
    wallet.held -= 1;
    wallet.available += 1;
    const hold = this.holds.get(attempt.holdId)!;
    this.holds.set(hold.id, { ...hold, status: "RELEASED", updatedAt: this.timestamp() });
    this.addLedger(session.tenantId, "RELEASE", 1, attemptId, cleanText(reason, 200));
    const next: RepairAttempt = {
      ...attempt,
      status: "RELEASED",
      gateResult: gateBlocked ? "BLOCKED" : "PENDING",
      failureReason: cleanText(reason, 300),
      updatedAt: this.timestamp(),
    };
    this.attempts.set(attemptId, next);
    return { ...next };
  }

  createOutputAsset(
    session: BetaSessionView,
    input: { projectId: string; sourceFileName: string; mimeType: BetaAsset["mimeType"]; bytes: Uint8Array; width: number; height: number },
  ): Promise<BetaAsset> {
    const asset = this.createUploadIntent(session, {
      projectId: input.projectId,
      role: "REPAIR_OUTPUT",
      fileName: `修正版-${input.sourceFileName}`,
      mimeType: input.mimeType,
      byteSize: input.bytes.byteLength,
      width: input.width,
      height: input.height,
    });
    return this.putAsset(session, asset.id, input.bytes);
  }

  getRepairAttempt(session: BetaSessionView, attemptId: string): RepairAttempt {
    return { ...this.requireAttempt(session, attemptId) };
  }

  latestRepairForProject(session: BetaSessionView, projectId: string): RepairAttempt | null {
    this.getProject(session, projectId);
    const attempt = [...this.attempts.values()]
      .filter((entry) => entry.tenantId === session.tenantId && entry.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return attempt ? { ...attempt, issueRegion: { ...attempt.issueRegion }, lockedRegions: attempt.lockedRegions.map((region) => ({ ...region })) } : null;
  }

  cleanupExpiredAssets(): number {
    let deleted = 0;
    for (const asset of this.assets.values()) {
      if (asset.uploadStatus !== "DELETED" && Date.parse(asset.retentionUntil) <= this.now().getTime()) {
        this.assets.set(asset.id, { ...asset, uploadStatus: "DELETED" });
        this.assetBytes.delete(asset.id);
        deleted += 1;
      }
    }
    return deleted;
  }

  ledgerForTenant(session: BetaSessionView, tenantId = session.tenantId): readonly LedgerRecord[] {
    if (tenantId !== session.tenantId) requireInternalRole(session);
    return this.ledger.filter((entry) => entry.tenantId === tenantId).map((entry) => ({ ...entry }));
  }

  private addLedger(tenantId: string, type: CreditEntryType, amount: number, referenceId: string, reason: string): void {
    this.ledger.push({ id: `led_${crypto.randomUUID()}`, tenantId, type, amount, referenceId, reason, createdAt: this.timestamp() });
  }

  private requireAsset(session: BetaSessionView, assetId: string): BetaAsset {
    const asset = this.assets.get(assetId);
    if (!asset || asset.tenantId !== session.tenantId || asset.uploadStatus === "DELETED") {
      throw new CustomerVisibleError("ASSET_NOT_FOUND", "找不到这张图片。", 404, "返回当前 SKU，重新上传这张图片。");
    }
    return asset;
  }

  private requireBatch(session: BetaSessionView, batchId: string): ScreeningBatch {
    const batch = this.batches.get(batchId);
    if (!batch || batch.tenantId !== session.tenantId) {
      throw new CustomerVisibleError("FORBIDDEN", "找不到这个筛查批次。", 404, "返回项目首页后重新选择。");
    }
    return batch;
  }

  private findScreeningItem(session: BetaSessionView, itemId: string): { batch: ScreeningBatch; item: ScreeningItem } {
    for (const batch of this.batches.values()) {
      if (batch.tenantId !== session.tenantId) continue;
      const item = batch.items.find((candidate) => candidate.id === itemId);
      if (item) return { batch, item };
    }
    throw new CustomerVisibleError("FORBIDDEN", "找不到这张筛查图片。", 404, "返回筛查结果后重新选择。");
  }

  private requireAttempt(session: BetaSessionView, attemptId: string): RepairAttempt {
    const attempt = this.attempts.get(attemptId);
    if (!attempt || attempt.tenantId !== session.tenantId) {
      throw new CustomerVisibleError("FORBIDDEN", "找不到这个修图任务。", 404, "返回筛查结果后重新开始。");
    }
    return attempt;
  }
}

let betaService: BetaService | null = null;

export function getBetaService(): BetaService {
  betaService ??= process.env.VISIONQA_AGENT_LOCAL === "true" && process.env.NODE_ENV !== "production"
    ? createPersistentBetaService(localStateStore("beta")) : new BetaService();
  return betaService;
}

export function createPersistentBetaService(storage: StateStore): BetaService {
  const service = new BetaService({ storage });
  let storageFailed = false;
  const persist = () => {
    try { service.persistLocalState(); }
    catch (error) { storageFailed = true; throw error; }
  };
  // Preserve sync public APIs and persist async mutations before returning success.
  // Single-process local runtime only; not a substitute for production DB transactions.
  return new Proxy(service, { get(target, key) {
    const value = Reflect.get(target, key);
    if (typeof value !== "function" || key === "persistLocalState") return value;
    return (...args: unknown[]) => {
      if (storageFailed) throw new Error("Local storage failed; restart after restoring writable storage");
      const result = value.apply(target, args);
      if (typeof key === "string" && /^(get|list|read|resolve|latest|ledger|public)/.test(key)) return result;
      if (result instanceof Promise) return result.then(output => { persist(); return output; });
      persist();
      return result;
    };
  } });
}

export function createBetaServiceForTest(now?: () => Date): BetaService {
  return new BetaService({ now });
}

export function readHostedTestInviteTokens(env: NodeJS.ProcessEnv): string[] {
  const multiple = (env.VISIONQA_TEST_INVITE_TOKENS ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  const candidates = multiple.length > 0
    ? multiple
    : [env.VISIONQA_TEST_INVITE_TOKEN?.trim() ?? ""].filter(Boolean);
  return [...new Set(candidates)].slice(0, 20);
}

function assertCustomerBetaBackendReady(): void {
  if (process.env.NODE_ENV === "production" && process.env.VISIONQA_TEST_ENVIRONMENT !== "true") {
    throw new CustomerVisibleError(
      "SERVICE_NOT_READY",
      "客户内测服务正在完成正式数据存储配置，暂未开放。",
      503,
      "请等待内测管理员发送正式上线通知；当前不会创建账号、订单或扣除额度。",
    );
  }
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanText(value: string, max: number): string {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function integerBetween(value: number, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Value must be an integer between ${min} and ${max}`);
  return value;
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function normalizeRegion(region: { x: number; y: number; width: number; height: number }) {
  const clamp = (value: number) => Math.max(0, Math.min(1, Number(value) || 0));
  const x = clamp(region.x);
  const y = clamp(region.y);
  return {
    x,
    y,
    width: Math.max(0.01, Math.min(1 - x, clamp(region.width))),
    height: Math.max(0.01, Math.min(1 - y, clamp(region.height))),
  };
}

function requireReadyRole(asset: BetaAsset, role: BetaAsset["role"]): void {
  if (asset.uploadStatus !== "READY" || asset.role !== role) throw new Error(`Asset ${asset.id} is not a ready ${role}`);
}

function requireInternalRole(session: BetaSessionView): void {
  if (session.role !== "admin" && session.role !== "developer") {
    throw new CustomerVisibleError("FORBIDDEN", "当前账号没有开发者权限。", 403, "请使用开发者账号进入内部工作台。");
  }
}

function cloneBatch(batch: ScreeningBatch): ScreeningBatch {
  return {
    ...batch,
    truthAssetIds: [...batch.truthAssetIds],
    candidateAssetIds: [...batch.candidateAssetIds],
    items: batch.items.map((item) => ({
      ...item,
      issueRegion: item.issueRegion ? { ...item.issueRegion } : null,
    })),
  };
}

function cloneRepairEvolution(episode: RepairEvolutionEpisode): RepairEvolutionEpisode {
  return {
    ...episode,
    evidence: episode.evidence.map((entry) => ({ ...entry })),
    events: episode.events.map((entry) => ({ ...entry })),
  };
}
