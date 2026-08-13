# 服饰电商 AI 模特商品图 Baseline 评测计划 v0.1

> 状态：设计草案，待真实客户素材验证  
> 适用标准：taxonomy v0.1、gates v0.1、evaluation-result schema 0.1.0  
> 重要声明：`simulation_manifest_v0.1.jsonl` 没有真实图片，只能用于流程、schema 和门禁单元测试，严禁作为真实准确率或 Go/No-Go 证据。

## 1. 评测问题

Baseline 需要分别回答：

1. 模型能否稳定观察到人类定义的问题？
2. 模型观察能否被 schema 正确解析？
3. 确定性规则引擎能否无歧义地产生门禁与决策？
4. 系统与双人标注及裁决 gold label 的一致程度如何？
5. 最危险的错误——把应拒绝图片判为 `PASS`——是否足够低？

模型观察层不得直接输出 `PASS / REVIEW / REJECT`；最终决策由版本化规则引擎产生。

## 2. 真实数据集设计

当前建议仅作为启动假设，样本量待真实素材可得性与统计功效验证。

### 2.1 数据来源

- 经客户或权利人授权的真实生产候选图；
- 对应商品标准图和 SKU 不可变项；
- 实际人工审核结论及返工原因；
- 可选：修复后版本与最终发布结果。

不使用来源、授权或参考商品不明确的网络图片作为商品忠实度 gold data。

### 2.2 覆盖要求

应覆盖 8 类 taxonomy、三种决策和边界样本：

- 商品忠实度；
- 人体完整性；
- 服装与材质；
- 摄影物理；
- 构图与商业表达；
- 文字与 Logo；
- 合规；
- 可评估性。

数据应同时包含无缺陷、单缺陷、多缺陷、疑似缺陷和信息不足 case。各类最低样本量、严重度分布和品类占比均待验证。

### 2.3 切分策略

建议按组切分，而非随机按图片切分：

- development：用于 rubric 校准、提示词迭代和错误分析；
- validation：用于阈值选择与版本比较；
- test：冻结盲测，仅在候选版本确定后运行；
- future holdout：后续真实生产时间段，检查漂移。

同一 SKU、商品拍摄参考、人物身份、生成批次、Prompt 模板和近似图不得跨 split。建议比例待真实数据规模验证，v0.1 不锁定固定比例。

## 3. Baseline 运行

每个候选系统版本需冻结并记录：

- code version；
- dataset version；
- taxonomy / gates / prompt version；
- provider adapter version；
- provider 返回的 model snapshot；
- configuration hash；
-输入资产 SHA-256；
- 原始模型响应引用；
- latency、attempt count 和 cost。

对每个 test case 重复运行若干次，重复次数待成本与方差验证。重复运行时：

- 保持图片、参考材料、Prompt 和配置不变；
- 分别统计 observation、严重度、gate 和 decision 的运行间一致性；
- 不选择“最好的一次”作为结果；
- provider error、timeout 和 invalid output 单独计入可靠性，不得静默重试后隐藏。

## 4. 指标

### 4.1 标注质量

- A/B 最终决策一致率；
- Cohen's κ：`PASS / REVIEW / REJECT`；
- 各 issue code 的一致率；
- 严重度加权 κ；
- 裁决率与“标准不足”率；
- 同一标注员重复 case 的稳定性。

### 4.2 模型观察层

- Blocker issue recall；
- Major issue recall；
- issue-level precision / recall / F1；
- category macro-F1；
- 严重度一致率与加权 κ；
- 证据区域可核验率；
- schema-valid rate；
- unreadable / timeout / invalid-output rate。

### 4.3 决策与门禁

- 三分类混淆矩阵；
- decision macro-F1；
- `REJECT → PASS` 危险误放率；
- `REVIEW → PASS` 误放率；
- `PASS → REJECT` 过度拒绝率；
- 各硬门禁 recall；
- scope 缺失时错误输出 `PASS` 的比例；
- Blocker 被总分抵消次数，目标必须为 0。

### 4.4 稳定性与运营

- 同 case 重复运行 decision 一致率；
- issue 集合 Jaccard；
- 分数方差，仅用于解释；
- p50 / p95 latency；
- 单图成本；
- 重试率和供应商错误率。

### 4.5 业务指标

- 系统 `PASS` 后实际人工返工率；
- 审核时长变化；
- 人工 `REVIEW` 工作量变化；
- 修复建议采纳后复检通过率。

业务指标必须来自真实工作流，不得从模拟 case 推导。

## 5. Go / No-Go 框架

以下门槛全部标记为 **待真实客户素材验证**。在完成 gold set、盲测和阈值标定前，不给出已验证的数值承诺。

### Go：进入受控人工辅助试点

需同时满足：

- schema 与规则引擎单元测试通过；
- Blocker 不可被软评分抵消，发生次数为 0；
- 双人标注的一致性达到经验证门槛；
- Blocker recall 达到经验证门槛；
- `REJECT → PASS` 危险误放率低于经验证门槛；
- 重复运行 decision 稳定性达到经验证门槛；
- 所有 `PASS` 在试点期仍按经验证抽检比例复核；
- 失败、超时、信息不足默认进入 `REVIEW`，不静默 `PASS`。

### No-Go：不得进入自动发布

出现任一情况：

- 没有真实授权素材与 gold label；
- test 集参与了提示词或规则调优；
- 任一 Blocker 能被总分或其他高分抵消；
- scope 不足时仍自动 `PASS`；
- 危险误放、Blocker 漏检或运行不稳定超出待验证门槛；
- 无法复现 model snapshot、Prompt、规则或数据版本；
- 用模拟 case 指标宣称真实准确率或商业效果。

### 自动发布

v0.1 不支持自动发布结论。是否开放自动发布，必须在真实客户试点后由产品负责人、创意总监、测试负责人及合规责任人共同批准；其数值阈值、抽检方案和回滚规则均待验证。

## 6. 首轮执行顺序

1. 用 12 条模拟 case 验证 JSONL、issue code、门禁分支和 schema 流程。
2. 收集首批获授权真实素材及参考资料。
3. 双人独立标注，完成分歧裁决并冻结 gold set。
4. 在 development 上校准 rubric 和 Prompt。
5. 在 validation 上选择候选版本与待验证阈值。
6. 冻结版本后运行 blind test，并保留全部失败。
7. 达标后仅进入受控人工辅助试点；未达标则 No-Go 并按错误类别迭代。

