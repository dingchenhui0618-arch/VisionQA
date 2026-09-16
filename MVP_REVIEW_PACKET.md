# VisionQA Agent Runtime MVP Review Packet

日期：2026-09-15。Verdict：`ACCEPT FOR LOCAL ENGINEERING LEARNING / PRODUCTION NOT READY`。

## 1. Original brief and success definition

- 用户请求：更新项目状态，并完成商品级上下文、图片版本树、模型调用账本、积分冻结/结算、有上限执行循环、Mock/真实 Provider 同接口。
- 目标用户：拥有商品真值和 AI 候选图的服饰电商美工、视觉负责人或运营。
- 最小旅程：登录本地 Mock → 建商品 → 加参考/候选 → 筛查 → 选图 → 一次有界修正 → 版本复验。
- 工程成功定义：六项核心能力有可复用契约、关键失败关闭、统一接口和自动化证据；Mock 浏览器链可复现。
- 约束：仅 localhost；不发布线上；不触发真实模型、支付或数据库迁移；密钥不进前端、日志或 Git。
- 排除：真实订阅价格、支付、线上迁移、真实模型效果、自动放行、跨品类。

## 2. Assumption register

- `VERIFIED`：现有 BetaService 已有幂等额度 hold/capture/release，真实修图要求用户确认并经过 Gate。
- `VERIFIED`：本轮新增核心模块与测试、浏览器 Mock 链、未执行数据库迁移文件。
- `SUPERSEDED_POLICY`：早期曾设想由 5.6 Sol 主导产品规划；现已明确 Sol/Luna 仅限研发、测试、独立审查和压力对抗。产品运行 Provider 当前为 DeepSeek + Qwen。
- `HYPOTHESIS`：对话式商品上下文能减少返工沟通并形成订阅价值。
- `SIMULATION`：报告中的用户反对意见和付费方式。
- `UNKNOWN`：真实单次成本、结果采用、客户愿付价格、复购、迁移后的生产可靠性。
- 最大风险假设：用户愿意为“可复验交付”持续付费，而不是只喜欢对话界面。

## 3. Team governance

| Agent | Admission proof | Scope/output | Acceptance | Integration |
| --- | --- | --- | --- | --- |
| Context/version Luna | 独立可复用资产；降低跨商品串线风险 | `product-context.ts`、`version-tree.ts` 与测试 | 7/7 pass | 已集成 Mock 投影与默认测试 |
| Runtime/ledger Luna | 并行缩短时间；降低重复调用/扣费风险 | runtime、ledger、settlement、bounded loop 与测试 | 11/11 pass | 已接入 Mock 与真实修图路由 |
| Customer discovery Luna | MVP 治理要求独立发现角色 | 模拟 Day 1 报告 | 标签和禁造事实检查通过 | 用于 `KEEP/CHANGE NOW/TEST NEXT/DEFER` |
| PostgreSQL transaction Luna | 与实现职责分离，专查并发、幂等和双状态源 | 只读事务审查 | 无新 CRITICAL；HIGH 项已修 owner fencing，API 接入继续阻断 | 未改代码，结论纳入状态文档 |
| Customer discovery Day 2 Luna | 独立验证持久化是否真能促进采用 | 模拟 Day 2 报告 | 保持 `SIMULATED / NOT CUSTOMER EVIDENCE` | 只形成待验证问题 |
| Primary orchestrator | 紧耦合集成关键路径 | API、迁移、文档、测试、浏览器验收 | 本文件所列 | 集成 owner |

拒绝的角色：独立 UI 设计 Agent（本轮无 UI 重构）；DevOps/部署 Agent（用户明确不动线上）；支付 Agent（无真实价格与支付授权）。

## 4. Implemented MVP

- 商品上下文：`web/lib/agent/product-context.ts`
- 图片版本树：`web/lib/agent/version-tree.ts`
- Provider 统一契约：`web/lib/agent/provider-runtime.ts`
- 模型调用元数据账本与本地恢复：`model-call-ledger.ts`、`runtime-registry.ts`
- Provider 派发幂等声明：`dispatch-claim-store.ts`；生产使用 PostgreSQL 唯一键先 claim，缺库失败关闭。
- 积分结算与有界循环：`credit-settlement.ts`、`bounded-agent-loop.ts`
- Mock 映射：`mock-runtime-adapter.ts`；Mock port 使用无网络统一 Runtime。
- 真实路由：`app/api/repair-attempts/route.ts` 使用同一 Runtime 和一次图片调用上限；客户额度仍由 BetaService 权威结算。
- 数据库准备：`db/pg/schema.ts`、`drizzle-pg/0003_agent_runtime.sql`、`drizzle-pg/0004_repair_transactions.sql`，以及事务型 `postgres-repair-repository.ts`。后者尚未切入生产 API。
- 统一组合根：`lib/beta/backend.ts`；客户页面/API 已全部接入，PostgreSQL adapter 尚未实现。迁移边界见 `docs/18_BETA_BACKEND_MIGRATION.md`。
- 部署：`NOT RUN`；线上未改变。

## 5. Reproduction guide

```powershell
Set-Location D:\VisionQA\web
npm run test:agent
npm test
npm run lint
$env:VISIONQA_AGENT_LOCAL='true'
npm run dev -- --port 6300
```

浏览器打开 `http://localhost:6300/login`，选择“直接体验 Mock”，建立商品并载入示例。清理仅限删除 Git 忽略的 `web/work/local-agent-state` 或浏览器站点数据；这是破坏性动作，不能由测试自动执行。

## 6. Test evidence

| Check | Result | Limitation |
| --- | --- | --- |
| `npm run test:agent` | 69/69 pass | 零网络；不证明模型质量或真实 PostgreSQL |
| `npm test` | 页面/Schema 31/31 + runtime/business 143/143 pass | 含构建；不证明真实数据库/Provider |
| `npm run lint` | exit 0 | 构建依赖仍有既有 direct-eval warning |
| migration sequence | 0000–0004 pg-mem pass；修图事务定向测试 5/5 | 未在真实 PostgreSQL 执行；API 尚未切换 |
| Browser Mock | 建商品→素材→筛查→V1→刷新恢复 pass | 仅桌面；Mock 图片未变化 |
| Real model | `NOT RUN` | 本轮明确禁止付费调用 |
| 390px mobile | `NOT RUN` | 下一轮补验 |

浏览器日志在构建/HMR期间出现一次旧时间戳的 Vite connection error；刷新后功能恢复，未观察到新时间戳错误。此项记录为开发热更新噪声，不宣称控制台绝对为零。

## 7. Customer discovery

见 `reports/SIMULATED_DAILY_DISCOVERY_AGENT_SUBSCRIPTION_DAY1.md` 与 `reports/SIMULATED_DAILY_DISCOVERY_AGENT_SUBSCRIPTION_DAY2.md`。两者均为 `SIMULATED / NOT CUSTOMER EVIDENCE`。

- `KEEP`：单商品事实→边界→确认→版本→人工终审。
- `CHANGE NOW`：动作、预计消耗、失败退回必须同时可见；Mock 持续明确标记。
- `TEST NEXT`：2–3 名真实从业者对照现有流程，记录时间、返工点、采用理由。
- `DEFER`：公开支付、月订阅价格、自动放行、跨品类。

## 8. Data feedback

当前真实捕获：模型调用元数据、额度 hold/capture/release、版本父链和人工确认。用户行为事件统一埋点仍为 `MISSING`。

| Event | Trigger | Metric | Proposed decision |
| --- | --- | --- | --- |
| `product_context_created` | 新建商品 | activation | 若真实参与者不能在 90 秒内完成，简化 intake |
| `repair_attempt_settled` | capture/release | technical success/failure | 失败率高则停止扩展套餐，先修 Provider 链 |
| `version_human_decided` | approve/reject | adoptable candidate rate | 低则调整修图边界，不增加自动重试 |
| `sku_task_completed` | 用户选版并取得文件 | task completion/time-to-value | 与现有流程对照决定 keep/change |
| `next_batch_requested` | 主动再次提交 | repeat intent | 仅与真实付款分开记录 |

阈值均为 `PROPOSED`，尚无测量基线。

## 9. Internal review

- `CRITICAL`：独立 QA 发现“外部调用后才记录幂等”可能导致重复 Provider 费用；已修复为调用前 PostgreSQL 原子 claim，重复 runtime 测试确认 executor 仅执行一次。
- `HIGH`：统一 backend seam 与 PostgreSQL 修图 repository 已实现，但完整 PostgreSQL backend 尚未实现；现阶段仍不能声称线上跨实例持久化或只冻结/结算一次。
- `HIGH`：独立 QA 发现版本树可形成多节点环、数据库可跨租户指向父版本；已补循环检测、商品 identity 参数和复合父链约束。
- `MEDIUM`：商品上下文/版本树在 Mock 为派生投影，正式 BetaService 尚未写入新表。
- `MEDIUM`：DeepSeek/Qwen 的真实成本与质量尚未完成本轮受控运行验证；Sol/Luna 不属于产品 Provider。
- `LOW`：开发构建期间 HMR 会留下旧 console 错误；刷新可恢复。

修复：真实 Qwen 修图经过统一 Runtime 和有界循环；Mock 使用无网络执行器；账本只接受受限标识和元数据；派发先 claim 后执行；迁移顺序与跨租户约束新增自动测试。

## 10. Claims-to-evidence matrix

| Claim | Evidence | Strength | Limitation | Verdict |
| --- | --- | --- | --- | --- |
| 六项核心契约存在并可测试 | 62 Agent tests | strong engineering | 未生产迁移 | supported locally |
| Mock/真实 Provider 同接口 | provider runtime tests + route source/build | strong contract | 真实调用未运行 | provisional runtime |
| 重复派发不会再次调用 Provider | shared-claim runtime test + PG unique constraint test | strong logic | 未做真实数据库崩溃测试 | supported locally |
| 失败不重复扣客户额度 | Beta tests + bounded-loop tests | partial | BetaService 尚未接生产事务库 | supported single-process only |
| 订阅适合市场 | simulated report | weak | 无客户付款 | unsupported |
| 5.6 Sol/Luna 参与产品运行 | 永久模型边界规则 | explicit prohibition | 仅允许研发与对抗测试 | not applicable / prohibited |

## 11. Cost and scope ledger

- 新付费模型、云资源、支付：0 次创建；真实调用 `NOT RUN`。
- 复用：现有 BetaService、Qwen Provider、Gate、Mock UI、Mastra 工作流和本地存储。
- 延后：生产 API repository 切换、订阅定价、支付、移动端和线上发布。

## 12. Security, privacy and dependencies

- 未读取 `.env`；变更与新文件的密钥模式扫描无命中。
- 模型账本不接受 Prompt、图片 byte payload 或秘密字段；仅保存计数和标识元数据。
- Mock data URL 仍只在浏览器 IndexedDB；正式图片继续由现有服务资产接口管理。
- Mastra/Vinext/Next 等既有依赖风险未在本轮升级；构建 direct-eval warning 来自 `gray-matter` 依赖。

## 13. External review questions

1. 从干净状态复现正常 Mock 链、一次模拟失败和跨商品写入攻击。
2. 检查真实修图路由在并发、进程中断和幂等重放下是否最多一次 Provider dispatch/一次 capture。
3. 在 staging 事务中验证三张新表的 tenant ownership、revision conflict 与回滚。
4. 质疑订阅积分是否比按批次服务更符合首批真实客户。

建议外部结论仅选：`accept for learning / accept with conditions / reject and revise`。

## 14. Cheapest next experiment

- 参与者：2–3 名真实服饰商品图返工人员。
- 动作：每人用一个获授权脱敏 SKU 同时走现有流程和本地 Agent 流程。
- 证据：完成时间、人工介入点、采用/返工/放弃理由、是否愿意提交下一批。
- 建议阈值：多数参与者能独立完成且没有额度/版本理解错误；这是 proposed，不是批准的商业门。
- 若失败：回到服务交付或简化问题定位，不上线订阅。
