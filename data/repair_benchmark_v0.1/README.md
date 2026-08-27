# repair_benchmark_v0.1

服饰电商商品图／AI 模特图修正的**独立评测契约与案例计划**。它评估的是“修正后是否仍可安全交付”，不是向客户展示的单一评分器。

## 证据边界

- 本包仅含分类、案例计划和空白标注／盲测模板；所有 12 个案例均为 `NOT_RUN`，没有模型调用、修正输出、客户使用、准确率或通过率。
- `RB-001` 只引用 `../synthetic_demo_sku_burgundy_trousers_v0.1/` 作为受控内部计划输入。该目录素材为 AI 合成测试素材，不是真实品牌、客户或在售商品。
- 任何真实素材进入前，须在 Gold Label 记录来源、授权范围、SKU、文件 SHA-256、真值图和可用于评测的范围；缺任何一项即 `BLOCKED`，不得向 Provider 发送。

## 文件

- `taxonomy-v0.1.json`：问题分类、目标区域、商品真值、禁止变化区及默认策略。
- `case-plan-v0.1.csv`：12 个平衡案例的执行计划与缺失素材清单。
- `gold-label-template-v0.1.json`：逐案例 Gold Label 契约及空白模板。
- `blind-acceptance-template-v0.1.csv`：不透露 Provider、Prompt、策略或 Gold 判定的独立盲测记录表。

## 执行顺序

1. 事实守门员冻结 SKU 真值、候选原图 SHA-256、目标区域和禁止变化区。
2. 修正实现方仅接收“修正 Brief”；独立验收方不参与 Prompt 或候选选择。
3. 输出先经过现有 `repair-output-gate-v0.1` 的大幅构图漂移检查；通过只表示可进入人工复验，不能形成交付结论。
4. 盲测验收方按五个可观察结果分别给出 `PASS / CONDITIONAL_PASS / REWORK / REGENERATE / BLOCKED`，并留下可定位证据。不得以总分取代这些结果。
5. 仅在修正目标、SKU 一致性、人物身份、非目标漂移、交付可用性均可核验且人工终审签署后，才可进入 `READY_FOR_DELIVERY`。

详细定义见 `../../reports/REPAIR_BENCHMARK_SPEC.md`。
