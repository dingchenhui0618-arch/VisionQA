# VisionQA 第五阶段收口与新对话交接

日期：2026-08-28
仓库：`D:\VisionQA`
Web：`D:\VisionQA\web`
分支：`codex/visionqa-phase3-qwen`

## 新对话先读什么

只需按顺序读：

1. [`PROGRESS.md`](../PROGRESS.md) 的“0. 当前状态与唯一目标”；
2. 本文件；
3. 需要追溯证据时再读 [`MVP_REVIEW_PACKET.md`](../MVP_REVIEW_PACKET.md) 和 [`agents/repair_library_independent_qa_v0.1.md`](../agents/repair_library_independent_qa_v0.1.md)。

不要先通读历史阶段文档，也不要从 C 盘旧原型恢复产品事实。真实应用仍是 `D:\VisionQA\web`。

## 当前结论

- 产品定位：服饰电商 AI 模特图修正与交付工作台。
- 第五阶段交付：5 例合成缺陷案例、AI/人工双入口、冻结边界策略、局修/重生成 Gate、人工复验与反馈指标设计。
- 工程结论：本地可复现并通过完整测试、浏览器验收与独立 QA 二次复验。
- 证据结论：只支持“内部学习闭环可运行”；不支持模型准确率、真实节省工时、客户采用或愿意付款。
- 当前 Gate：`ENGINEERING_VERIFIED / SYNTHETIC_INTERNAL_TEST_ONLY / HUMAN_REVIEW_REQUIRED / AUTO_PASS_DISABLED / REAL_CUSTOMER_VALIDATION_NOT_RUN / MARKET_HOLD`。

已知非阻断风险：任务 JSON 尚无下载后解析 E2E；SC-002～005 包含已声明双刺绣基线，不能报告单问题准确率；truth 图尚未在浏览器载入时单独执行冻结 SHA Gate。

## 下一目标

停止新增功能，执行最便宜的真实学习实验：

- 找 3 名真实服饰电商美工或运营；
- 每人完成 2–3 个脱敏案例；
- 记录是否在 60 秒内完成有理由路由、是否改判系统策略、PS 收尾分钟数、是否采用候选、是否愿意提交一个获授权真实 SKU；
- 拟议通过线：至少 70% 案例在 60 秒内完成有理由路由，且 L3 大错零误入局修；
- 通过后只进入 1 个获授权真实 SKU 的小批次，不直接建设公开 SaaS、计费、云租户或更多 Agent。

## 新对话可直接使用的开场指令

> 继续 VisionQA。先读 `D:\VisionQA\handoffs\PHASE_5_CLOSURE_HANDOFF_2026-08-28.md` 和 `PROGRESS.md` 第 0 节，不通读旧对话。当前不新增功能，先把 3 名真实美工/运营的脱敏案例测试准备成可执行记录，并严格区分合成、工程、客户采用和付款证据。

## 不要做

- 不扩展服饰以外品类；
- 不恢复批量打分器定位；
- 不把合成案例或模拟发现写成真实客户结论；
- 不自动放行、自动发布或承诺增长结果；
- 不未经确认外发客户图片、启用付费调用或处理 Key；
- 不覆盖 `web/aliyun-fc/src/dependency-loader.mjs`、`deploy/`、`web/artifacts/` 的既有未归属内容。
