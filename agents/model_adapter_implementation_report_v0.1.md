# VisionQA MVP 模型 Adapter 实现报告 v0.1

> 角色：AI 模型 Adapter 实现 Agent  
> 日期：2026-07-29  
> 范围：Provider-neutral 边界、Fixture、首个真实 Provider 代码路径、确定性编排与测试  
> 未做：D1/R2、平台 API、真实付费调用、模型/供应商采购决策

## 1. 职责、输入、输出与验收

### 职责

在 v0.3 契约上建立模型观察层与 VisionQA 决策层之间的安全边界。模型只提供
有证据的观察草稿，项目规则负责权重、分数、Gate 和修复 Prompt，确保
Provider 更换不会改变业务规则。

### 输入

- `agents/technical_architecture_lead_mvp_plan_v0.1.md`
- `agents/data_evaluation_lead_mvp_plan_v0.1.md`
- `agents/contract_rules_implementation_report_v0.1.md`
- `contracts/evaluation-result-v0.3.schema.json`
- `web/lib/visionqa/contracts.ts`
- `web/lib/visionqa/rules.ts`

### 输出

- `web/lib/visionqa/providers/types.ts`
- `web/lib/visionqa/providers/fixture.ts`
- `web/lib/visionqa/providers/openai.ts`
- `web/lib/visionqa/providers/factory.ts`
- `web/lib/visionqa/providers/orchestrator.ts`
- `web/lib/visionqa/providers/index.ts`
- `web/lib/visionqa/providers/README.md`
- `web/tests/model-adapter.test.ts`

## 2. 实现结论

### 2.1 Provider-neutral 接口

`VisionProviderAdapter.evaluate(input, signal)` 只返回
`ProviderObservationEnvelope`：

- provider / adapter / model snapshot；
- provider request id、延迟和 token 用量；
- warnings；
- observations、三个客观 Skill 草稿、六项商业草稿、人工核验项。

Adapter 不接受“最终决策”职责，也不直接写 D1/R2 或调用平台 API。

### 2.2 确定性编排

`orchestrateVisionEvaluation` 依次执行：

```text
Provider Adapter
→ Provider 草稿结构校验
→ 固定商业六项权重
→ 商业贴合分重算
→ 四大 Skill 综合分重算
→ Blocker / 阈值 Gate
→ 来源关联 Repair Prompt
→ evaluation-result v0.3 runtime validation
```

Provider 返回的权重、总分、分档或 Gate 即使存在也不会被消费。最终结果始终
使用项目的 `contracts.ts` 与 `rules.ts`。

### 2.3 证据不足降级

- 非空分数必须有至少一条非空 evidence。
- evidence 缺失时不创建替代文本，不继承 Provider 分数。
- 对应分数变为 `null`，整体状态为 `PARTIAL`，综合分为 `null`。
- Gate 由确定性规则变为 `REVIEW`。
- `required_human_checks` 增加“模型证据不完整，必须人工复核”。

### 2.4 超时、重试与错误

- 单次默认超时：35 秒。
- 默认最多 3 次尝试（首次 + 2 次重试）。
- 网络失败、429、5xx、超时：指数退避并带抖动。
- 配置、认证、无效输出、上游取消：不重试。
- 稳定错误码：
  `CONFIGURATION / AUTHENTICATION / RATE_LIMITED / TIMEOUT / NETWORK /
  PROVIDER_UNAVAILABLE / INVALID_OUTPUT / ABORTED`。

### 2.5 Fixture

默认 `VISION_PROVIDER` 为空时使用 Fixture：

- 不访问网络；
- 不需要密钥；
- 不产生费用；
- 输出包含 `FIXTURE_ONLY_NOT_A_REAL_MODEL_RESULT`；
- 通过相同编排和 v0.3 runtime validator。

Fixture 只用于开发基线，不能冒充真实模型结果。

### 2.6 首个真实 Provider 路径

已实现 OpenAI Responses API Adapter，但默认硬锁定。真实调用必须同时满足：

```text
VISION_PROVIDER=openai
VISION_PROVIDER_APPROVED=openai
VISION_PAID_CALLS_ENABLED=true
VISION_DATA_PROCESSING_APPROVED=true
VISION_MODEL=<明确确认的模型 ID>
OPENAI_API_KEY=<运行环境 secret>
```

任何一项缺失都会在网络请求之前失败。实现中：

- 模型 ID 无默认值，避免未经确认选择付费模型；
- 密钥只从传入的运行环境配置读取；
- 返回值、错误消息、日志和测试快照不包含密钥；
- 请求设置 `store: false`；
- 图片通过 Responses API 的 `input_image` 传入；
- Provider 原始文本先解析和检查，再进入项目编排。

OpenAI 官方资料确认当前模型支持图像输入并可通过 Responses API 使用：

- <https://developers.openai.com/api/docs/models>
- <https://developers.openai.com/api/docs/guides/latest-model>

本实现没有据此替用户选择模型，也没有执行真实调用。

## 3. 验收结果

| 验收项 | 结论 | 证据 |
|---|---|---|
| 无密钥 Fixture 可运行 | 通过 | 默认 Factory + Fixture 单测 |
| 未经配置不发起付费调用 | 通过 | 三项显式批准门 + 配置单测 |
| 真实路径只读环境配置且不记录密钥 | 通过 | Factory / OpenAI Adapter + 脱敏单测 |
| 原始输出经 v0.3 与确定性规则处理 | 通过 | Orchestrator + runtime validator |
| evidence 缺失降级 REVIEW | 通过 | 缺证据单测 |
| 超时/重试/错误分类 | 通过 | `evaluateWithRetry` + transient retry 单测 |
| Adapter 单测 | 5/5 通过 | `model-adapter.test.ts` |
| 全量测试 | 23/23 通过 | `npm test`（7 项静态/Schema + 16 项 TS） |
| lint | 通过 | `npm run lint` |
| build | 通过 | `npm run build` |

验证命令：

```text
cd D:\VisionQA\web
node --experimental-strip-types --test tests/model-adapter.test.ts
npm test
npm run lint
npm run build
```

第一次 build 因共享工作区内另一构建占用 `dist/.openai/hosting.json` 出现一次
`EBUSY`，无代码修改后重跑通过。

## 4. 与其他 Agent 的边界

- 未修改 `app/api/**`、`db/**`、`drizzle/**` 或 `.openai/hosting.json`。
- 平台 Agent 后续只需在运行执行端调用 Factory + Orchestrator。
- 平台 Agent 必须负责短期私有图片 URL、身份/租户校验、结果持久化与审计。
- 前端只能消费最终 v0.3 结果，不能直接展示 Provider 草稿。

## 5. 真实调用前必须由用户确认

以下事项仍是硬阻塞，不能由 Agent 代替用户决定：

1. 选择真实 Provider 和具体模型/模型快照；
2. 在 secret 管理中配置 API key；
3. 确认图片可发送给该第三方 Provider；
4. 确认数据留存、训练使用、处理地域、删除机制及是否要求 ZDR；
5. 确认单图/批次预算、并发和成本上限。

在这些确认完成前，MVP 应保持 `VISION_PROVIDER=fixture`。

## 6. 建议外部审查重点

- 在批准变量缺失时监控 fetch，确认调用次数始终为 0；
- 故意返回缺 evidence、高分 Blocker、错误权重和伪造 Gate；
- 验证最终 v0.3 结果仍由本地规则派生；
- 检查所有错误、日志、序列化结果和 bundle 中均无 API key；
- 用超时、429、500、401、非法 JSON 逐项验证错误分类和重试次数；
- 确认真实图片 URL 为短期私有 URL，不出现在持久日志。
