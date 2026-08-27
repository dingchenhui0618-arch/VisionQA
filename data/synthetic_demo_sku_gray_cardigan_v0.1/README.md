# SYN-VQA-GRAY-CARDIGAN-001

> `SYNTHETIC_INTERNAL_TEST_ONLY` — 由内置 ImageGen 生成，只用于 VisionQA 端到端测试，不代表真实客户、在售 SKU、模型准确率或商业采用。

## 测试目标

验证 VisionQA 是否能从商品真值发现并修正 AI 模特图中的重复刺绣，同时保持人物、全身构图、服装结构与非目标区域。

## 文件

- `product-truth-grid.png`：四宫格 SKU 真值，1254×1254。
- `ai-model-draft-controlled-defect.png`：受控错误模特图，1024×1536。
- `sku-facts.json`：可机读商品事实、不变量与预期问题。
- `qwen3-repair-candidate-v0.1.png`：人工确认问题后由 Qwen Image 3.0 Pro 生成的修正候选。
- `before-after-v0.1.png`：黑白灰前后对比交付图。

## 唯一受控错误

商品真值只有穿着者左胸一枚黑色五瓣花刺绣。待修模特图在穿着者右胸多出一枚复制刺绣；其余商品结构应保持不变。

## ImageGen 输入角色

- 商品真值：全新生成的 SKU 参考图。
- 待修模特图：以前述商品真值为参考生成，额外加入一枚错误刺绣。

两次均使用 Codex 内置 ImageGen，不使用外部 OpenAI API Key。

## 闭环结论

- 自动诊断经过“权威真值 + 结构化 SKU 事实”改进后识别到右胸多余刺绣，但仍产生左胸正确刺绣缺失等假阳性，不能自动决定修图。
- 人工确认问题后，Qwen Image 3.0 Pro 成功删除右胸错误刺绣并保留左胸正确刺绣、四颗纽扣和全身构图。
- 状态为 `HUMAN_REVIEW_CANDIDATE`，不是客户可交付或模型准确率证据。
