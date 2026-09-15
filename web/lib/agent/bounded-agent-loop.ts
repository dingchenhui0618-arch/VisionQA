import type { ProviderRequest, ProviderResult, ProviderRuntime } from "./provider-runtime.ts";
import type { CreditSettlement, CreditHold } from "./credit-settlement.ts";

export type AgentAction =
  | { kind: "text"; request: ProviderRequest }
  | { kind: "image"; request: ProviderRequest; confirmed: boolean; creditKey?: string }
  | { kind: "done"; value?: unknown };

export type AgentStepContext = { textSteps: number; imageCalls: number; attempts: number; lastResult: ProviderResult | null };
export type BoundedAgentLoopOptions = {
  runtime: ProviderRuntime;
  next: (context: AgentStepContext) => Promise<AgentAction> | AgentAction;
  maxTextSteps?: number;
  maxImageCalls?: number;
  maxAttempts?: number;
  credits?: CreditSettlement;
  defaultCreditKey?: string;
};
export type BoundedAgentLoopResult = {
  status: "DONE" | "LIMIT_REACHED" | "BLOCKED" | "FAILED";
  value?: unknown;
  results: ProviderResult[];
  textSteps: number;
  imageCalls: number;
  attempts: number;
  error?: string;
};

export async function runBoundedAgentLoop(options: BoundedAgentLoopOptions): Promise<BoundedAgentLoopResult> {
  const maxTextSteps = nonNegative(options.maxTextSteps, 8);
  const maxImageCalls = nonNegative(options.maxImageCalls, 1);
  const maxAttempts = nonNegative(options.maxAttempts, maxTextSteps + maxImageCalls);
  let textSteps = 0;
  let imageCalls = 0;
  let attempts = 0;
  let lastResult: ProviderResult | null = null;
  const results: ProviderResult[] = [];

  while (attempts < maxAttempts) {
    const action = await options.next({ textSteps, imageCalls, attempts, lastResult });
    if (action.kind === "done") return { status: "DONE", value: action.value, results, textSteps, imageCalls, attempts };
    if (action.kind === "text" && textSteps >= maxTextSteps) return limit(results, textSteps, imageCalls, attempts, "text step limit reached");
    if (action.kind === "image") {
      if (imageCalls >= maxImageCalls) return limit(results, textSteps, imageCalls, attempts, "image call limit reached");
      if (action.confirmed !== true || action.request.confirmed !== true) return { status: "BLOCKED", results, textSteps, imageCalls, attempts, error: "explicit confirmation is required before image generation" };
    }
    attempts += 1;
    let hold: CreditHold | null = null;
    if (action.kind === "image" && options.credits) {
      try { hold = options.credits.hold(action.creditKey ?? options.defaultCreditKey ?? action.request.idempotency); }
      catch (error) { return { status: "BLOCKED", results, textSteps, imageCalls, attempts, error: error instanceof Error ? error.message : "credit hold failed" }; }
    }
    const result = await options.runtime.dispatch(action.request);
    results.push(result);
    lastResult = result;
    if (action.kind === "text") textSteps += 1;
    else imageCalls += 1;
    if (hold) {
      if (result.ok) options.credits!.capture(hold.id);
      else options.credits!.release(hold.id);
    }
    if (!result.ok) return { status: "FAILED", results, textSteps, imageCalls, attempts, error: result.error.message };
  }
  return limit(results, textSteps, imageCalls, attempts, "attempt limit reached");
}

function nonNegative(value: number | undefined, fallback: number): number { return Number.isInteger(value) && value! >= 0 ? value! : fallback; }
function limit(results: ProviderResult[], textSteps: number, imageCalls: number, attempts: number, error: string): BoundedAgentLoopResult { return { status: "LIMIT_REACHED", results, textSteps, imageCalls, attempts, error }; }

export const runBoundedLoop = runBoundedAgentLoop;
