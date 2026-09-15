export const MOCK_COOKIE = "visionqa_mock_preview";
export function localMockEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.VISIONQA_AGENT_LOCAL === "true" && env.NODE_ENV !== "production";
}
