# VisionQA 合成材质与一致性测试集 v0.1

冻结日期：2026-08-31。

本目录仅用于服饰电商商品图的内部工程流程验证。所有图片均为 AI 合成素材，人工标签按实际渲染画面冻结，不按生成 Prompt 的预期缺陷倒推。

## 规模与目录

- 3 个合成 SKU：针织开衫、真丝缎面吊带裙、原色牛仔夹克。
- 每个 SKU 含 1 张 1254×1254 四视角商品真值板。
- 每个 SKU 含 2 张 1254×1254 的 2×2 候选联系表。
- `candidates/`：从 6 张联系表按左上、右上、左下、右下机械切分得到的 24 张 627×627 独立候选。
- `candidate-labels.json`：SKU 锁定事实、来源象限、人工观察标签和内部预期路由。
- `candidate-overview.png`：24 张独立候选的切分与文件名复核总览。
- `files.sha256.csv`：冻结图片与标签文件的相对路径、SHA-256 和字节数；清单不包含 README 与自身，避免文本换行转换造成跨平台哈希漂移。

## 人工冻结时发现的生成偏差

- `SKU-KNIT-001_contact-sheet-a.png` 原计划包含一个 CONTROL，但四个画面都出现了五颗纽扣，因此该联系表没有有效 CONTROL；有效 CONTROL 为 `SKU-KNIT-001-C05`。
- `SKU-SATIN-001-C06` 原计划生成“缺肩带”缺陷，但实际仍有两条肩带，因此冻结为 `CONTROL_VARIATION / PASS`，不能把 Prompt 预期当成已发生的缺陷。
- 遮挡或裁切样本只建议进入 `CONDITIONAL_PASS` 并要求人工复核；局部徽章、刺绣或纽扣问题建议 `REWORK`；材质、颜色、重大结构和身份漂移建议 `REGENERATE`。
- `expected_route` 是人工定义的内部期望路由，不是 VisionQA 模型输出，也不是模型准确率证据。

## 证据边界

- `SYNTHETIC_INTERNAL_TEST_ONLY`
- `NOT_REAL_CUSTOMER_EVIDENCE`
- `NOT_MODEL_EFFECTIVENESS_EVIDENCE`
- `NOT_COMMERCIAL_EVIDENCE`
- `HUMAN_REVIEW_REQUIRED`
- `AUTO_PASS_DISABLED`

禁止把本测试集、工程运行结果或人工标签外推为真实客户采用、模型准确率、节省工时、商业成功或自动放行依据。本轮未触发付费诊断或生成式返工。
