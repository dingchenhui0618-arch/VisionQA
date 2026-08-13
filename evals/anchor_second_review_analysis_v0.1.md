# 商业模板锚点第二盲评分析 v0.1

> 模板：天猫 / 平台促销主图  
> 数据：15 张锚点候选  
> Reviewer A：`initial_labels_v0.1.csv`  
> Reviewer B：`reviewer_b_blind_v0.1.csv`  
> 结论：**本轮完成了问题发现，但未达到 gold label 冻结条件**

## 1. 数据完整性

- Reviewer B 返回 15 行，素材编号完整且唯一；
- 15 个编号与锚点候选集一一对应；
- 没有读取 Reviewer A 结果后再填表的证据；
- 原始返回文件已原样归档，SHA-256 与用户提供文件一致。

## 2. 一致性结果

| 指标 | 本轮结果 | Phase 1 目标 | 判定 |
|---|---:|---:|---|
| 可评估性完全一致率 | 73.3%（11/15） | — | 仅作描述 |
| 可评估性 Cohen's κ | -0.053 | ≥ 0.80 | 未通过 |
| 共同可评分样本 | 11 | — | 样本很小 |
| 贴合等级线性加权 κ | 0.127 | ≥ 0.70 | 未通过 |
| 总分 MAE | 12.0 | ≤ 10 | 未通过 |
| 总分 Spearman ρ | 0.118 | ≥ 0.75 | 未通过 |

> κ 为负不表示 Reviewer B “比随机更差”。当前类别分布极不均衡，且双方对占位模板和渠道不适配的边界理解不同；该数值应作为协议需要修订的警报，而不是评审者绩效结论。

另一个协议缺陷是 v0.1 Brief 没有写明等级阈值。Reviewer B 将 82–88 分标为 `HIGH`，而正式模板规定 `90–100 HIGH / 70–89 MEDIUM / 0–69 LOW`。因此本报告保留 0.127 作为问题发现记录，但不把它解释为有效的等级一致性结论。v0.2 起 `fit_level` 必须由总分自动推导。

## 3. 适用性分歧

| 图片 | Reviewer A | Reviewer B | 图像事实 | 裁决 |
|---|---|---|---|---|
| #06 | NOT_ASSESSABLE | APPLICABLE / 48 | 大面积商品主图区域为空，仅保留小型加购示意 | NOT_ASSESSABLE |
| #21 | NOT_ASSESSABLE | APPLICABLE / 74 | 核心商品展示区域为白色占位块 | NOT_ASSESSABLE |
| #35 | NOT_ASSESSABLE | APPLICABLE / 45 | 主体商品区域为空，仅有促销与版式结构 | NOT_ASSESSABLE |
| #44 | APPLICABLE / 74 | NOT_APPLICABLE | 图片完整，但无价格、优惠、活动 CTA，偏品牌/店铺穿搭主图 | NOT_APPLICABLE |

裁决依据不是取平均，而是 `second_reviewer_brief_v0.1.md` 的明确规则：

- 商品主体区域为空 → `NOT_ASSESSABLE`；
- 图片完整但更适合其他渠道 → `NOT_APPLICABLE`。

## 4. 共同可评分样本的分数差异

| 图片 | Reviewer A | Reviewer B | 绝对差 |
|---|---:|---:|---:|
| #03 | 92 | 72 | 20 |
| #04 | 83 | 82 | 1 |
| #12 | 91 | 84 | 7 |
| #15 | 93 | 70 | 23 |
| #24 | 92 | 73 | 19 |
| #25 | 81 | 67 | 14 |
| #30 | 91 | 86 | 5 |
| #42 | 91 | 88 | 3 |
| #43 | 78 | 70 | 8 |
| #47 | 94 | 83 | 11 |
| #50 | 93 | 72 | 21 |

触发“大于 15 分”裁决条件的图片：#03、#15、#24、#50。

## 5. 发现的协议缺陷

Reviewer B 回填表使用了：

- `selling_point_clarity`
- `visual_attraction`
- `platform_adaptation`
- `brand_consistency`
- `conversion_readiness`
- `information_efficiency`

但正式商业模板要求：

- 商品主体突出度
- 卖点表达清晰度
- 促销信息层级
- 信息可读性
- 点击动机
- 渠道与图位适配

这两套字段不能无损映射。尤其 `brand_consistency` 与 `visual_attraction` 不是当前模板定义的正式子指标。Reviewer A 也只有总分，没有六项子分。因此：

- 本轮六项子分不得进入一致性统计；
- 不得根据两位总分简单平均后冻结 gold label；
- 需要让双方使用同一份 v0.2 回填表，对 11 张 `APPLICABLE` 图片做短版复评。

## 6. 处理决定

1. 冻结 15 张图片的适用性裁决 v0.1；
2. #06、#21、#35 不进入低分负例，保留为 `NOT_ASSESSABLE` 失败处理锚点；
3. #44 作为 `NOT_APPLICABLE` 跨模板边界锚点；
4. 其余 11 张使用统一六项指标重新评分；
5. Reviewer A 已完成 11 张同口径复评，Reviewer B 待使用相同表格复评；
6. 复评分数冻结前，初评与二评分数都只标记为 `PROVISIONAL`；
7. 修订 CSV 模板和评审 Brief，确保 UI、Schema、标准文档与评测字段完全一致。
