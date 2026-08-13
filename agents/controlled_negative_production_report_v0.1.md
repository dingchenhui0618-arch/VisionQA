# Controlled Negative Production Agent 报告 v0.1

## 职责

只对外部审查 `ACCEPT` 的 8 项计划制作单变量商业 LOW 受控变体，并保证事实锁定、来源可追溯、输出可审计。

## 输入

- 外部决定：`D:\VisionQA\handoffs\MVP_EXTERNAL_REVIEW_v0.1\external_review_decisions.csv`
- 变体计划：`D:\VisionQA\handoffs\controlled_negative_plan_review_v0.1\proposed_variants.csv`
- 外审清单：`D:\VisionQA\handoffs\controlled_negative_plan_review_v0.1\external_review_checklist.md`
- 授权清单：`D:\VisionQA\datasets\commercial_template_seed_v0.1\manifest.json`
- 8 个父 JPG 及对应 RAR/PSD 源文件

输入基线 hash：

- `proposed_variants.csv`: `A0C5183B2AC2ECCC241238780379EA794FF7D918807C7DD92171C8156BE7552E`
- `external_review_decisions.csv`: `9C191335594EA4A517D17B169441F070924183F4032C8F2695685C7A4F6FFF38`

## 输出

- `D:\VisionQA\datasets\commercial_controlled_negatives_v0.1\production_manifest_v0.1.csv`
- `D:\VisionQA\datasets\commercial_controlled_negatives_v0.1\visual_qa_report_v0.1.md`

没有输出变体图片或 contact sheet。状态为：

- `0 PRODUCED`
- `7 TOOLING_BLOCKED`（CN-001 至 CN-007）
- `1 PLAN_REWORK_REQUIRED`（CN-008）

## 验收结果

| 验收项 | 结果 | 说明 |
|---|---|---|
| 8 个 parent/variant 唯一 | BLOCKED | 8 个 parent 唯一，但没有合规 variant |
| 每张只有一个主要失败 | BLOCKED | imagegen 无法保证未编辑区域不变 |
| 不新增商品、价格、优惠或品牌事实 | PASS_BY_NON_EXECUTION | 未生成图片，未产生事实漂移 |
| CN-007 促销组至少 50% 可见 | BLOCKED | 未执行，不得假定通过 |
| 保持其余锁定项 | PASS_BY_NON_EXECUTION | 原图未修改 |
| 原图不修改 | PASS | hash 已记录，原文件未覆盖 |
| 外部审查可直观看懂 | BLOCKED | CTO checkpoint 要求停止新增工作，未制作 contact sheet；没有伪造 variant |
| imagegen 无法保证时停止 | PASS | 8 行均在生成前停止 |

## 技术判断

所有计划均要求 PSD 图层或文本图层级编辑。内置 imagegen 不提供 PSD 图层、文本图层、显式蒙版和精确几何参数，不能保证中文文案、价格数字、人物、商品与背景逐像素锁定。依照任务硬规则，生成式尝试本身将违反受控实验的单变量原则，因此未调用 imagegen。

CN-008 不是 imagegen 工具阻塞，而是独立的计划事实错误：CT-014 父图中不存在“右下角立即购买”CTA，需要计划 Agent 与外审重新指定目标。

## 2026-07-29 协议修订 v0.1.2

已完成计划层修订，未生成或修改图片：

- 新包：`D:\VisionQA\handoffs\controlled_negative_plan_review_v0.2\`；
- 包状态：`AWAITING_EXTERNAL_REREVIEW`；
- v0.1.1 原件保留且未覆盖；
- CN-008 parent 从不存在 CTA 的 CT-014 改为 CT-011；
- CT-011 原图右下价格卡内可见白色胶囊形“立即购买 >>”按钮，证据 bbox 约为 `[592,742,187,43]`（800×800）；
- CN-008 单变量改为只降低 CTA 文字与按钮底色的局部对比度，不再移除未经证实的描边；
- CN-005 增加 bbox 面积比、主导文字高度比、WCAG 对比度、间距和优惠事实 token 锁定容差；
- CN-006 增加两优惠组面积比、文字高度比、对比度、对齐间距、零复制和优惠事实 token 锁定容差；
- 重新外审只需查看 CN-005、CN-006、CN-008。

现有执行台账不因提案修订自动改变：CN-001–CN-007 仍为 `TOOLING_BLOCKED`，CN-008 仍为 `REWORK_REQUIRED`。重新外审通过后也仍需 PSD 图层级精确编辑能力，不能直接进入制作通过状态。

## 建议交给 CTO 的下一步

- 将 CN-001 至 CN-007 路由给具备 Photoshop/PSD 图层能力的受控制作 Agent；
- 将 CN-008 路由回计划 Agent，先完成 REWORK 和外部重新批准；
- 在 PSD 输出后安排独立 Dataset QA Agent 做像素差异、OCR、几何比例和视觉审查；
- 在全部通过前，不把本批次计入 LOW gold、模型准确率或对外演示数据。
