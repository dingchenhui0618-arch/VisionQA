export const MOCK_COOKIE = "visionqa_mock_preview";

/**
 * The local server and the deterministic preview are separate concerns.
 * VISIONQA_AGENT_LOCAL enables local persistence/auth plumbing; the mock UI is
 * opt-in so a local run exercises the real AgentWorkspace by default.
 */
export function localMockEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.VISIONQA_AGENT_LOCAL === "true" && env.VISIONQA_AGENT_MOCK === "true" && env.NODE_ENV !== "production";
}

export function localAgentEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.VISIONQA_AGENT_LOCAL === "true" && env.NODE_ENV !== "production";
}
