export type RepairModelCapability = {
  routeId: string;
  providerId: "DEEPSEEK" | "ALIYUN_BAILIAN";
  modelId: string;
  role: "PLANNER" | "IMAGE_EDITOR";
  supportsRawImages: boolean;
  supportsBoundingBox: boolean;
  maxReferenceImages: number;
  productionStatus: "ACTIVE" | "CANDIDATE" | "EXPERIMENTAL";
  costClass: "LOW" | "MEDIUM" | "HIGH";
};

export const REPAIR_MODEL_REGISTRY: readonly RepairModelCapability[] = [
  {
    routeId: "deepseek-v4-flash-planner",
    providerId: "DEEPSEEK",
    modelId: "deepseek-v4-flash",
    role: "PLANNER",
    supportsRawImages: false,
    supportsBoundingBox: false,
    maxReferenceImages: 0,
    productionStatus: "CANDIDATE",
    costClass: "LOW",
  },
  {
    routeId: "qwen-image-3-pro-edit",
    providerId: "ALIYUN_BAILIAN",
    modelId: "qwen-image-3.0-pro",
    role: "IMAGE_EDITOR",
    supportsRawImages: true,
    supportsBoundingBox: false,
    maxReferenceImages: 2,
    productionStatus: "ACTIVE",
    costClass: "HIGH",
  },
  {
    routeId: "wan-2-7-image-pro-bbox-edit",
    providerId: "ALIYUN_BAILIAN",
    modelId: "wan2.7-image-pro",
    role: "IMAGE_EDITOR",
    supportsRawImages: true,
    supportsBoundingBox: true,
    maxReferenceImages: 9,
    productionStatus: "CANDIDATE",
    costClass: "HIGH",
  },
  {
    routeId: "qwen-image-edit-max",
    providerId: "ALIYUN_BAILIAN",
    modelId: "qwen-image-edit-max-2026-01-16",
    role: "IMAGE_EDITOR",
    supportsRawImages: true,
    supportsBoundingBox: false,
    maxReferenceImages: 2,
    productionStatus: "CANDIDATE",
    costClass: "HIGH",
  },
  {
    routeId: "qwen-image-edit-plus",
    providerId: "ALIYUN_BAILIAN",
    modelId: "qwen-image-edit-plus-2025-10-30",
    role: "IMAGE_EDITOR",
    supportsRawImages: true,
    supportsBoundingBox: false,
    maxReferenceImages: 2,
    productionStatus: "CANDIDATE",
    costClass: "MEDIUM",
  },
] as const;

export type RepairRoutingRequest = {
  localizedRegionAvailable: boolean;
  referenceImageCount: number;
  priority: "QUALITY" | "COST";
  approvedRouteIds: readonly string[];
};

export function selectDeterministicRepairRoutes(input: RepairRoutingRequest): RepairModelCapability[] {
  return REPAIR_MODEL_REGISTRY
    .filter((entry) => entry.role === "IMAGE_EDITOR")
    .filter((entry) => input.approvedRouteIds.includes(entry.routeId))
    .filter((entry) => input.referenceImageCount <= entry.maxReferenceImages)
    .sort((left, right) => score(right, input) - score(left, input));
}

function score(model: RepairModelCapability, input: RepairRoutingRequest): number {
  let value = model.productionStatus === "ACTIVE" ? 40 : model.productionStatus === "CANDIDATE" ? 20 : 0;
  if (input.localizedRegionAvailable && model.supportsBoundingBox) value += 50;
  if (input.priority === "QUALITY" && model.costClass === "HIGH") value += 15;
  if (input.priority === "COST" && (model.costClass === "LOW" || model.costClass === "MEDIUM")) value += 15;
  return value;
}
