# VisionQA Qwen—人工校准报告 v0.1

## 结论

40/40 张真实调用成功；38 张形成完整综合分，2 张审美参考因商业维度整体不适用保持 PARTIAL。模型当前**不能自动放行**：Gate 一致率仅 32.5%，且有 26 张人工 REVIEW 被模型判为 PASS。

在 38 张可比分数中，模型平均高估 +3.84 分，MAE 6.18，RMSE 6.56；仅 8/38 落在 ±5 分内。

因此当前 Gate 冻结为 `HUMAN_REVIEW_REQUIRED`，不启用 ≥90 自动发布。下一轮应优先压低模型的宽松高分倾向，再进行盲测。

## Gate 混淆

- 人工 `PASS` → 模型 `PASS`：2 张
- 人工 `REVIEW` → 模型 `PASS`：26 张
- 人工 `REVIEW` → 模型 `REJECT`：1 张
- 人工 `REVIEW` → 模型 `REVIEW`：11 张

## 分项偏差

| 维度 | 可比 n | Bias | MAE | 模型多评 | 模型漏评 |
|---|---:|---:|---:|---:|---:|
| human_realism | 39 | 1.13 | 2.1 | 1 | 0 |
| photography_realism | 40 | 3.75 | 4.3 | 0 | 0 |
| material_realism | 40 | 0.3 | 4.9 | 0 | 0 |
| product_prominence | 38 | 0.47 | 9.89 | 0 | 0 |
| selling_point_clarity | 38 | -1.05 | 7.53 | 0 | 0 |
| promotion_hierarchy | 0 | — | — | 0 | 0 |
| information_legibility | 0 | — | — | 7 | 0 |
| click_motivation | 38 | -1.0 | 5.21 | 0 | 0 |
| channel_placement_fit | 38 | 1.95 | 8.05 | 0 | 0 |

`模型多评` 表示人工标为不适用但模型仍给分；`模型漏评` 表示人工给分但模型未形成分数。

## 最大总分偏差

- `xiaoyu/f97a128ca11fabfb.jpg`（PRODUCT_MAIN_IMAGE）：人工 85，模型 94.9，偏差 +9.9。
- `xiaoyu/9e690314ff1924c2.jpg`（PRODUCT_MAIN_IMAGE）：人工 86，模型 95.2，偏差 +9.2。
- `xiaoyu/0bf3f0ede1c1bd25.jpg`（PRODUCT_MAIN_IMAGE）：人工 86，模型 94.9，偏差 +8.9。
- `gwang/296052292aabccea.jpg`（LIFESTYLE_CAMPAIGN）：人工 86，模型 94.3，偏差 +8.3。
- `gwang/097016ff681bb16a.jpg`（LIFESTYLE_CAMPAIGN）：人工 86，模型 94.3，偏差 +8.3。
- `xiaoyu/ecec16fd33eb390a.jpg`（LIFESTYLE_CAMPAIGN）：人工 85，模型 93.2，偏差 +8.2。
- `xiaoyu/eee4ad0ed3a25c31.jpg`（PRODUCT_MAIN_IMAGE）：人工 86，模型 94.2，偏差 +8.2。
- `gwang/5c4f2eb9962a5460.jpg`（LIFESTYLE_CAMPAIGN）：人工 86，模型 94.1，偏差 +8.1。

## 校准动作

1. 保持四 Skill 权重 25/20/20/35 和 90/70 阈值不变，先校准模型评分尺度，避免同时改权重和阈值造成不可解释漂移。
2. 在模型提示词中加入这 40 张人工分布的严格锚点：优秀商业实拍通常位于 82–91，不因画面漂亮默认给 95+。
3. 对 `LIFESTYLE_CAMPAIGN` 单独增加高分约束；该用途是本轮主要高估来源。
4. 修正信息可读性的适用性判断：无叠加商业信息时必须 `NOT_APPLICABLE`，不得把衣服印花或场景文字当促销信息。
5. 校准后重跑同一 40 张；达到总分 MAE ≤5、Gate 一致率 ≥80%、错误 PASS ≤2 张，才允许进入 31 张锁定盲测。

## 费用与运行证据

- 模型：`qwen3-vl-plus-2025-12-19`
- 输入/输出 tokens：93181 / 46678
- 平均延迟：29.5 秒/张
- 本批次只记录 token 与调用证据；实际账单金额以阿里云控制台为准，不在本地臆测。
