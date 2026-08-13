export const LOCAL_FEEDBACK_STORAGE_KEY = "visionqa-local-feedback-v1";
export const LOCAL_EVALUATION_MODE = "FIXTURE_REPLAY_NO_MODEL";
export const LOCAL_MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export type CandidateDescriptor = {
  name: string;
  type: string;
  size: number;
};

export type CandidateValidation =
  | { ok: true }
  | { ok: false; message: string };

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const allowedExtensions = /\.(?:jpe?g|png|webp)$/i;

export function validateLocalCandidate(
  candidate: CandidateDescriptor,
): CandidateValidation {
  if (!candidate.name.trim()) {
    return { ok: false, message: "文件名为空，无法建立候选图追踪记录。" };
  }
  if (!Number.isInteger(candidate.size) || candidate.size <= 0) {
    return { ok: false, message: "候选图为空文件，无法处理。" };
  }
  if (candidate.size > LOCAL_MAX_IMAGE_BYTES) {
    return {
      ok: false,
      message: "候选图超过 20 MB。本地 MVP 仅接受不超过 20 MB 的图片。",
    };
  }
  if (
    !allowedMimeTypes.has(candidate.type.toLowerCase()) &&
    !allowedExtensions.test(candidate.name)
  ) {
    return {
      ok: false,
      message: "仅支持 JPG、PNG 或 WebP 图片。",
    };
  }
  return { ok: true };
}

export async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function fixtureIndexFromSha256(
  sha256: string,
  fixtureCount: number,
): number {
  if (!/^[a-f0-9]{64}$/i.test(sha256)) {
    throw new Error("候选图 SHA-256 无效");
  }
  if (!Number.isInteger(fixtureCount) || fixtureCount < 1) {
    throw new Error("至少需要一个 fixture case");
  }
  return Number.parseInt(sha256.slice(0, 8), 16) % fixtureCount;
}

export function candidateTraceId(sha256: string): string {
  if (!/^[a-f0-9]{64}$/i.test(sha256)) {
    throw new Error("候选图 SHA-256 无效");
  }
  return `local_${sha256.slice(0, 16).toLowerCase()}`;
}

export type LocalFeedbackRecord = {
  schemaVersion: "visionqa-local-feedback-v1";
  id: string;
  candidateTraceId: string;
  candidateSha256: string;
  candidateName: string;
  evaluationMode: typeof LOCAL_EVALUATION_MODE;
  fixtureCaseId: string;
  originalDecision: "PASS" | "REVIEW" | "REJECT";
  humanDecision: "PASS" | "REVIEW" | "REJECT";
  reasonCode: string;
  evidenceNote: string;
  overallScore: number;
  commercialTemplateId: string;
  commercialFitScore: number;
  createdAt: string;
  storage: "local";
};

export function appendLocalFeedback<T>(
  history: readonly T[],
  record: T,
  limit = 50,
): T[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("反馈记录上限必须是正整数");
  }
  return [record, ...history].slice(0, limit);
}
