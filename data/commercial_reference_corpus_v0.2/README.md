# VisionQA 商业审美训练语料 v0.2

日期：2026-08-03

## 已完成

- 190 张真实商业素材全部进入脱敏 manifest；
- 小宇 87 张、枪王 103 张；
- 31 个拍摄/视觉组，拆分时保持整组进入同一集合；
- 7 张已经调用过 Qwen 的素材全部排除在盲测集之外；
- 13 张联系表已经生成，便于人工快速复核用途和分组；
- 原图未移动、未重命名、未修改。

## 用途分层

| 用途 | 数量 |
|---|---:|
| 审美参考 `AESTHETIC_REFERENCE` | 34 |
| 生活方式广告 `LIFESTYLE_CAMPAIGN` | 83 |
| 普通商品主图 `PRODUCT_MAIN_IMAGE` | 65 |
| 平台促销主图 `PLATFORM_PROMOTION_MAIN_IMAGE` | 5 |
| 非服饰商业素材 `OUT_OF_SCOPE_OTHER_COMMERCIAL` | 3 |

这些标签是基于联系表完成的第一轮项目内部视觉复核，不等于客户最终 Gold Label；人工评审员仍可改判。

## 数据拆分

| 集合 | 数量 | 用途 |
|---|---:|---|
| `TRAIN_REFERENCE` | 119 | 提示词校准、参考检索、未来训练候选 |
| `CALIBRATION_REVIEW` | 40 | 人工评分、阈值与权重校准 |
| `EVALUATION_HOLDOUT` | 31 | 锁定盲测，不得继续发送给模型 |

## 文件入口

- `training_annotation_template_v0.2.csv`：190 张完整标注模板；
- `group_manifest_v0.2.csv`：31 个拍摄组；
- `train_reference_manifest_v0.1.csv`：119 张训练参考；
- `calibration_human_review_v0.1.csv`：40 张人工校准表；
- `evaluation_holdout_lock_v0.1.csv`：31 张锁定盲测；
- `contact_sheets/`：13 张联系表。

## 当前 Gate

`DATA_SPLIT_READY / PLACEMENT_LABELS_PROVISIONAL / HUMAN_SCORES_PENDING / HOLDOUT_LOCKED / MODEL_TRAINING_NOT_STARTED`

