# 商业模板评测协议 v0.2

> v0.2 修正 v0.1 的字段不一致和等级阈值缺失问题。

## 强制字段

所有评审者必须使用：

1. `assessability`
2. `product_subject_prominence`
3. `selling_point_clarity`
4. `promotion_hierarchy`
5. `mobile_readability`
6. `click_motivation`
7. `placement_fit`
8. `fit_score`
9. `fit_level`
10. 优势、差距、证据与置信度

禁止用 `visual_attraction`、`brand_consistency` 或 `conversion_readiness` 替代正式六项指标。

## 固定权重

```text
fit_score =
product_subject_prominence × 0.25
+ selling_point_clarity × 0.20
+ promotion_hierarchy × 0.20
+ mobile_readability × 0.15
+ click_motivation × 0.10
+ placement_fit × 0.10
```

`fit_level` 必须由总分自动推导：

- 90–100：HIGH
- 70–89：MEDIUM
- 0–69：LOW

## 适用性优先

- 核心商品区域为空 → `NOT_ASSESSABLE`，不评分；
- 图片完整但更适合其他渠道 → `NOT_APPLICABLE`，不评分；
- 只有 `APPLICABLE` 图片进入六项评分。

## 分歧处理

自动触发证据裁决：

- 适用性不一致；
- 等级跨越两个档位；
- 总分绝对差 >15；
- 任一子项绝对差 >20；
- 双方证据直接矛盾。

未触发强制裁决时，可用两位评审的同口径子分共识中心形成 Phase 1 标签，但必须同时保存两份原始评分。

## 通过条件

- 总分 MAE ≤10；
- 总分 Spearman ρ ≥0.75；
- 可评估性 Cohen's κ ≥0.80；
- HIGH、MEDIUM、LOW 与不可评分样本均有覆盖；
- 原始评分、裁决证据和共识标签全部可追溯。

窄分布样本即使 MAE 达标，也不能单独验证排序能力或自动候选阈值。

