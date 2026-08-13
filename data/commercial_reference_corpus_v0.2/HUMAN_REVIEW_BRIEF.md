# VisionQA 人工校准评审 Brief v0.1

本轮只评 `calibration_human_review_v0.1.csv` 中的 40 张，不需要一次评完 190 张。

## 评审顺序

1. 先确认 `intended_placement` 是否符合图片真实用途；
2. 再填写真人、摄影、材质三个 Skill 分数；
3. 根据具体用途填写六项商业分数，不适用项保持空并写明 `NOT_APPLICABLE`；
4. 给出人工决策：`PASS / REVIEW / REJECT`；
5. 填写 `reviewer_id` 并把 `review_status` 改为 `COMPLETED`。

## 评分原则

- “客户正在使用、审美优秀”可以作为摄影与审美正向先验；
- 不允许因为图片漂亮，就在不匹配的版位上给高商业分；
- 生活方式广告不要求具备促销价格层级；
- 普通商品主图不应因缺少促销文案被扣成低分；
- 只有 `PLATFORM_PROMOTION_MAIN_IMAGE` 才完整适用促销层级和价格信息指标；
- 非服饰商业图保持 `OUT_OF_SCOPE_OTHER_COMMERCIAL`，不进入服饰评分训练。

## 验收

- 40/40 用途已确认；
- 适用分数没有空值；
- 不适用项明确标记；
- Gate 与分数区间一致，确定性 blocker 可覆盖分数；
- 评审员签名完整。

