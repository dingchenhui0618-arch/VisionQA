export class RuntimeError extends Error {
  constructor(code, message, { status = 500, retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = "RuntimeError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function toSafeError(error) {
  if (error instanceof RuntimeError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      status: error.status,
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "The request failed without exposing internal details.",
    retryable: false,
    status: 500,
  };
}
