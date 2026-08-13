import { RuntimeError } from "./errors.mjs";

function requireMethod(target, name, owner) {
  if (!target || typeof target[name] !== "function") {
    throw new RuntimeError(
      "DEPENDENCY_PORT_INVALID",
      `${owner}.${name} dependency is unavailable.`,
      { status: 503 },
    );
  }
}

export function assertDependencyPorts(dependencies, mode) {
  requireMethod(dependencies?.objectStorage, "head", "objectStorage");
  requireMethod(dependencies?.objectStorage, "presignGet", "objectStorage");
  requireMethod(dependencies?.repository, "persistEvaluation", "repository");
  requireMethod(dependencies?.repository, "recordJobState", "repository");
  requireMethod(dependencies?.visionProvider, "evaluate", "visionProvider");
  if (mode === "live") {
    requireMethod(
      dependencies?.visionProvider,
      "preparePrivateImage",
      "visionProvider",
    );
    if (dependencies.objectStorage.provider !== "aliyun_oss") {
      throw new RuntimeError(
        "LIVE_DEPENDENCY_INVALID",
        "Live object storage must be the Aliyun OSS port.",
        { status: 503 },
      );
    }
    if (dependencies.repository.provider !== "aliyun_postgresql") {
      throw new RuntimeError(
        "LIVE_DEPENDENCY_INVALID",
        "Live repository must be the Aliyun PostgreSQL port.",
        { status: 503 },
      );
    }
    if (
      dependencies.visionProvider.providerId !==
      "aliyun-bailian-cn-beijing"
    ) {
      throw new RuntimeError(
        "LIVE_DEPENDENCY_INVALID",
        "Live vision provider must be the governed Qwen Bailian port.",
        { status: 503 },
      );
    }
  }
  return dependencies;
}
