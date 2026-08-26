export const LIVE_EVALUATION_ATTEMPT_TIMEOUT_MS = 180_000;
export const LIVE_EVALUATION_MAX_COMPLETION_TOKENS = 2_400;

export type LiveEvaluationAttemptStatus =
  | "RUNNING"
  | "SUCCEEDED"
  | "TIMEOUT"
  | "FAILED";

export type LiveEvaluationAttemptRecord = {
  requestId: string;
  status: LiveEvaluationAttemptStatus;
  startedAt: string;
  finishedAt: string | null;
  elapsedMs: number | null;
  errorCode: string | null;
  retryable: boolean;
  providerRequestId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};
