import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createFixtureDraft,
  FixtureVisionAdapter,
} from "../lib/visionqa/providers/fixture.ts";
import {
  createLocalCanaryQwenAdapter,
  getLocalCanaryReadiness,
} from "../lib/visionqa/providers/local-canary.ts";
import {
  createVisionProviderFromEnv,
  QWEN_BAILIAN_MODEL_SNAPSHOT,
} from "../lib/visionqa/providers/factory.ts";
import { orchestrateVisionEvaluation } from "../lib/visionqa/providers/orchestrator.ts";
import { signPrivateImageEnvelope } from "../lib/visionqa/providers/private-image-envelope.ts";
import {
  buildQwenCompatibleRequestBody,
  classifyQwenBusinessError,
  createGovernedQwenBailianAdapter,
  parseQwenObservationDraft,
} from "../lib/visionqa/providers/qwen.ts";
import { assertProviderImages } from "../lib/visionqa/providers/image-preflight.ts";
import {
  QWEN_BAILIAN_DEFINITION,
  QWEN_BAILIAN_PROVIDER_ID,
  QWEN_CANARY_APPROVAL,
} from "../lib/visionqa/providers/registry.ts";
import {
  VisionProviderError,
  evaluateWithRetry,
  type ProviderEvaluationInput,
  type VisionProviderAdapter,
} from "../lib/visionqa/providers/types.ts";

const input: ProviderEvaluationInput = {
  requestId: "req-test",
  runId: "run-test",
  assetId: "asset-test",
  scene: "服饰电商 AI 模特商品图质检",
  placement: "天猫平台促销主图",
  candidate: { url: "data:image/png;base64,fixture", role: "candidate" },
  references: [],
  lockedAttributes: ["颜色", "版型"],
  taxonomyVersion: "taxonomy-0.2.0",
  commercialTemplate: {
    id: "platform_promotion_main_image",
    version: "0.2.0",
    assessmentScope: "仅评估平台促销主图贴合度。",
  },
  promptVersion: "vision-observer-0.1.0",
};

const IMAGE_ENVELOPE_SECRET = "test-only-private-image-hmac-secret";
const TEST_PROVIDER_DEFINITION = Object.freeze({
  ...QWEN_BAILIAN_DEFINITION,
  imageHosts: Object.freeze([
    "visionqa-test-assets.oss-cn-beijing.aliyuncs.com",
  ]),
});

const qwenGovernanceEnv = {
  VISION_PROVIDER: QWEN_BAILIAN_PROVIDER_ID,
  QWEN_PROVIDER_APPROVED: "true",
  VISION_PROVIDER_APPROVED: QWEN_BAILIAN_PROVIDER_ID,
  VISION_LIVE_PROVIDER_ENABLED: "true",
  VISION_PAID_CALLS_ENABLED: "true",
  VISION_DATA_PROCESSING_APPROVED: "true",
  VISION_ENVIRONMENT: "staging",
  VISION_STAGING_READY: "true",
  STAGING_ALIYUN_OSS_PG_ACCEPTED: "true",
  DATASET_RIGHTS_ALLOWLIST_MATCH: "true",
  MAINLAND_PROCESSING_EVIDENCE: "true",
  NO_TRAINING_WRITTEN_EVIDENCE: "true",
  RETENTION_DAYS_AND_SCOPE_CONFIRMED: "true",
  CONTENT_REVIEW_AND_HUMAN_ACCESS_CONFIRMED: "true",
  DELETION_AND_BACKUP_SLA_CONFIRMED: "true",
  PRIVATE_OR_TENANT_ISOLATED_PATH_CONFIRMED: "true",
  LOG_BACKFLOW_DISABLED: "true",
  SECRET_MANAGER_CONFIGURED: "true",
  IP_AND_MODEL_ALLOWLIST_CONFIGURED: "true",
  COST_HARD_STOP_TESTED: "true",
  VISION_PRIVATE_IMAGE_URLS_CONFIRMED: "true",
  VISION_STORE_FALSE_CONFIRMED: "true",
  VISION_ZDR_CONFIRMED: "true",
  VISION_DELETE_SLA_CONFIRMED: "true",
  VISION_HUMAN_FINAL_REVIEW_REQUIRED: "true",
  EXPLICIT_RUN_APPROVAL: "true",
  VISION_RUN_APPROVAL_ARTIFACT_PATH:
    QWEN_CANARY_APPROVAL.artifactPath,
  VISION_RUN_APPROVAL_ARTIFACT_ID:
    QWEN_CANARY_APPROVAL.artifactId,
  VISION_RUN_APPROVAL_ARTIFACT_SHA256:
    QWEN_CANARY_APPROVAL.artifactSha256,
  VISION_RUN_APPROVAL_DECISION_IDS:
    QWEN_CANARY_APPROVAL.decisionIds,
  CANARY_MANIFEST_ID: QWEN_CANARY_APPROVAL.manifestId,
  CANARY_MANIFEST_SHA256: QWEN_CANARY_APPROVAL.manifestSha256,
  VISION_MODEL: QWEN_BAILIAN_MODEL_SNAPSHOT,
  VISION_BUDGET_CURRENCY: "CNY",
  VISION_BUDGET_LIMIT_MINOR_UNITS: "2000",
  VISION_ESTIMATED_BATCH_COST_MINOR_UNITS: "100",
  VISION_BATCH_SIZE: "5",
  VISION_MAX_TOTAL_REQUESTS: "15",
  VISION_MAX_CONCURRENCY: "1",
  VISION_CN_ALIYUN_BAILIAN_API_KEY: "fake-qwen-key-must-not-appear",
  VISION_PRIVATE_IMAGE_ENVELOPE_HMAC_SECRET: IMAGE_ENVELOPE_SECRET,
} as const;

const localCanaryEnv = {
  VISION_LOCAL_CANARY_ENABLED: "true",
  VISION_PAID_CALLS_ENABLED: "true",
  VISION_DATA_PROCESSING_APPROVED: "true",
  EXPLICIT_RUN_APPROVAL: "true",
  VISION_MODEL: QWEN_BAILIAN_MODEL_SNAPSHOT,
  VISION_BUDGET_CURRENCY: "CNY",
  VISION_BUDGET_LIMIT_MINOR_UNITS: "2000",
  VISION_LOCAL_CANARY_MAX_TOTAL_REQUESTS: "10",
  VISION_MAX_CONCURRENCY: "1",
  DASHSCOPE_API_KEY: "fake-local-canary-key-must-not-appear",
} as const;

async function createLiveInput(
  options: { byteSize?: number; expiresAt?: string } = {},
): Promise<ProviderEvaluationInput> {
  const candidate = await signPrivateImageEnvelope({
    image: {
      url: "https://visionqa-test-assets.oss-cn-beijing.aliyuncs.com/canary/candidate.png?token=redacted",
      role: "candidate",
      mimeType: "image/png",
      access: "short_lived_private",
      expiresAt:
        options.expiresAt ??
        new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
    assetSha256:
      "9578b020316332cb017dd107559b3f862a75285041a536ee96632640c3202406",
    byteSize: options.byteSize ?? 298_477,
    nonce: "test_nonce_123456",
    secret: IMAGE_ENVELOPE_SECRET,
  });
  return {
    ...input,
    candidate,
  };
}

const COMMON_MOJIBAKE =
  /\uFFFD|浣犳|鐨|鍟|璇勪|璇佹嵁|妯″|鍥剧|浜哄伐|锛|銆|绂佹|缁撴灉|榛樿/;

test("VisionQA TypeScript runtime sources contain no known mojibake markers", () => {
  const visionqaRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "lib",
    "visionqa",
  );
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      if (entry.isFile() && entry.name.endsWith(".ts")) {
        assert.doesNotMatch(
          readFileSync(path, "utf8"),
          COMMON_MOJIBAKE,
          `mojibake marker found in ${path}`,
        );
      }
    }
  };
  visit(visionqaRoot);
});

test("fixture remains the network-free default and derives deterministic v0.3", async () => {
  const adapter = createVisionProviderFromEnv({});
  assert.equal(adapter.providerId, "fixture");
  const outcome = await orchestrateVisionEvaluation(
    adapter,
    input,
    new AbortController().signal,
  );
  assert.equal(outcome.result.schema_version, "0.3.0");
  assert.equal(outcome.result.score_evaluation.overall_score, 81.7);
  assert.equal(outcome.result.gate_evaluation.decision, "REVIEW");
});

test("AI model image repair never rejects a draft merely for missing promotion overlays", async () => {
  const draft = createFixtureDraft();
  draft.observations = [
    {
      observation_id: "obs-missing-promotion",
      issue_code: "no_promotion_overlay",
      primary_skill: "COM",
      severity: "blocker",
      status: "detected",
      observation: "画面中没有价格、优惠或 CTA。",
      impact: "旧促销模板会错误阻断模特母图。",
    },
  ];
  draft.commercialAssessment.metrics.promotion_hierarchy = {
    score: null,
    assessability: "NOT_APPLICABLE",
    evidence: [],
    summary: "模特母图不承担促销表达。",
  };
  draft.commercialAssessment.metrics.information_legibility = {
    score: null,
    assessability: "NOT_APPLICABLE",
    evidence: [],
    summary: "当前没有需要评估的商业贴字。",
  };
  const adapter: VisionProviderAdapter = {
    providerId: "test-model-image-repair",
    adapterVersion: "0.1",
    async evaluate() {
      return {
        providerId: this.providerId,
        adapterVersion: this.adapterVersion,
        modelSnapshot: "test-snapshot",
        providerRequestId: null,
        latencyMs: 1,
        usage: { inputTokens: null, outputTokens: null },
        warnings: [],
        observationDraft: draft,
      };
    },
  };
  const outcome = await orchestrateVisionEvaluation(
    adapter,
    {
      ...input,
      placement: "AI 模特母图",
      commercialTemplate: {
        id: "ai_model_image_repair",
        version: "0.3.0",
        assessmentScope: "缺少促销信息不是缺陷。",
      },
    },
    new AbortController().signal,
  );
  assert.equal(outcome.result.model_evaluation.observations.length, 0);
  assert.equal(
    outcome.result.score_evaluation.commercial_assessment.metrics
      .promotion_hierarchy.assessability,
    "NOT_APPLICABLE",
  );
  assert.notEqual(outcome.result.gate_evaluation.decision, "REJECT");
  assert.doesNotMatch(
    outcome.result.action_plan.repair_prompt?.prompt ?? "",
    /促销|优惠|CTA/,
  );
});

test("local Base64 canary stays disabled until every explicit gate and API key exist", () => {
  let fetchCalls = 0;
  const readiness = getLocalCanaryReadiness({
    ...localCanaryEnv,
    DASHSCOPE_API_KEY: undefined,
  });
  assert.equal(readiness.configured, false);
  assert.ok(readiness.missing.includes("DASHSCOPE_API_KEY"));
  assert.throws(
    () =>
      createLocalCanaryQwenAdapter(
        {
          ...localCanaryEnv,
          DASHSCOPE_API_KEY: undefined,
        },
        {
          fetchImpl: async () => {
            fetchCalls += 1;
            return new Response();
          },
        },
      ),
    (error: unknown) =>
      error instanceof VisionProviderError &&
      error.code === "CONFIGURATION" &&
      !error.message.includes("fake-local-canary-key"),
  );
  assert.equal(fetchCalls, 0);
});

test("local Base64 canary sends the candidate and approved references to the fixed Qwen snapshot", async () => {
  let fetchCalls = 0;
  const adapter = createLocalCanaryQwenAdapter(localCanaryEnv, {
    fetchImpl: async (url, init) => {
      fetchCalls += 1;
      assert.equal(url, QWEN_BAILIAN_DEFINITION.endpoint);
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        `Bearer ${localCanaryEnv.DASHSCOPE_API_KEY}`,
      );
      const body = JSON.parse(String(init?.body)) as {
        model: string;
        messages: Array<{
          content: Array<{
            type: string;
            image_url?: { url?: string };
          }>;
        }>;
      };
      assert.equal(body.model, QWEN_BAILIAN_MODEL_SNAPSHOT);
      assert.ok(
        body.messages[0].content.some(
          (item) =>
            item.type === "image_url" &&
            item.image_url?.url === "data:image/png;base64,ZmFrZQ==",
        ),
      );
      const images = body.messages[0].content.filter((item) => item.type === "image_url");
      assert.equal(images.length, 2);
      assert.equal(images[1].image_url?.url, "data:image/png;base64,cmVm");
      assert.equal(JSON.stringify(body).includes(localCanaryEnv.DASHSCOPE_API_KEY), false);
      return new Response(
        JSON.stringify({
          id: "qwen-request-test",
          model: QWEN_BAILIAN_MODEL_SNAPSHOT,
          choices: [
            {
              message: {
                content: JSON.stringify(createFixtureDraft()),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });
  const outcome = await orchestrateVisionEvaluation(
    adapter,
    {
      ...input,
      candidate: {
        role: "candidate",
        mimeType: "image/png",
        url: "data:image/png;base64,ZmFrZQ==",
      },
      references: [{
        role: "reference",
        mimeType: "image/png",
        url: "data:image/png;base64,cmVm",
      }],
    },
    new AbortController().signal,
  );
  assert.equal(fetchCalls, 1);
  assert.equal(outcome.provider.modelSnapshot, QWEN_BAILIAN_MODEL_SNAPSHOT);
  assert.equal(outcome.provider.providerRequestId, "qwen-request-test");
  assert.equal(outcome.result.schema_version, "0.3.0");
  assert.equal(outcome.result.gate_evaluation.decision, "REVIEW");
});

test("legacy OpenAI variables can never activate network", () => {
  let fetchCalls = 0;
  assert.throws(
    () =>
      createVisionProviderFromEnv(
        {
          VISION_PROVIDER: "openai",
          VISION_PROVIDER_APPROVED: "openai",
          VISION_PAID_CALLS_ENABLED: "true",
          VISION_DATA_PROCESSING_APPROVED: "true",
          VISION_ENVIRONMENT: "staging",
          VISION_STAGING_READY: "true",
          VISION_MODEL: "gpt-4o-2024-11-20",
          OPENAI_API_KEY: "legacy-secret",
        },
        {
          fetchImpl: async () => {
            fetchCalls += 1;
            return new Response();
          },
        },
      ),
    (error: unknown) =>
      error instanceof VisionProviderError &&
      error.code === "CONFIGURATION" &&
      !error.message.includes("legacy-secret"),
  );
  assert.equal(fetchCalls, 0);
});

test("every Qwen approval, evidence, secret, model and cost gate fails before fetch", () => {
  let fetchCalls = 0;
  const required = [
    "QWEN_PROVIDER_APPROVED",
    "VISION_PROVIDER_APPROVED",
    "VISION_LIVE_PROVIDER_ENABLED",
    "VISION_PAID_CALLS_ENABLED",
    "VISION_DATA_PROCESSING_APPROVED",
    "VISION_ENVIRONMENT",
    "VISION_STAGING_READY",
    "STAGING_ALIYUN_OSS_PG_ACCEPTED",
    "DATASET_RIGHTS_ALLOWLIST_MATCH",
    "MAINLAND_PROCESSING_EVIDENCE",
    "NO_TRAINING_WRITTEN_EVIDENCE",
    "RETENTION_DAYS_AND_SCOPE_CONFIRMED",
    "CONTENT_REVIEW_AND_HUMAN_ACCESS_CONFIRMED",
    "DELETION_AND_BACKUP_SLA_CONFIRMED",
    "PRIVATE_OR_TENANT_ISOLATED_PATH_CONFIRMED",
    "LOG_BACKFLOW_DISABLED",
    "SECRET_MANAGER_CONFIGURED",
    "IP_AND_MODEL_ALLOWLIST_CONFIGURED",
    "COST_HARD_STOP_TESTED",
    "VISION_PRIVATE_IMAGE_URLS_CONFIRMED",
    "VISION_STORE_FALSE_CONFIRMED",
    "VISION_ZDR_CONFIRMED",
    "VISION_DELETE_SLA_CONFIRMED",
    "VISION_HUMAN_FINAL_REVIEW_REQUIRED",
    "EXPLICIT_RUN_APPROVAL",
    "VISION_RUN_APPROVAL_ARTIFACT_PATH",
    "VISION_RUN_APPROVAL_ARTIFACT_ID",
    "VISION_RUN_APPROVAL_ARTIFACT_SHA256",
    "VISION_RUN_APPROVAL_DECISION_IDS",
    "CANARY_MANIFEST_ID",
    "CANARY_MANIFEST_SHA256",
    "VISION_MODEL",
    "VISION_BUDGET_CURRENCY",
    "VISION_BUDGET_LIMIT_MINOR_UNITS",
    "VISION_ESTIMATED_BATCH_COST_MINOR_UNITS",
    "VISION_BATCH_SIZE",
    "VISION_MAX_TOTAL_REQUESTS",
    "VISION_MAX_CONCURRENCY",
    "VISION_CN_ALIYUN_BAILIAN_API_KEY",
    "VISION_PRIVATE_IMAGE_ENVELOPE_HMAC_SECRET",
  ] as const;

  for (const missing of required) {
    const env: Record<string, string | undefined> = {
      ...qwenGovernanceEnv,
      [missing]: undefined,
    };
    assert.throws(
      () =>
        createVisionProviderFromEnv(env, {
          fetchImpl: async () => {
            fetchCalls += 1;
            return new Response();
          },
        }),
      (error: unknown) =>
        error instanceof VisionProviderError &&
        error.code === "CONFIGURATION" &&
        !error.message.includes("fake-qwen-key"),
      missing,
    );
  }
  assert.equal(fetchCalls, 0);
});

test("Qwen approval artifact, model and exact canary scope are immutable hard gates", () => {
  for (const env of [
    {
      ...qwenGovernanceEnv,
      VISION_RUN_APPROVAL_ARTIFACT_PATH: "handoffs/other.csv",
    },
    {
      ...qwenGovernanceEnv,
      VISION_RUN_APPROVAL_ARTIFACT_SHA256: "0".repeat(64),
    },
    {
      ...qwenGovernanceEnv,
      VISION_RUN_APPROVAL_DECISION_IDS: "DOMESTIC-QWEN-001",
    },
    { ...qwenGovernanceEnv, CANARY_MANIFEST_ID: "other-manifest" },
    { ...qwenGovernanceEnv, CANARY_MANIFEST_SHA256: "f".repeat(64) },
    { ...qwenGovernanceEnv, VISION_MODEL: "qwen3-vl-plus" },
    { ...qwenGovernanceEnv, VISION_MODEL: "unapproved-model" },
    { ...qwenGovernanceEnv, VISION_BUDGET_CURRENCY: "USD" },
    { ...qwenGovernanceEnv, VISION_BUDGET_LIMIT_MINOR_UNITS: "2100" },
    {
      ...qwenGovernanceEnv,
      VISION_ESTIMATED_BATCH_COST_MINOR_UNITS: "2001",
    },
    { ...qwenGovernanceEnv, VISION_BATCH_SIZE: "6" },
    { ...qwenGovernanceEnv, VISION_MAX_TOTAL_REQUESTS: "16" },
    { ...qwenGovernanceEnv, VISION_MAX_CONCURRENCY: "2" },
    {
      ...qwenGovernanceEnv,
      VISION_PRIVATE_IMAGE_ENVELOPE_HMAC_SECRET: "too-short",
    },
  ]) {
    assert.throws(
      () => createVisionProviderFromEnv(env),
      (error: unknown) =>
        error instanceof VisionProviderError &&
        error.code === "CONFIGURATION",
    );
  }
});

test("pending approval blocks Factory and every exported Qwen construction seam", async () => {
  let fetchCalls = 0;
  assert.throws(
    () =>
      createVisionProviderFromEnv(qwenGovernanceEnv, {
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response();
        },
      }),
    (error: unknown) =>
      error instanceof VisionProviderError &&
      error.code === "CONFIGURATION" &&
      /not yet an approved activation record/.test(error.message),
  );
  const qwenModule = await import(
    "../lib/visionqa/providers/qwen.ts"
  );
  assert.equal("QwenBailianVisionAdapter" in qwenModule, false);
  assert.throws(
    () =>
      createGovernedQwenBailianAdapter(qwenGovernanceEnv, {
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response();
        },
      }),
    (error: unknown) =>
      error instanceof VisionProviderError &&
      error.code === "CONFIGURATION" &&
      /not yet an approved activation record/.test(error.message),
  );
  assert.equal(fetchCalls, 0);
});

test("Qwen compatible request uses the fixed endpoint/model and leaks no secret or URL", async () => {
  const requestBody = buildQwenCompatibleRequestBody(
    await createLiveInput(),
  ) as {
    model: string;
    messages: Array<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
  assert.equal(
    QWEN_BAILIAN_DEFINITION.endpoint,
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  );
  assert.equal(requestBody.model, QWEN_BAILIAN_MODEL_SNAPSHOT);
  const outboundPrompt = requestBody.messages[0].content[0].text ?? "";
  for (const keyword of ["服饰电商", "证据", "JSON"]) {
    assert.ok(
      outboundPrompt.includes(keyword),
      `missing semantic keyword: ${keyword}`,
    );
  }
  assert.match(outboundPrompt, /不得猜测|补造证据/);
  assert.doesNotMatch(outboundPrompt, COMMON_MOJIBAKE);
  assert.equal(
    JSON.stringify(requestBody).includes("fake-qwen-key"),
    false,
  );
});

test("registry cannot be mutated and no exported constructor accepts a definition", () => {
  assert.ok(Object.isFrozen(QWEN_BAILIAN_DEFINITION));
  assert.ok(Object.isFrozen(QWEN_BAILIAN_DEFINITION.imageHosts));
  assert.deepEqual(QWEN_BAILIAN_DEFINITION.imageHosts, []);
  assert.throws(() => {
    (
      QWEN_BAILIAN_DEFINITION as {
        endpoint: string;
      }
    ).endpoint = "https://evil.invalid/v1";
  }, TypeError);
  assert.equal(QWEN_BAILIAN_DEFINITION.modelSnapshot, QWEN_BAILIAN_MODEL_SNAPSHOT);
});

test("missing, altered, expired, rehosted and oversized image envelopes fail before fetch", async () => {
  const valid = await createLiveInput();
  const missingSignature = structuredClone(valid);
  missingSignature.candidate.privateEnvelope = undefined;
  const wrongSignature = structuredClone(valid);
  wrongSignature.candidate.privateEnvelope!.signature = "invalid_signature";
  const hostChanged = structuredClone(valid);
  hostChanged.candidate.url =
    "https://evil.example/canary/candidate.png?token=redacted";
  const pathChanged = structuredClone(valid);
  pathChanged.candidate.url =
    "https://visionqa-test-assets.oss-cn-beijing.aliyuncs.com/canary/other.png?token=redacted";
  const expired = await createLiveInput({
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
  });
  const oversized = await createLiveInput({
    byteSize: 10 * 1024 * 1024 + 1,
  });
  for (const badInput of [
    missingSignature,
    wrongSignature,
    hostChanged,
    pathChanged,
    expired,
    oversized,
  ]) {
    await assert.rejects(
      () =>
        assertProviderImages(
          badInput,
          TEST_PROVIDER_DEFINITION,
          IMAGE_ENVELOPE_SECRET,
        ),
      (error: unknown) =>
        error instanceof VisionProviderError &&
        !error.message.includes(badInput.candidate.url),
    );
  }
});

test("Qwen JSON parser accepts common wrapper noise and normalizes benign schema drift", () => {
  const draft = createFixtureDraft();
  assert.deepEqual(
    parseQwenObservationDraft(JSON.stringify(draft)),
    draft,
  );
  assert.deepEqual(
    parseQwenObservationDraft(`\`\`\`json\n${JSON.stringify(draft)}\n\`\`\``),
    draft,
  );
  assert.deepEqual(
    parseQwenObservationDraft(`Result:\n${JSON.stringify(draft)}`),
    draft,
  );
  const drifted = structuredClone(draft) as unknown as Record<string, unknown>;
  const skills = drifted.skillAssessments as Record<string, Record<string, unknown>>;
  skills.human_realism.score = "88";
  skills.human_realism.evidence = "Visible hand anatomy is coherent.";
  skills.human_realism.assessability = "full";
  const parsed = parseQwenObservationDraft(JSON.stringify(drifted));
  assert.equal(parsed.skillAssessments.human_realism.score, 88);
  assert.equal(parsed.skillAssessments.human_realism.assessability, "FULL");
  assert.deepEqual(parsed.skillAssessments.human_realism.evidence, [
    "Visible hand anatomy is coherent.",
  ]);

  const englishKnownIssue = createFixtureDraft();
  englishKnownIssue.observations[0] = {
    observation_id: "obs_english_001",
    issue_code: "no_promotion_overlay",
    primary_skill: "COM",
    severity: "blocker",
    status: "detected",
    observation: "Image contains no overlaid commercial information.",
    impact: "Fails platform promotion requirements.",
  };
  const localized = parseQwenObservationDraft(JSON.stringify(englishKnownIssue));
  assert.match(localized.observations[0].observation, /平台促销主图要求/);
  assert.match(localized.observations[0].impact, /推动转化/);
  assert.doesNotMatch(localized.observations[0].observation, /Image contains/i);
});

test("Qwen business errors are classified without retrying policy/quota failures", async () => {
  for (const [code, expected] of [
    ["DataInspectionFailed", "POLICY_BLOCKED"],
    ["Arrearage", "QUOTA_EXHAUSTED"],
    ["ModelNotFound", "CONFIGURATION"],
  ] as const) {
    const error = classifyQwenBusinessError(code);
    assert.ok(error instanceof VisionProviderError);
    assert.equal(error.code, expected);
    assert.equal(error.retryable, false);
  }
});

test("missing evidence degrades to PARTIAL and REVIEW without fabrication", async () => {
  const adapter = new FixtureVisionAdapter(() => {
    const draft = createFixtureDraft();
    draft.commercialAssessment.metrics.product_prominence.evidence = [];
    draft.commercialAssessment.metrics.product_prominence.summary = "";
    return draft;
  });
  const outcome = await orchestrateVisionEvaluation(
    adapter,
    input,
    new AbortController().signal,
  );
  assert.equal(outcome.result.score_evaluation.status, "PARTIAL");
  assert.equal(outcome.result.score_evaluation.overall_score, null);
  assert.equal(outcome.result.gate_evaluation.decision, "REVIEW");
  assert.deepEqual(
    outcome.result.score_evaluation.commercial_assessment.metrics
      .product_prominence.evidence,
    [],
  );
  assert.equal(
    outcome.result.score_evaluation.commercial_assessment.metrics
      .product_prominence.summary,
    "证据不足，需人工复核。",
  );
  assert.ok(
    outcome.result.action_plan.required_human_checks.includes(
      "模型证据不完整，必须人工复核。",
    ),
  );
  assert.doesNotMatch("证据不足，需人工复核。", COMMON_MOJIBAKE);
  assert.doesNotMatch("模型证据不完整，必须人工复核。", COMMON_MOJIBAKE);
});

test("a missing required promotion layer keeps a numeric score while blocker controls gate", async () => {
  const adapter = new FixtureVisionAdapter(() => {
    const draft = createFixtureDraft();
    draft.observations = [
      {
        observation_id: "obs_missing_promo",
        issue_code: "no_promotion_overlay",
        primary_skill: "COM",
        severity: "blocker",
        status: "detected",
        observation: "图片缺少平台促销信息层。",
        impact: "无法满足平台促销主图要求。",
      },
    ];
    for (const metricId of [
      "promotion_hierarchy",
      "information_legibility",
    ] as const) {
      draft.commercialAssessment.metrics[metricId] = {
        score: null,
        assessability: "NOT_APPLICABLE",
        evidence: [],
        summary: "缺少促销叠加信息。",
      };
    }
    draft.commercialAssessment.assessability = "NOT_APPLICABLE";
    return draft;
  });
  const outcome = await orchestrateVisionEvaluation(
    adapter,
    input,
    new AbortController().signal,
  );
  assert.equal(outcome.result.score_evaluation.status, "SUCCEEDED");
  assert.equal(
    outcome.result.score_evaluation.commercial_assessment.metrics
      .promotion_hierarchy.score,
    0,
  );
  assert.equal(
    outcome.result.score_evaluation.commercial_assessment.metrics
      .information_legibility.score,
    0,
  );
  assert.equal(typeof outcome.result.score_evaluation.overall_score, "number");
  assert.equal(outcome.result.gate_evaluation.decision, "REJECT");
});

test("retry policy retries only classified transient failures", async () => {
  let attempts = 0;
  const adapter: VisionProviderAdapter = {
    providerId: "test",
    adapterVersion: "test-1",
    async evaluate(evaluationInput, signal) {
      attempts += 1;
      if (attempts < 3) {
        throw new VisionProviderError("RATE_LIMITED", "retry", {
          retryable: true,
        });
      }
      return new FixtureVisionAdapter().evaluate(evaluationInput, signal);
    },
  };
  await evaluateWithRetry(
    adapter,
    input,
    new AbortController().signal,
    { sleep: async () => undefined, random: () => 0 },
  );
  assert.equal(attempts, 3);
});
