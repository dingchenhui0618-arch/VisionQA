# VisionQA 人工校准评分验收报告 v0.1

- 验收状态：`PASS_WITH_GATE_NORMALIZATION`
- 完整性：40/40，唯一素材 40 张
- 评审状态：{'COMPLETED': 40}
- 综合分：82–91，平均 86.58
- 原始人工决定：{'PASS': 40}
- 按产品阈值归一化：{'PASS': 2, 'REVIEW': 38}

## 关键处理

原表有 38 行 `human_decision` 与产品 Gate（≥90 PASS、70–89 REVIEW、<70 REJECT）不一致。原始决定没有被覆盖；Gold 文件同时保留 `human_decision_raw`，并新增 `threshold_gate_decision` 作为系统运行 Gate。

这些素材仍可全部作为客户确认的优秀正向审美参考；但“优秀参考素材”不等于“在指定图位自动通过”。训练语义与上线 Gate 已分离。

人工填写的 `overall_score` 被视为评审员综合判断并保留。`formula_overall_score` 仅作为 25/20/20/35 权重核查列，不回写覆盖人工分；非适用商业子项按剩余适用权重归一化。

## 验收问题

- 无阻断性数据错误。

## 输出

- Gold：`D:\VisionQA\data\commercial_reference_corpus_v0.2\gold_labels_calibration_v0.1.csv`
- 统计：`D:\VisionQA\data\commercial_reference_corpus_v0.2\calibration_statistics_v0.1.json`
