export function createFixtureDependencies() {
  const jobStates = [];
  return {
    objectStorage: {
      provider: "memory",
      async head({ tenantId, objectKey }) {
        return {
          provider: "memory",
          region: "local",
          bucket: "fixture",
          objectKey,
          tenantId,
          mimeType: "image/jpeg",
          byteSize: 1024,
          sha256: "a".repeat(64),
        };
      },
      async presignGet({ objectKey }) {
        return {
          url: `https://fixture.invalid/${encodeURIComponent(objectKey)}`,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        };
      },
    },
    repository: {
      provider: "memory",
      jobStates,
      async persistEvaluation(input) {
        return {
          id: `eval_fixture_${input.assetId}`,
          created: true,
          resultVersion: 1,
        };
      },
      async recordJobState(state) {
        jobStates.push(structuredClone(state));
      },
    },
    visionProvider: {
      providerId: "fixture",
      async evaluate(input) {
        return {
          result: {
            schema_version: "0.3.0",
            model_evaluation: { status: "SUCCEEDED", observations: [] },
            score_evaluation: {
              status: "PARTIAL",
              overall_score: null,
              calibration_status: "UNCALIBRATED",
            },
            gate_evaluation: {
              status: "SUCCEEDED",
              decision: "REVIEW",
              reasons: ["FIXTURE_ONLY"],
            },
            action_plan: {
              repair_prompt: { text: "Fixture output; no paid model was called." },
              required_human_checks: ["Fixture mode requires human review."],
            },
          },
          provider: { providerId: "fixture", latencyMs: 0 },
          input,
        };
      },
    },
  };
}
