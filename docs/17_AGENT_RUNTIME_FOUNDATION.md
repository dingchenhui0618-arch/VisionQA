# VisionQA 单商品智能体运行内核 v0.1

日期：2026-09-15。范围：本地原型与生产代码准备；本文件不代表线上部署、真实模型质量或订阅商业验证。

## 1. 单一执行链

`商品对话 → 结构化上下文 → 规划 → 用户确认 → Provider Runtime → 基础 Gate → 版本树 → 人工确认 → 交付/下一轮`

每个对话只属于一个商品。模型输出不能更换商品身份、扩大数据用途、提高额度或取消 Gate。

## 2. 六项核心能力

1. **商品级对话上下文**：`product-context.ts` 保存固定身份、SKU facts、已选素材、任务状态、摘要和 revision；结构化 patch 使用乐观并发校验。
2. **图片版本树**：`version-tree.ts` 保存 original/repair parent-child lineage、当前版本及逐版本人工确认；新版本确认始终为空。
3. **模型调用账本**：`model-call-ledger.ts` 只保存调度元数据，不保存 Prompt、图片字节或凭据，并拒绝自由文本、密钥与 URL 型 request identifier。本地通过 `runtime-registry.ts` 原子快照持久化；生产由 `model_call_ledger` 表承接。
4. **积分冻结与结算**：客户生产语义继续由 BetaService 负责；通用 `credit-settlement.ts` 固定 `AVAILABLE → HELD → CAPTURED / RELEASED` 并验证幂等。
5. **有上限执行循环**：`bounded-agent-loop.ts` 分别限制文本步骤、图片调用和总尝试；图片必须显式确认，失败立即停止，不做无界递归。
6. **统一 Provider 接口**：`provider-runtime.ts` 让 Mock 与真实注入执行器返回同一 result/error contract。外部执行前先通过 `dispatch-claim-store.ts` 取得租户级幂等派发权；重复任务只查询原任务，不再次调用 Provider。Mock 不联网；真实 Qwen 修图由服务端注入执行器，密钥不进入请求 DTO 或前端。

## 3. 模型组织策略

- 研发与独立审查策略：`gpt-5.6-sol`、`gpt-5.6-luna` 仅用于系统开发、测试、独立审查和压力对抗，不属于 VisionQA 产品运行 Provider。
- 产品运行时只使用已批准的国内模型：当前文字规划由 DeepSeek 承担，视觉理解与图像修正由 Qwen 承担；未来 Seedance 必须单独通过数据范围、预算、能力和 Provider Gate 后才能接入。
- 任何模型替换必须通过同一 Provider Runtime，记录模型快照、调用状态和成本，并保持用户积分语义不变。

## 4. 调用与积分口径

- 文本规划、筛查、图片生成分别记真实调用事件。
- 发起客户修图时先冻结 1 次；有效候选通过基础 Gate 后捕获；技术失败或 Gate 拦截释放。
- 同一个 idempotency key 不能携带不同请求内容；未知结果先查询原任务，不自动重新发送。
- 用户主动发起下一版本属于新动作；系统技术重试不应形成第二次客户扣费。

## 5. 存储与部署边界

- 浏览器 Mock 继续保存在独立 IndexedDB，映射到统一上下文/版本契约时使用 `mock-*` 身份并明确 `MOCK_ONLY`。
- 本地模型调用元数据进入 Git 忽略的 `web/work/local-agent-state/model-call-ledger.json`。
- `drizzle-pg/0003_agent_runtime.sql` 与 `drizzle-pg/0004_repair_transactions.sql` 均为未在真实数据库执行的迁移；应用前必须在 staging 备份、迁移、回滚和租户隔离检查中验证。`0003` 包含派发与版本父链约束，`0004` 补齐修图 request fingerprint、执行 claim、输出资产归属、活动任务唯一约束与额度事务所需字段。
- `postgres-repair-repository.ts` 已实现 begin / claim / capture / release / interrupted recovery；钱包、hold 和 attempt 在同一事务中条件更新，任一不一致即回滚。capture 需要匹配 claim 时的 execution owner，旧 Worker 不能结算新结果。数据库测试已覆盖重复动作、双 Worker 竞争与崩溃恢复语义，但 API 尚未切换到该 repository。
- 生产派发必须使用 PostgreSQL 原子 claim；没有 `DATABASE_URL` 时真实 Provider 路由失败关闭。开发环境共享内存 claim 只用于本机进程测试，不作为跨进程耐久证据。

## 6. 当前验收和未完成项

- 已验证：上下文、版本树、统一运行时、模型账本、积分状态机、有界循环、Mock 映射、真实修图路由构建。
- 未验证：真实 PostgreSQL 迁移、API 到生产 repository 的切换、真实进程崩溃中间态、真实 Provider 成本回填、浏览器真实修图结果、移动端、线上部署、订阅支付。
- 订阅额度必须基于真实 Provider 账单和修图成本 P90 决定；当前只保留积分机制，不发布价格。
