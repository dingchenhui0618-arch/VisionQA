import {
  reviewProfileDefinitionSchema,
  type ReviewProfileDefinition,
  type ReviewProfileRef,
} from "./review-contract-v0.2.ts";

/**
 * Built-in profile registry.  Profiles are policy, not providers: a provider
 * supplies observations while the profile defines the dimensions and the
 * inferences that are out of scope.
 */
export const BUILTIN_REVIEW_PROFILES: readonly ReviewProfileDefinition[] = [
  reviewProfileDefinitionSchema.parse({
    schema_version: "review-profile-v0.1",
    profile: { id: "visual-baseline", version: "0.1.0", kind: "builtin" },
    review_mode: "visual",
    title: "通用视觉基线",
    description: "检查层级、构图、排版、对比、密度和视觉一致性，不推断商业转化结果。",
    dimensions: [
      { id: "hierarchy", label: "信息层级" },
      { id: "composition", label: "构图与留白" },
      { id: "alignment", label: "对齐与节奏" },
      { id: "typography", label: "字体与可读性" },
      { id: "contrast", label: "对比与可访问性" },
      { id: "consistency", label: "组件与风格一致性" },
      { id: "interaction", label: "交互反馈清晰度" },
    ],
    deterministic_checks: ["viewport_overflow", "missing_alt_text", "contrast_ratio_when_available"],
    forbidden_inferences: ["conversion_rate", "sales_lift", "brand_preference_without_reference"],
    provenance: { source: "VisionQA built-in profile" },
  }),
  reviewProfileDefinitionSchema.parse({
    schema_version: "review-profile-v0.1",
    profile: { id: "code-quality", version: "0.1.0", kind: "builtin" },
    review_mode: "code",
    title: "代码质量基线",
    description: "结合确定性规则、差异和测试上下文评估可读性、边界与可维护性。",
    dimensions: [
      { id: "readability", label: "可读性与命名" },
      { id: "boundaries", label: "模块边界与依赖" },
      { id: "complexity", label: "复杂度与重复" },
      { id: "correctness", label: "错误处理与正确性风险" },
      { id: "testability", label: "可测试性" },
      { id: "security", label: "安全与权限边界" },
      { id: "performance", label: "性能风险" },
      { id: "accessibility", label: "无障碍实现" },
    ],
    deterministic_checks: ["typecheck", "lint", "test", "secret_scan"],
    forbidden_inferences: ["developer_intent_without_context", "runtime_performance_without_measurement"],
    provenance: { source: "VisionQA built-in profile" },
  }),
  reviewProfileDefinitionSchema.parse({
    schema_version: "review-profile-v0.1",
    profile: { id: "linked-review", version: "0.1.0", kind: "builtin" },
    review_mode: "linked",
    title: "视觉与源码联动评审",
    description: "把视觉问题关联到截图区域、DOM 元素和源码范围；只生成可追溯的修改计划，不绕过用户批准写回。",
    dimensions: [
      { id: "visual_issue_locator", label: "视觉问题定位" },
      { id: "dom_source_link", label: "DOM 与源码关联" },
      { id: "change_locality", label: "修改局部性" },
      { id: "verification", label: "修改后验证" },
    ],
    deterministic_checks: ["evidence_anchor_presence", "source_range_validity", "approval_required"],
    forbidden_inferences: ["source_quality_without_source", "automatic_write_without_approval"],
    provenance: { source: "VisionQA built-in profile" },
  }),
  reviewProfileDefinitionSchema.parse({
    schema_version: "review-profile-v0.1",
    profile: { id: "ecommerce-apparel", version: "0.3.0", kind: "builtin" },
    review_mode: "visual",
    title: "服饰电商商品图兼容配置",
    description: "兼容已有商品真值、版型、材质和人物一致性评审；仍受通用视觉核心的证据约束。",
    dimensions: [
      { id: "product_truth", label: "商品真值一致性" },
      { id: "material", label: "材质与结构" },
      { id: "human_realism", label: "人物与穿着真实感" },
      { id: "composition", label: "商品主体与构图" },
    ],
    deterministic_checks: ["decodable_image", "aspect_ratio_stability", "protected_region_presence"],
    forbidden_inferences: ["sales_lift", "conversion_rate_without_experiment"],
    provenance: { source: "VisionQA legacy compatibility profile" },
  }),
] as const;

export function getReviewProfile(ref: ReviewProfileRef): ReviewProfileDefinition | undefined {
  return BUILTIN_REVIEW_PROFILES.find((profile) => profile.profile.id === ref.id && profile.profile.version === ref.version && profile.profile.kind === ref.kind);
}

export function listReviewProfiles(reviewMode?: "visual" | "code" | "linked"): ReviewProfileDefinition[] {
  return BUILTIN_REVIEW_PROFILES.filter((profile) => !reviewMode || profile.review_mode === reviewMode);
}

export type ReviewProfileResolutionInput = {
  readonly requested?: ReviewProfileRef | null;
  readonly artifactType?: string | null;
  readonly hasScreenshot?: boolean;
  readonly hasSource?: boolean;
};

export type ReviewProfileResolution = {
  readonly profile: ReviewProfileDefinition;
  readonly resolution: "explicit" | "linked" | "default";
  readonly warnings: readonly string[];
};

export class UnknownReviewProfileError extends Error {
  readonly profileId: string;
  readonly profileVersion: string;

  constructor(ref: ReviewProfileRef) {
    super(`Unknown built-in review profile: ${ref.id}@${ref.version}`);
    this.name = "UnknownReviewProfileError";
    this.profileId = ref.id;
    this.profileVersion = ref.version;
  }
}

/**
 * Select a built-in profile before a provider call. A generic visual artifact
 * never falls through to the legacy apparel profile. The latter is opt-in by
 * requiring an explicit versioned reference from the caller.
 */
export function resolveReviewProfile(input: ReviewProfileResolutionInput = {}): ReviewProfileResolution {
  if (input.requested) {
    const profile = getReviewProfile(input.requested);
    if (!profile) throw new UnknownReviewProfileError(input.requested);
    return Object.freeze({
      profile,
      resolution: "explicit",
      warnings: profile.profile.id === "ecommerce-apparel"
        ? Object.freeze(["服饰电商兼容 profile 仅在明确选择并提供商品真值时启用。"])
        : Object.freeze([]),
    });
  }

  if (input.hasScreenshot && input.hasSource) {
    const profile = getReviewProfile({ id: "linked-review", version: "0.1.0", kind: "builtin" });
    if (!profile) throw new Error("linked-review profile is not registered");
    return Object.freeze({ profile, resolution: "linked", warnings: Object.freeze([]) });
  }

  const isSource = input.artifactType === "source_code" || input.artifactType === "diff";
  const profile = getReviewProfile({
    id: isSource ? "code-quality" : "visual-baseline",
    version: "0.1.0",
    kind: "builtin",
  });
  if (!profile) throw new Error("default review profile is not registered");
  const warnings = isSource && !input.hasSource
    ? Object.freeze(["代码评审 profile 已根据目标类型选择，但尚未提供源码引用；结果必须保持不可评估。"])
    : Object.freeze([]);
  return Object.freeze({ profile, resolution: "default", warnings });
}

