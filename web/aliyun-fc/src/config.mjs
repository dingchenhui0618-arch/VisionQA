import { RuntimeError } from "./errors.mjs";

export const FIXED_REGION = "cn-beijing";
export const MAX_CONCURRENCY = 1;
export const WEB_TIMEOUT_MS = 25_000;
export const TASK_TIMEOUT_MS = 110_000;
export const MAX_TASK_ATTEMPTS = 3;

const LIVE_TRUE_GATES = [
  "OSS_GOVERNANCE_EVIDENCE_ACCEPTED",
  "PG_GOVERNANCE_EVIDENCE_ACCEPTED",
  "QWEN_GOVERNANCE_EVIDENCE_ACCEPTED",
  "SECRET_MANAGER_CONFIGURED",
  "PRIVATE_NETWORK_PATH_CONFIRMED",
  "SLS_REDACTION_CONFIRMED",
];

const LIVE_SECRET_NAMES = [
  "VISIONQA_INTERNAL_TOKEN",
  "PG_PASSWORD",
  "QWEN_API_KEY",
  "VISION_PRIVATE_IMAGE_ENVELOPE_HMAC_SECRET",
];

const FC_STS_NAMES = [
  "ALIBABA_CLOUD_ACCESS_KEY_ID",
  "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
  "ALIBABA_CLOUD_SECURITY_TOKEN",
];

const FORBIDDEN_STATIC_AK_NAMES = ["ALIYUN_ACCESS_KEY_ID", "ALIYUN_ACCESS_KEY_SECRET"];

function assertAliyunCredentialMode(env) {
  for (const name of FORBIDDEN_STATIC_AK_NAMES) {
    if (env[name]?.trim()) {
      throw new RuntimeError(
        "STATIC_ACCESS_KEY_FORBIDDEN",
        `${name} must not be injected. Use the FC Function Role and RAM Role STS.`,
        { status: 503 },
      );
    }
  }
  const stsValues = FC_STS_NAMES.map((name) => env[name]?.trim() || "");
  const populated = stsValues.filter(Boolean).length;
  if (populated === 0) return;
  if (populated !== FC_STS_NAMES.length || !stsValues[0].startsWith("STS.")) {
    throw new RuntimeError(
      "STATIC_ACCESS_KEY_FORBIDDEN",
      "Aliyun credentials must be a complete temporary STS triad supplied by the FC Function Role.",
      { status: 503 },
    );
  }
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) {
    throw new RuntimeError(
      "CONFIGURATION",
      `${name} is required.`,
      { status: 503 },
    );
  }
  return value;
}

export function loadRuntimeConfig(env = process.env) {
  const mode = env.VISIONQA_RUNTIME_MODE?.trim() || "fixture";
  if (!["fixture", "live"].includes(mode)) {
    throw new RuntimeError("CONFIGURATION", "Runtime mode must be fixture or live.", {
      status: 503,
    });
  }
  if ((env.ALIBABA_CLOUD_REGION_ID || FIXED_REGION) !== FIXED_REGION) {
    throw new RuntimeError(
      "CONFIGURATION",
      `Aliyun region is fixed to ${FIXED_REGION}.`,
      { status: 503 },
    );
  }
  const config = {
    mode,
    region: FIXED_REGION,
    port: Number(env.PORT || 9000),
    internalToken: env.VISIONQA_INTERNAL_TOKEN?.trim() || null,
    maxConcurrency: MAX_CONCURRENCY,
    webTimeoutMs: WEB_TIMEOUT_MS,
    taskTimeoutMs: TASK_TIMEOUT_MS,
    maxTaskAttempts: MAX_TASK_ATTEMPTS,
  };
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65_535) {
    throw new RuntimeError("CONFIGURATION", "PORT is invalid.", { status: 503 });
  }
  assertAliyunCredentialMode(env);
  if (mode === "live") {
    for (const gate of LIVE_TRUE_GATES) {
      if (env[gate] !== "true") {
        throw new RuntimeError(
          "GOVERNANCE_EVIDENCE_MISSING",
          `Live runtime is blocked: ${gate} must be explicitly true.`,
          { status: 503 },
        );
      }
    }
    for (const secretName of LIVE_SECRET_NAMES) required(env, secretName);
    if (env.FC_INSTANCE_CONCURRENCY !== "1") {
      throw new RuntimeError(
        "CONFIGURATION",
        "FC_INSTANCE_CONCURRENCY must be exactly 1.",
        { status: 503 },
      );
    }
  }
  return Object.freeze(config);
}
