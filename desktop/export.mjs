const SECRET_KEY = /(api[_-]?key|access[_-]?key|token|secret|password|authorization|private[_-]?key)/i;

export const REVIEW_EXPORT_FORMATS = Object.freeze(["json", "markdown", "sarif"]);

function redact(value, key = "") {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey)]));
  }
  return value;
}

export function normalizeReview(value) {
  if (value === null || typeof value !== "object") throw new TypeError("review must be an object");
  const sanitized = redact(value);
  const encoded = JSON.stringify(sanitized);
  if (encoded.length > 2_000_000) throw new RangeError("review payload is too large");
  return sanitized;
}

function asText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function toMarkdown(review) {
  const normalized = normalizeReview(review);
  const lines = [
    "# VisionQA Review",
    "",
    `- Contract: ${asText(normalized.contract ?? normalized.schema_version ?? "unknown")}`,
    `- Decision: ${asText(normalized.decision ?? normalized.gate?.decision ?? "unknown")}`,
    `- Summary: ${asText(normalized.summary ?? "")}`,
    "",
    "## Evidence",
    "",
  ];
  const evidence = normalized.evidence ?? normalized.host_capture ?? normalized.context;
  if (evidence) lines.push("```json", JSON.stringify(evidence, null, 2), "```");
  else lines.push("No evidence was provided.");
  lines.push("", "## Raw review", "", "```json", JSON.stringify(normalized, null, 2), "```");
  return `${lines.join("\n")}\n`;
}

function issueResults(review) {
  const issues = Array.isArray(review.issues) ? review.issues : [];
  if (issues.length > 0) return issues;
  return [{
    id: "visionqa-review",
    message: review.summary ?? `Decision: ${review.decision ?? "unknown"}`,
    level: review.decision === "PASS" ? "note" : "warning",
  }];
}

export function toSarif(review) {
  const normalized = normalizeReview(review);
  const results = issueResults(normalized).map((issue, index) => ({
    ruleId: String(issue.code ?? issue.id ?? `visionqa-${index + 1}`),
    level: issue.level === "error" || issue.severity === "blocker" ? "error" : issue.level === "note" ? "note" : "warning",
    message: { text: String(issue.message ?? issue.summary ?? issue.issue ?? issue.observation ?? "Visual review finding") },
    properties: {
      severity: issue.severity ?? null,
      decision: normalized.decision ?? null,
      evidence_anchor: issue.evidence_anchor ?? issue.dom_selector ?? null,
    },
  }));
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "VisionQA", informationUri: "http://localhost:6300/plugin", version: "0.2.0" } },
      results,
      properties: { contract: normalized.contract ?? normalized.schema_version ?? null },
    }],
  };
}

export function serializeReview(review, format) {
  if (!REVIEW_EXPORT_FORMATS.includes(format)) throw new RangeError(`unsupported export format: ${format}`);
  const normalized = normalizeReview(review);
  if (format === "json") return `${JSON.stringify(normalized, null, 2)}\n`;
  if (format === "markdown") return toMarkdown(normalized);
  return `${JSON.stringify(toSarif(normalized), null, 2)}\n`;
}

export function defaultExportFileName(format, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `visionqa-review-${stamp}.${format === "markdown" ? "md" : format === "sarif" ? "sarif.json" : "json"}`;
}
