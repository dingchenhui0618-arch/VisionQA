const SECRET_KEY =
  /(authorization|cookie|token|secret|password|api[-_]?key|access[-_]?key|signature|credential)/i;
const URL_KEY = /(url|uri)/i;
const URL_VALUE =
  /(?:https?:\/\/|oss:\/\/|[A-Za-z0-9.-]+\.oss-cn-[A-Za-z0-9-]+(?:-internal)?\.aliyuncs\.com(?:[/?#:]|$))/i;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

export function redact(value, key = "") {
  if (SECRET_KEY.test(key) || URL_KEY.test(key)) return "[REDACTED]";
  if (value instanceof URL) return "[REDACTED]";
  if (typeof value === "string") {
    if (URL_VALUE.test(value)) return "[REDACTED]";
    return value.replace(BEARER, "Bearer [REDACTED]");
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redact(childValue, childKey),
      ]),
    );
  }
  return value;
}

export function createLogger(write = console.log) {
  return {
    emit(event, fields = {}) {
      write(
        JSON.stringify(
          redact({
            timestamp: new Date().toISOString(),
            service: "visionqa-fc",
            region: "cn-beijing",
            event,
            ...fields,
          }),
        ),
      );
    },
  };
}
