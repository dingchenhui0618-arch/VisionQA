# 商业价值模板种子库 v0.1

## 数据身份

本数据集包含项目负责人购买的 53 套服装服饰电商主图模板：

- 53 张 JPG 预览图；
- 53 个 RAR 源文件压缩包；
- 压缩包内共约 155 个 PSD，主要为同一模板的多尺寸版本。

该数据集的正式身份是：

> **购买的可编辑电商模板种子库，不是真实投放效果数据，也不是 VisionQA 四层准确率 gold set。**

## 已确认授权边界

项目负责人于 2026-07-28 确认：

- 允许用于 VisionQA 内部研发；
- 允许上传第三方视觉模型进行测试；
- 未来提供的真实投放成品素材采用相同许可；
- 未确认可再分发，因此不得将源文件作为公开数据集发布。

## 当前用途

- 建立“天猫/平台促销主图”商业价值模板；
- 提取商品主体、卖点、促销信息、可读性与渠道适配等商业子指标；
- 形成商业模板正例候选与评审表；
- 验证“相对模板贴合度”数据结构和 UI。

## 明确不能用于

- 声称真实 CTR、CVR 或 GMV 改善；
- 验证商品忠实度、人体真实性或材质准确率；
- 证明模型已经达到商业可用准确率；
- 代表任意具体品牌或客户的审美偏好。

## 文件

- `manifest.json`：机器可读素材清单、许可边界和文件元数据；
- `annotation_sheet.csv`：双人标注与裁决工作表；
- `initial_labels_v0.1.csv`：53 张素材的 Agent 第一轮结构化初标；
- `anchor_set_v0.1.md`：15 张锚点候选及选择理由；
- `anchor_contact_sheet_v0.1.jpg`：带第一轮建议的锚点总览；
- `anchor_blind_contact_sheet_v0.1.jpg`：不给出初始结论的第二评审图；
- `second_reviewer_brief_v0.1.md`：独立第二评审说明；
- `reviewer_b_blind_v0.1.csv`：第二评审者原始盲评结果，原样归档；
- `anchor_categorical_adjudication_v0.1.csv`：15 张适用性证据裁决；
- `anchor_rescore_brief_v0.2.md`：修正字段与等级阈值后的统一复评说明；
- `anchor_rescore_template_v0.2.csv`：11 张可评分锚点的空白复评表；
- `reviewer_a_rescore_v0.2.csv`：Reviewer A 按统一六项指标完成的复评；
- `reviewer_b_rescore_v0.2.csv`：Reviewer B 按统一六项指标完成的复评；
- `anchor_gold_labels_v0.1.csv`：15 张完成适用性裁决与双人同口径复评后的 Phase 1 共识标签；
- `coverage_candidate_shortlist_v0.1.md`：剩余 38 张中的 HIGH/LOW 与跨渠道候选初筛；
- `reviewer_a_coverage_screen_v0.1.csv`：14 张覆盖候选的统一六项指标初筛结果；
- 原始 JPG、RAR 与 PSD 保留在购买素材目录，不复制进项目仓库。

## 下一步

1. 53 张预览图第一轮初标已完成；
2. 15 张锚点候选已选出；
3. 第一轮独立第二盲评已完成并暴露字段、阈值和适用性边界问题；
4. 15 张适用性裁决已完成，Reviewer A 已完成 11 张统一口径复评；
5. Reviewer B 的 11 张统一口径复评已完成；
6. Phase 1 共识标签已冻结，但排序稳定性未通过；
7. 下一步优先补齐完整 HIGH/LOW 样本，再验证排序和自动候选阈值；
8. 后续加入真实投放成品、负例、修改前后版本和业务表现数据。
