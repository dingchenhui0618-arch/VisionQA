export const RECURSIVE_REPAIR_SCHEMA_VERSION =
  "visionqa-recursive-repair-v0.1" as const;
export const RECURSIVE_REPAIR_MAX_ROUNDS = 3;

export type RepairEvolutionRole =
  | "ORCHESTRATOR"
  | "TRUTH_GUARDIAN"
  | "DIAGNOSIS"
  | "STRATEGY_REVIEW"
  | "REPAIR_EXECUTOR"
  | "QUALITY_REVIEW";

export type RepairEvolutionStatus =
  | "PLANNING"
  | "READY_TO_EXECUTE"
  | "WAITING_FOR_RESULT"
  | "WAITING_FOR_HUMAN"
  | "COMPLETED"
  | "STOPPED";

export type RepairEvolutionStopReason =
  | "CUSTOMER_ACCEPTED"
  | "NO_NEW_EVIDENCE"
  | "MAX_ROUNDS"
  | "HUMAN_ESCALATION"
  | "POLICY_BLOCKED"
  | "TECHNICAL_FAILURE";

export type RepairEvolutionEvent = {
  id: string;
  role: RepairEvolutionRole;
  status: "INFO" | "ACTION_REQUIRED" | "SUCCEEDED" | "BLOCKED";
  /** Safe for the customer UI. Never contains chain-of-thought or provider payloads. */
  publicSummary: string;
  /** Developer-facing, structured and bounded. Never contains secrets, image URLs or raw payloads. */
  internalCode: string;
  round: number;
  createdAt: string;
};

export type RepairEvolutionEvidence = {
  fingerprint: string;
  kind:
    | "SKU_FACT"
    | "VISIBLE_ISSUE"
    | "CUSTOMER_CORRECTION"
    | "GATE_RESULT"
    | "HUMAN_REVIEW"
    | "FAILURE_CLASS";
  summary: string;
  verifiedBy: "SYSTEM" | "HUMAN";
};

export type RepairEvolutionEpisode = {
  schemaVersion: typeof RECURSIVE_REPAIR_SCHEMA_VERSION;
  id: string;
  projectId: string;
  repairAttemptId: string;
  status: RepairEvolutionStatus;
  round: number;
  evidence: RepairEvolutionEvidence[];
  events: RepairEvolutionEvent[];
  selectedRoute: string | null;
  stopReason: RepairEvolutionStopReason | null;
  humanFinalReviewRequired: true;
  createdAt: string;
  updatedAt: string;
};

export type RepairPlannerDecision = {
  action: "ROUTE" | "REFINE" | "STOP" | "ESCALATE";
  routeId: string | null;
  publicSummary: string;
  strategyRevision: string | null;
  evidenceFingerprints: string[];
};

export type ExperiencePromotionInput = {
  gatePassed: boolean;
  humanConfirmed: boolean;
  customerOutcome: "ACCEPTED" | "DOWNLOADED" | "REJECTED" | "UNKNOWN";
  sourceEvidenceFingerprints: string[];
};

export function createRepairEvolutionEpisode(input: {
  projectId: string;
  repairAttemptId: string;
  now?: string;
  id?: string;
}): RepairEvolutionEpisode {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: RECURSIVE_REPAIR_SCHEMA_VERSION,
    id: input.id ?? `evo_${crypto.randomUUID()}`,
    projectId: input.projectId,
    repairAttemptId: input.repairAttemptId,
    status: "PLANNING",
    round: 1,
    evidence: [],
    events: [],
    selectedRoute: null,
    stopReason: null,
    humanFinalReviewRequired: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function addEvolutionEvidence(
  episode: RepairEvolutionEpisode,
  evidence: RepairEvolutionEvidence[],
  now = new Date().toISOString(),
): RepairEvolutionEpisode {
  const known = new Set(episode.evidence.map((entry) => entry.fingerprint));
  const additions = evidence.filter((entry) => !known.has(entry.fingerprint));
  return { ...episode, evidence: [...episode.evidence, ...additions], updatedAt: now };
}

export function applyPlannerDecision(
  episode: RepairEvolutionEpisode,
  decision: RepairPlannerDecision,
  allowedRouteIds: readonly string[],
  now = new Date().toISOString(),
): RepairEvolutionEpisode {
  const referencedEvidence = new Set(decision.evidenceFingerprints);
  const knownEvidence = new Set(episode.evidence.map((entry) => entry.fingerprint));
  if ([...referencedEvidence].some((fingerprint) => !knownEvidence.has(fingerprint))) {
    return stopEpisode(episode, "POLICY_BLOCKED", "规划引用了不存在的证据，已停止自动执行。", now);
  }
  if (decision.action === "ROUTE") {
    if (!decision.routeId || !allowedRouteIds.includes(decision.routeId)) {
      return stopEpisode(episode, "POLICY_BLOCKED", "规划选择了未获准的修图路线，已转人工处理。", now);
    }
    return appendEvent({
      ...episode,
      status: "READY_TO_EXECUTE",
      selectedRoute: decision.routeId,
      updatedAt: now,
    }, "ORCHESTRATOR", "ACTION_REQUIRED", cleanPublicSummary(decision.publicSummary), "ROUTE_APPROVED", now);
  }
  if (decision.action === "ESCALATE") {
    return stopEpisode(episode, "HUMAN_ESCALATION", cleanPublicSummary(decision.publicSummary), now);
  }
  if (decision.action === "STOP") {
    return stopEpisode(episode, "NO_NEW_EVIDENCE", cleanPublicSummary(decision.publicSummary), now);
  }
  if (!decision.strategyRevision?.trim() || decision.evidenceFingerprints.length === 0) {
    return stopEpisode(episode, "NO_NEW_EVIDENCE", "没有形成新的证据或处理策略，已停止重复尝试。", now);
  }
  if (episode.round >= RECURSIVE_REPAIR_MAX_ROUNDS) {
    return stopEpisode(episode, "MAX_ROUNDS", "已达到安全尝试上限，转由人工判断下一步。", now);
  }
  return appendEvent({
    ...episode,
    status: "PLANNING",
    round: episode.round + 1,
    selectedRoute: null,
    updatedAt: now,
  }, "STRATEGY_REVIEW", "INFO", cleanPublicSummary(decision.publicSummary), "STRATEGY_REFINED", now);
}

export function canPromoteSuccessfulExperience(input: ExperiencePromotionInput): boolean {
  return input.gatePassed &&
    input.humanConfirmed &&
    (input.customerOutcome === "ACCEPTED" || input.customerOutcome === "DOWNLOADED") &&
    input.sourceEvidenceFingerprints.length > 0;
}

export function publicEvolutionEvents(episode: RepairEvolutionEpisode) {
  return episode.events.map(({ id, role, status, publicSummary, round, createdAt }) => ({
    id,
    role_label: publicRoleLabel(role),
    status,
    summary: publicSummary,
    round,
    created_at: createdAt,
  }));
}

function stopEpisode(
  episode: RepairEvolutionEpisode,
  reason: RepairEvolutionStopReason,
  summary: string,
  now: string,
): RepairEvolutionEpisode {
  return appendEvent({
    ...episode,
    status: reason === "CUSTOMER_ACCEPTED" ? "COMPLETED" : "STOPPED",
    stopReason: reason,
    updatedAt: now,
  }, "ORCHESTRATOR", reason === "CUSTOMER_ACCEPTED" ? "SUCCEEDED" : "BLOCKED", cleanPublicSummary(summary), reason, now);
}

function appendEvent(
  episode: RepairEvolutionEpisode,
  role: RepairEvolutionRole,
  status: RepairEvolutionEvent["status"],
  publicSummary: string,
  internalCode: string,
  now: string,
): RepairEvolutionEpisode {
  return {
    ...episode,
    events: [...episode.events, {
      id: `evt_${crypto.randomUUID()}`,
      role,
      status,
      publicSummary,
      internalCode,
      round: episode.round,
      createdAt: now,
    }],
  };
}

function cleanPublicSummary(value: string): string {
  const summary = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 180);
  return summary || "当前步骤没有形成可执行结论，已转人工处理。";
}

function publicRoleLabel(role: RepairEvolutionRole): string {
  return {
    ORCHESTRATOR: "任务协调",
    TRUTH_GUARDIAN: "商品核对",
    DIAGNOSIS: "问题定位",
    STRATEGY_REVIEW: "方案评审",
    REPAIR_EXECUTOR: "修正执行",
    QUALITY_REVIEW: "质量复验",
  }[role];
}
