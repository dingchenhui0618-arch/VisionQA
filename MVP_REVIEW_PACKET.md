# VisionQA 修图边界闭环 MVP Review Packet

日期：2026-08-27
状态：`LOCAL_SYNTHETIC_VERTICAL_SLICE_COMPLETE / ENGINEERING_VERIFIED / INDEPENDENT_QA_PASS / REAL_CUSTOMER_VALIDATION_NOT_RUN`

## 1. Original brief and success definition

- 目标客户：已有商品真值和 AI/真人模特图、需要在上架前减少 PS 返工的服饰电商美工与运营。
- 核心痛点：局部商品错误、人体异常和再次生成造成的非目标漂移。
- 最小旅程：载入真值与待修图 → AI 识别或用户描述 → 智能边界建议 → 用户确认 → 局修/重生成路由 → 前后对比 → 人工复验。
- 本轮成功定义：至少覆盖局修与重生成两类案例；大错不能进入局修；所有结论保留合成与人工终审边界。
- 排除：真实客户效果、自动放行、营销扩展、真实 AI 超分、正式账户和计费。

## 2. Assumption register

- `VERIFIED`：本地闭环、案例载入、边界路由和 UI 可运行。
- `USER-SUPPLIED`：美工会在 AI 图生成后进行 PS 返工，用户希望系统减少这一过程。
- `HYPOTHESIS`：清晰的问题边界和路由能减少 PS 收尾时间。
- `UNKNOWN`：真实客户一次修正成功率、节省分钟数、采用和付款。
- 最大风险：合成案例上的正确路由不能证明真实图片上的诊断或修图质量。

## 3. Team governance

| Agent | Admission proof | Output | Result |
|---|---|---|---|
| 基准案例策展 | 独立可维护契约并降低标签错误 | `agents/repair_benchmark_curator_v0.2.md` | PASS |
| 客户发现 | 与生产分离，防止把模拟当市场证据 | `reports/SIMULATED_DAILY_DISCOVERY_REPAIR_WORKFLOW_DAY2.md` | PASS |
| 独立 QA | 降低图像标签、路由和证据声明错误 | `agents/repair_library_independent_qa_v0.1.md` | 首轮 FAIL；修复后 2026-08-28 二次复验 PASS |

拒绝本轮新增营销 Agent、Agent 经理和六个常驻模型角色：它们不缩短核心图片闭环，也不降低当前主要风险。

## 4. Implemented MVP

- 合成素材与 manifest：`data/synthetic_repair_case_library_v0.1/`。
- 公共本地体验资源：`web/public/fashion/repair-library/`。
- 边界契约：`web/lib/visionqa/repair-boundary.ts`。
- 工作台接入：`web/app/workspace.tsx`、`web/app/workspace-repair.tsx`、`web/app/globals.css`。
- 测试：`web/tests/repair-boundary.test.ts`、`web/tests/rendered-html.test.mjs`。
- 部署状态：仅本地；公网版本未更新。

## 5. Reproduction guide

1. 在 `D:\VisionQA\web` 运行 `npm run dev -- --host 127.0.0.1 --port 3141`。
2. 打开 `http://localhost:3141/workspace` 并进入内部预览。
3. 展开左侧“缺陷案例库 · 5”。
4. 选择“小错 · 多一颗纽扣”，直接描述问题并进入修正；预期显示“局部修正”，可建立任务。
5. 选择“大错 · 额外手臂”，描述额外手臂并进入修正；预期显示“整体重生成”，建立局修任务禁用。
6. 清理：案例只写入现有本机 Project；可通过载入其他案例覆盖当前工作集。

## 6. Test evidence

- `npm run lint`：PASS，0 error。
- `npm test`：PASS；15 项页面/Schema/production 检查，118 项 TypeScript/runtime 测试。
- 浏览器：1280×720 和 390×844 无横向溢出；侧栏可滚动；合成图 1024×1536 正常载入；console 0 error。
- 未运行：真实 Provider 修图、真实客户素材、真实 AI 超分、客户采用与付款。

## 7. Customer discovery

Day 2 为明确标记的模拟报告，不是访谈事实。建议用真实参与者验证最近一次返工流程、实际往返次数、PS 分钟数、采用决定和预算责任人。详见 `reports/SIMULATED_DAILY_DISCOVERY_REPAIR_WORKFLOW_DAY2.md`。

## 8. Data feedback

- `case_loaded` → 激活率 → 判断测试者是否找到入口。
- `issue_path_selected`（AI/manual）→ 路径选择率 → 判断是否保留双入口。
- `boundary_decision_confirmed` → 60 秒内有理由决策率；`PROPOSED >=70%` → 保留当前边界呈现，否则简化文案。
- `repair_route_overridden` → 路由改判率 → 高于真实基线后调整规则或 AI 判断。
- `repair_candidate_adopted`、`ps_finish_minutes` → 采用与收尾时间 → 决定是否进入付费小批次。

## 9. Internal review

- 已修复 HIGH：案例展开后侧栏不可滚动，第三个以后按钮在 720px 视口不可点击。
- 首轮独立 QA 的 CRITICAL/HIGH 已关闭：L3 同义描述不可绕过冻结重生成策略；SC-001 使用单问题 v2；合成证据标签贯穿持久化、修正页和导出链。
- 已通过：小错开放局修；额外肢体关闭局修；缺真值失败关闭；Logo 走确定性资产合成；运行时案例元数据与 manifest 自动一致性检查。
- 残余风险：文本规则只能提供本地可解释基线，不能替代真实视觉模型定位；自动诊断仍可能漏检或假阳性；任务 JSON 缺少下载后解析 E2E；SC-002～005 不能作为严格单问题准确率数据集；truth 图暂无浏览器端 SHA Gate。

## 10. Claims-to-evidence matrix

| Claim | Evidence | Strength | Limitation | Verdict |
|---|---|---|---|---|
| 本地双入口和边界路由可运行 | tests + browser | strong | 合成案例 | supported |
| 大错不会建立局修任务 | unit test + browser | strong | 当前规则覆盖范围 | supported |
| ImageGen 案例代表真实缺陷分布 | synthetic assets | weak | 无客户样本统计 | unsupported |
| 产品能减少 PS 时间 | none | missing | 未做真实计时 | unsupported |
| 客户愿意付款 | none | missing | 未付款 | unsupported |

## 11. Cost and scope ledger

- 使用项目既有运行环境和内置 ImageGen；未调用项目中的 Qwen/DeepSeek API，未触发本轮 Provider 付费请求。
- 新增 5 张合成图、一个边界模块、少量工作台入口与测试；未扩展营销、账户、计费或云租户模块。

## 12. Security, privacy, and dependency notes

- 无客户私有图片进入案例库；无 API Key 写入代码、日志或文档。
- 本地案例离线载入；只有用户再次勾选发送授权并点击 AI 分析/改图时才可能调用外部 Provider。
- 自动放行关闭，人工终审必需。

## 13. External review questions

1. 大错/小错的路由语言是否让美工在 60 秒内做出有依据的决定？
2. 允许修改区和停止条件是否足够指导真实 PS 或生成式局修？
3. 真实 SKU 中哪些错误会让当前文本规则误判为局修？
4. 前后对比和四项人工复验是否足以支持上架责任人签署？

## 14. Cheapest next experiment

- 招募 3 名真实美工或运营，每人完成 2–3 个脱敏案例。
- 记录路径选择、60 秒内有理由决策、路由改判、PS 收尾分钟数和是否采用候选。
- `PROPOSED` 通过：至少 70% 案例在 60 秒内完成有理由路由，且没有把 L3 大错当局修交付。
- 若通过：进入一个获授权真实 SKU 的小批次；若失败：先调整问题语言、边界规则和视觉定位，不增加智能体数量。
