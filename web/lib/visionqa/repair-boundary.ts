export const REPAIR_BOUNDARY_VERSION = "repair-boundary-v0.1" as const;

export type RepairBoundaryCategory =
  | "商品结构"
  | "Logo／字标"
  | "印花／胶印／刺绣"
  | "颜色／材质／纹理"
  | "人物／穿着逻辑"
  | "背景／构图";

export type RepairStrategy =
  | "LOCAL_REPAIR"
  | "DETERMINISTIC_COMPOSITE"
  | "LOCAL_REPAIR_OR_REGENERATE"
  | "REGENERATE"
  | "BLOCKED";

export type RepairBoundary = {
  version: typeof REPAIR_BOUNDARY_VERSION;
  strategy: RepairStrategy;
  strategyLabel: string;
  target: string;
  allowedRegion: string;
  lockedRegions: string[];
  stopConditions: string[];
  rationale: string;
  humanConfirmationRequired: true;
  modelAutonomy: "SUGGEST_ONLY";
};

export type RepairBoundaryContext = {
  caseId?: string;
};

export const SYNTHETIC_REPAIR_CASES = [
  {
    id: "SC-001",
    label: "小错 · 多一颗纽扣",
    file: "sc-001-extra-button-v2.png",
    sha256: "b886ac06047dc7cede8d7a3439b16454fc34a3b9fbb961630175572fe808f20a",
    level: "L1",
    category: "商品结构",
    strategy: "LOCAL_REPAIR",
    strategyLabel: "局部修正",
  },
  {
    id: "SC-002",
    label: "中错 · 手指袖口融合",
    file: "sc-002-hand-cuff-fusion.png",
    sha256: "5312afdd8832782ac2e59be569c0ca98ea53efd74cb2cf2ac267eac4d29db546",
    level: "L2",
    category: "人物／穿着逻辑",
    strategy: "LOCAL_REPAIR_OR_REGENERATE",
    strategyLabel: "局修或重生成",
  },
  {
    id: "SC-003",
    label: "大错 · 额外手臂",
    file: "sc-003-extra-arm.png",
    sha256: "764a91e20acfbe0f3a134e1d2745ad0aa72ca7d261eabd1043e233102d4328a5",
    level: "L3",
    category: "人物／穿着逻辑",
    strategy: "REGENERATE",
    strategyLabel: "整体重生成",
  },
  {
    id: "SC-004",
    label: "小错 · 袖子纹理断裂",
    file: "sc-004-sleeve-texture.png",
    sha256: "b1db375959997cfe0706493e3cb6ac1c16e7a98c46dc790f6db605613efbf3d1",
    level: "L1",
    category: "颜色／材质／纹理",
    strategy: "LOCAL_REPAIR",
    strategyLabel: "局部修正",
  },
  {
    id: "SC-005",
    label: "大错 · 多项结构冲突",
    file: "sc-005-multi-structure.png",
    sha256: "7d9e325baeb6026dac33f2dced9db6f24f4710a231919071f1c7200adefbb38f",
    level: "L3",
    category: "商品结构",
    strategy: "REGENERATE",
    strategyLabel: "整体重生成",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  file: string;
  sha256: string;
  level: "L1" | "L2" | "L3";
  category: RepairBoundaryCategory;
  strategy: RepairStrategy;
  strategyLabel: string;
}>;

export function syntheticRepairCase(caseId: string | undefined) {
  return SYNTHETIC_REPAIR_CASES.find((item) => item.id === caseId);
}

const GLOBAL_LOCKS = [
  "商品真值中已确认的颜色、版型、结构、材质、图案与标记",
  "人物身份、面部、发型、姿势和非目标肢体",
  "背景、光线、镜头、构图、画幅和所有非目标区域",
];

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

export function resolveRepairBoundaryCategory(
  skill: string | undefined,
  issue: string,
): RepairBoundaryCategory {
  const known: RepairBoundaryCategory[] = [
    "商品结构",
    "Logo／字标",
    "印花／胶印／刺绣",
    "颜色／材质／纹理",
    "人物／穿着逻辑",
    "背景／构图",
  ];
  if (skill && known.includes(skill as RepairBoundaryCategory)) {
    return skill as RepairBoundaryCategory;
  }
  const text = `${skill ?? ""} ${issue}`;
  if (includesAny(text, ["Logo", "字标", "品牌文字", "乱码", "错拼"])) return "Logo／字标";
  if (includesAny(text, ["印花", "胶印", "刺绣", "贴花", "图案"])) return "印花／胶印／刺绣";
  if (includesAny(text, ["材质", "纹理", "色差", "颜色", "面料", "罗纹"])) return "颜色／材质／纹理";
  if (includesAny(text, ["真人", "人体", "手指", "手腕", "肢体", "脸部", "身份", "穿插", "穿着"])) return "人物／穿着逻辑";
  if (includesAny(text, ["摄影", "背景", "构图", "裁切", "镜头", "杂物"])) return "背景／构图";
  return "商品结构";
}

export function inferRepairBoundary(
  category: RepairBoundaryCategory,
  issue: string,
  context: RepairBoundaryContext = {},
): RepairBoundary {
  const normalized = issue.trim();
  const frozenStrategy = syntheticRepairCase(context.caseId)?.strategy;
  const severeAnatomy = includesAny(normalized, [
    "额外手臂", "多一只手", "多一条腿", "额外肢体", "身体比例", "骨架", "全身畸变", "身份变化",
  ]);
  const multiStructure = includesAny(normalized, [
    "多项", "多个结构", "领口", "口袋", "拉链",
  ]) && includesAny(normalized, ["同时", "以及", "并且", "多个", "多项"]);
  const missingTruth = includesAny(normalized, [
    "看不清", "被遮挡", "没有参考", "缺少真值", "无法确认",
  ]);

  if (frozenStrategy === "REGENERATE") {
    return {
      version: REPAIR_BOUNDARY_VERSION,
      strategy: "REGENERATE",
      strategyLabel: "整体重生成",
      target: normalized,
      allowedRegion: "不建立局部修图范围",
      lockedRegions: GLOBAL_LOCKS,
      stopConditions: ["合成案例 Gold Label 禁止局修", "新候选必须重新进行商品一致性和人物复验"],
      rationale: `案例 ${context.caseId} 的冻结 Gold Label 已定义为整体错误，用户换一种说法也不能降低处理等级。`,
      humanConfirmationRequired: true,
      modelAutonomy: "SUGGEST_ONLY",
    };
  }

  if (missingTruth) {
    return {
      version: REPAIR_BOUNDARY_VERSION,
      strategy: "BLOCKED",
      strategyLabel: "先补充商品真值",
      target: normalized,
      allowedRegion: "当前不开放修改区域",
      lockedRegions: GLOBAL_LOCKS,
      stopConditions: ["未补齐无遮挡商品真值", "无法定位唯一目标区域", "授权或交付规格不完整"],
      rationale: "可观察依据不足时，继续生成会让模型猜测商品事实。",
      humanConfirmationRequired: true,
      modelAutonomy: "SUGGEST_ONLY",
    };
  }

  if (severeAnatomy || multiStructure) {
    return {
      version: REPAIR_BOUNDARY_VERSION,
      strategy: "REGENERATE",
      strategyLabel: "整体重生成",
      target: normalized,
      allowedRegion: "不建立局部修图范围",
      lockedRegions: GLOBAL_LOCKS,
      stopConditions: ["禁止用局部遮盖冒充完整修复", "新候选必须重新进行商品一致性和人物复验"],
      rationale: severeAnatomy
        ? "人体骨架或额外肢体属于整体生成失败，局修难以保证身份与姿势连续。"
        : "多个关键商品结构同时冲突，局部修补会累积不可控漂移。",
      humanConfirmationRequired: true,
      modelAutonomy: "SUGGEST_ONLY",
    };
  }

  if (category === "Logo／字标") {
    return {
      version: REPAIR_BOUNDARY_VERSION,
      strategy: "DETERMINISTIC_COMPOSITE",
      strategyLabel: "使用授权资产确定性合成",
      target: normalized,
      allowedRegion: "用户确认的 Logo／字标锚点及最小融合边缘",
      lockedRegions: GLOBAL_LOCKS,
      stopConditions: ["缺少官方透明 PNG／SVG", "缺少位置、尺寸或色值规范", "模型尝试猜写文字"],
      rationale: "品牌文字不能交给生成模型猜写，应使用授权官方资产合成。",
      humanConfirmationRequired: true,
      modelAutonomy: "SUGGEST_ONLY",
    };
  }

  const categoryRegion: Record<RepairBoundaryCategory, string> = {
    "商品结构": "用户指出的单一商品结构及其最小材质融合边缘",
    "Logo／字标": "用户确认的品牌资产锚点",
    "印花／胶印／刺绣": "错误图案轮廓及周围最小织物融合区",
    "颜色／材质／纹理": "可定位的局部色差或纹理异常区及窄幅过渡区",
    "人物／穿着逻辑": "异常手指、手腕、袖口或穿插接触边界",
    "背景／构图": "与主体分离的局部背景杂物区域",
  };
  const contactRisk = category === "人物／穿着逻辑" || frozenStrategy === "LOCAL_REPAIR_OR_REGENERATE";
  return {
    version: REPAIR_BOUNDARY_VERSION,
    strategy: contactRisk ? "LOCAL_REPAIR_OR_REGENERATE" : frozenStrategy ?? "LOCAL_REPAIR",
    strategyLabel: contactRisk ? "尝试局修，漂移时重生成" : "局部修正",
    target: normalized,
    allowedRegion: categoryRegion[category],
    lockedRegions: GLOBAL_LOCKS,
    stopConditions: contactRisk
      ? ["脸部、身份、姿势或衣袖结构发生变化", "出现新的手指或肢体异常", "无法保持原始接触关系"]
      : ["修改扩散到目标区域之外", "商品其他正确结构发生变化", "人物或构图发生变化"],
    rationale: "问题可被定位为单一区域，可在明确真值和禁止变化区下尝试受控处理。",
    humanConfirmationRequired: true,
    modelAutonomy: "SUGGEST_ONLY",
  };
}

export function buildBoundaryAwareRepairPrompt(boundary: RepairBoundary) {
  if (boundary.strategy === "REGENERATE" || boundary.strategy === "BLOCKED") {
    return "";
  }
  return [
    `只处理以下已确认问题：${boundary.target}。`,
    `允许修改范围：${boundary.allowedRegion}。`,
    `必须保持不变：${boundary.lockedRegions.join("；")}。`,
    `停止条件：${boundary.stopConditions.join("；")}。`,
    boundary.strategy === "DETERMINISTIC_COMPOSITE"
      ? "不要生成或猜写任何品牌文字；仅为已授权官方资产保留准确的合成位置与自然融合边缘。"
      : "不得裁切、拉近、重新摆拍或重构整张图；不要新增商品细节、促销文字、Logo 或水印。",
  ].join("");
}
