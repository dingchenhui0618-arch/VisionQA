export const DECISIONS = new Set(["PASS", "REVIEW", "REJECT"]);
export const ASSET_ROLES = new Set(["CANDIDATE", "REFERENCE"]);

export type EvaluationResultV02 = {
  schema_version: "0.2.0";
  run: {
    run_id: string;
    created_at: string;
    model_snapshot: string;
    prompt_version: string;
    taxonomy_version: string;
    score_policy_version: string;
    threshold_policy_version: string;
    gate_policy_version: string;
    provider_adapter_version?: string;
  };
  input: {
    asset_id: string;
    asset_sha256: string;
    scenario: "fashion_ecommerce_ai_model_image";
    reference_asset_ids: string[];
    locked_attributes: string[];
  };
  model_evaluation: {
    status: string;
    observations: unknown[];
    warnings: string[];
  };
  score_evaluation: {
    status: string;
    calibration_status: string;
    skill_scores: Record<string, unknown>;
    overall_score: number | null;
    score_band: string | null;
    commercial_assessment: unknown;
  };
  gate_evaluation: {
    status: string;
    decision: "PASS" | "REVIEW" | "REJECT" | null;
    decision_reason: string;
    gate_hits: unknown[];
  };
  action_plan: {
    repair_prompt: unknown | null;
    required_human_checks: string[];
  };
  performance: {
    latency_ms: number;
    attempt_count: number;
    cost_status: string;
    cost_amount?: number | null;
    cost_currency?: string | null;
  };
  scope: unknown;
};

export type ContractIssue = { path: string; message: string };
export type PersistedEvaluationResult =
  | EvaluationResultV02
  | EvaluationResultV03;

export type EvaluationExecutionMetadata = {
  run_id: string;
  created_at: string;
  model_snapshot: string;
  prompt_version: string;
  taxonomy_version: string;
  score_policy_version: string;
  threshold_policy_version: string;
  gate_policy_version: string;
  provider_adapter_version?: string;
  asset_id: string;
  asset_sha256: string;
  locked_attributes: string[];
  latency_ms: number;
  cost_amount?: number | null;
  cost_currency?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateEvaluationEnvelope(
  value: unknown,
): ContractIssue[] {
  const issues: ContractIssue[] = [];
  if (!isRecord(value)) {
    return [{ path: "$", message: "必须是对象" }];
  }

  if (value.schema_version === "0.3.0") {
    const validation = validateEvaluationResultV03(value);
    return validation.errors.map((message) => ({ path: "$", message }));
  }

  if (value.schema_version !== "0.2.0") {
    issues.push({ path: "$.schema_version", message: "必须为 0.2.0" });
  }

  for (const key of [
    "run",
    "input",
    "scope",
    "model_evaluation",
    "score_evaluation",
    "gate_evaluation",
    "action_plan",
    "performance",
  ]) {
    if (!isRecord(value[key])) {
      issues.push({ path: `$.${key}`, message: "缺少必需对象" });
    }
  }

  const run = isRecord(value.run) ? value.run : {};
  const input = isRecord(value.input) ? value.input : {};
  const gate = isRecord(value.gate_evaluation)
    ? value.gate_evaluation
    : {};
  const performance = isRecord(value.performance) ? value.performance : {};

  for (const key of [
    "run_id",
    "model_snapshot",
    "prompt_version",
    "taxonomy_version",
    "score_policy_version",
    "threshold_policy_version",
    "gate_policy_version",
  ]) {
    if (typeof run[key] !== "string" || !run[key]) {
      issues.push({ path: `$.run.${key}`, message: "缺少非空字符串" });
    }
  }

  if (typeof input.asset_id !== "string" || !input.asset_id) {
    issues.push({ path: "$.input.asset_id", message: "缺少素材 ID" });
  }
  if (
    typeof input.asset_sha256 !== "string" ||
    !/^[a-fA-F0-9]{64}$/.test(input.asset_sha256)
  ) {
    issues.push({
      path: "$.input.asset_sha256",
      message: "必须是 64 位 SHA-256",
    });
  }
  if (
    gate.decision !== null &&
    (typeof gate.decision !== "string" || !DECISIONS.has(gate.decision))
  ) {
    issues.push({
      path: "$.gate_evaluation.decision",
      message: "必须为 PASS、REVIEW、REJECT 或 null",
    });
  }
  if (
    typeof performance.latency_ms !== "number" ||
    !Number.isInteger(performance.latency_ms) ||
    performance.latency_ms < 0
  ) {
    issues.push({
      path: "$.performance.latency_ms",
      message: "必须是非负整数",
    });
  }

  return issues;
}

export function executionMetadataFromRequest(
  result: PersistedEvaluationResult,
  supplied: unknown,
): { metadata: EvaluationExecutionMetadata | null; issues: ContractIssue[] } {
  if (result.schema_version === "0.2.0") {
    return {
      metadata: {
        ...result.run,
        asset_id: result.input.asset_id,
        asset_sha256: result.input.asset_sha256,
        locked_attributes: result.input.locked_attributes,
        latency_ms: result.performance.latency_ms,
        cost_amount: result.performance.cost_amount ?? null,
        cost_currency: result.performance.cost_currency ?? null,
      },
      issues: [],
    };
  }

  if (!isRecord(supplied)) {
    return {
      metadata: null,
      issues: [
        {
          path: "$.execution",
          message: "v0.3 持久化必须提供独立执行元数据",
        },
      ],
    };
  }
  const requiredStrings = [
    "run_id",
    "created_at",
    "model_snapshot",
    "prompt_version",
    "taxonomy_version",
    "score_policy_version",
    "threshold_policy_version",
    "gate_policy_version",
    "asset_id",
    "asset_sha256",
  ] as const;
  const issues: ContractIssue[] = [];
  for (const key of requiredStrings) {
    if (typeof supplied[key] !== "string" || !supplied[key]) {
      issues.push({
        path: `$.execution.${key}`,
        message: "缺少非空字符串",
      });
    }
  }
  if (
    typeof supplied.asset_sha256 !== "string" ||
    !/^[a-fA-F0-9]{64}$/.test(supplied.asset_sha256)
  ) {
    issues.push({
      path: "$.execution.asset_sha256",
      message: "必须是 64 位 SHA-256",
    });
  }
  if (!Array.isArray(supplied.locked_attributes)) {
    issues.push({
      path: "$.execution.locked_attributes",
      message: "必须是字符串数组",
    });
  }
  if (
    typeof supplied.latency_ms !== "number" ||
    !Number.isInteger(supplied.latency_ms) ||
    supplied.latency_ms < 0
  ) {
    issues.push({
      path: "$.execution.latency_ms",
      message: "必须是非负整数",
    });
  }
  if (issues.length) return { metadata: null, issues };

  return {
    metadata: {
      run_id: supplied.run_id as string,
      created_at: supplied.created_at as string,
      model_snapshot: supplied.model_snapshot as string,
      prompt_version: supplied.prompt_version as string,
      taxonomy_version: supplied.taxonomy_version as string,
      score_policy_version: supplied.score_policy_version as string,
      threshold_policy_version: supplied.threshold_policy_version as string,
      gate_policy_version: supplied.gate_policy_version as string,
      provider_adapter_version:
        typeof supplied.provider_adapter_version === "string"
          ? supplied.provider_adapter_version
          : undefined,
      asset_id: supplied.asset_id as string,
      asset_sha256: supplied.asset_sha256 as string,
      locked_attributes: (supplied.locked_attributes as unknown[]).filter(
        (item): item is string => typeof item === "string" && Boolean(item),
      ),
      latency_ms: supplied.latency_ms as number,
      cost_amount:
        typeof supplied.cost_amount === "number"
          ? supplied.cost_amount
          : null,
      cost_currency:
        typeof supplied.cost_currency === "string"
          ? supplied.cost_currency
          : null,
    },
    issues: [],
  };
}

export function requiredIdempotencyKey(request: Request): string | null {
  const value = request.headers.get("idempotency-key")?.trim();
  return value && value.length <= 200 ? value : null;
}

export function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function stableError(
  code: string,
  message: string,
  requestId: string,
  status: number,
  retryable = false,
  details?: unknown,
): Response {
  return Response.json(
    {
      error: {
        code,
        message,
        request_id: requestId,
        retryable,
        ...(details === undefined ? {} : { details }),
      },
    },
    { status },
  );
}

export function isDatabaseUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("D1 binding `DB` is unavailable") ||
    message.includes("no such table")
  );
}
import {
  validateEvaluationResultV03,
  type EvaluationResultV03,
} from "../visionqa/contracts.ts";
