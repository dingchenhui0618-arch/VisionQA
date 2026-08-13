# VisionQA 商业审美参考语料 v0.1

日期：2026-08-03

## 规模

- 总资产：190
- 小宇：87
- 枪王：103
- 权利状态：190/190 已由用户确认可用于 VisionQA 训练、校准、评测和阿里云受控调用
- 当前真实模型暂定标签：5
- 当前人工 gold label：0

## 文件

- `corpus_manifest.csv`：脱敏资产清单，不包含原始文件名和绝对路径
- `corpus_summary.json`：数量与标签状态摘要

## 当前用法

这 190 张图目前是“商业审美参考语料”，不是已经完成训练的 ground truth。进入训练或评分校准前，需要补充两类人工标签：

1. `intended_placement`：摄影参考、生活方式广告、商品主图、平台促销主图或详情页；
2. 四层 Skill 与六项商业指标的人类复核分数。

拆分必须按拍摄系列/视觉近重复分组，不能随机按单张图片切分，否则同一组相似图可能同时进入训练集和测试集，造成评测泄漏。

## 当前状态

`RIGHTS_READY / MANIFEST_READY / MODEL_CANARY_READY / HUMAN_LABELS_PENDING / TRAINING_NOT_STARTED`

