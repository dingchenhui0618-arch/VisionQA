# VisionQA 契约与确定性规则变更记录 v0.3

日期：2026-07-29  
状态：MVP 内部验证

## 变更

- 新增 `evaluation-result-v0.3.schema.json`，将商业评估从自由文本升级为正式六项指标、模板版本、适用性、模板贴合分和相对差距。
- 新增 `commercial-template-v0.2.schema.json`，固定六项指标、顺序和权重：
  - `product_prominence`：25%
  - `selling_point_clarity`：20%
  - `promotion_hierarchy`：20%
  - `information_legibility`：15%
  - `click_motivation`：10%
  - `channel_placement_fit`：10%
- `fit_level` 不再作为独立判断输入，只能由 `template_fit_score` 推导：
  - 90–100：`HIGH`
  - 70–89.999：`MEDIUM`
  - 0–69.999：`LOW`
  - `NOT_ASSESSABLE / NOT_APPLICABLE`：分数和等级均为 `null`
- 四大 Skill 综合分固定采用 `HUM 25% + PHO 20% + MAT 20% + COM 35%`。
- 已确认 Blocker 永远强制 `REJECT`，不得被任何高分抵消。
- Repair Prompt 改为来源可追溯结构：
  - 修复动作必须关联 `source_observation_ids`；
  - 商业动作必须关联 `source_metric_ids`；
  - 必须记录 generator、generator version 和输入来源；
  - 默认加入不引入新商品事实的负向约束。

## 兼容性

- v0.1 商业模板与 v0.2 评估结果保留为历史契约，不原地改写。
- MVP 新执行链路应写入 v0.3；旧数据必须通过显式迁移器转换，不允许仅修改 `schema_version`。
- v0.3 示例明确标记为 `DEMO`，不代表真实模型结果或商业效果。

## 验证

- JSON Schema 示例校验：2/2 通过。
- TypeScript 确定性规则和 runtime validator：6/6 通过。
- ESLint：通过。
- 构建：通过。

