# VisionQA OpenAI Provider 治理与激活准备报告 v0.1

> 角色：OpenAI Provider 治理与激活准备 Agent  
> 日期：2026-07-29  
> 结论：`CODE_READY / ACTIVATION_BLOCKED`  
> 重要边界：本次没有配置密钥、没有发送图片、没有发起真实或付费 API 调用。

## 1. 职责、输入、输出与验收标准

### 职责

- 只使用 OpenAI 官方资料核验外审指定模型、Responses API、训练使用和
  Zero Data Retention（ZDR）语义；
- 审查 Provider Adapter 的批准、预算、批量、并发、环境、密钥和图片 URL
  门；
- 在不触碰 D1、平台 API 和 UI 的范围内补齐硬门和测试；
- 给出不含密钥的 staging 激活 runbook。

### 输入

- `handoffs/MVP_EXTERNAL_REVIEW_v0.1/external_review_decisions.csv`
- `agents/cto_mvp_execution_summary_v0.1.md`
- `agents/model_adapter_implementation_report_v0.1.md`
- `web/lib/visionqa/providers/**`
- OpenAI 官方开发者文档。

### 输出

- 本报告；
- `web/lib/visionqa/providers/factory.ts`
- `web/lib/visionqa/providers/openai.ts`
- `web/lib/visionqa/providers/types.ts`
- `web/lib/visionqa/providers/README.md`
- `web/tests/model-adapter.test.ts`

### 验收标准

1. 不执行付费调用；
2. staging、ZDR 或 secret 未满足时在 `fetch` 前失败；
3. 不把 `store:false` 等同于 ZDR；
4. 不在错误、返回值或测试输出中暴露 API key、签名图片 URL；
5. 当前结论可由 OpenAI 官方资料核查；
6. adapter 测试、全量测试、lint、build 通过。

## 2. 官方资料核验

本会话的 OpenAI Developer Docs MCP 未提供可调用工具。按 `openai-docs`
skill 尝试执行安装命令时，`codex.exe` 被系统拒绝运行。因此以下核验使用
skill 允许的后备路径，且只访问 `developers.openai.com` 官方页面。

### 2.1 模型与快照

OpenAI 的 GPT-4o 模型页仍列出：

- 图像输入、文本输出；
- Responses API；
- Structured Outputs；
- dated snapshot `gpt-4o-2024-11-20`。

同一页面把 snapshot 定义为用于锁定模型版本，使行为更稳定。因外审已经
明确选择 GPT-4o，首轮可复现实验建议硬锁
`gpt-4o-2024-11-20`，不使用滚动 alias `gpt-4o`。

但当前模型目录对新集成推荐 GPT-5.6 系列。因此本报告只说明
`gpt-4o-2024-11-20` 仍适合执行已批准的 MVP 对照实验，不把 GPT-4o 称为
2026 年的最新或旗舰模型。将来升级模型必须作为新的评测变量重新外审，
不能在本次基准运行中静默替换。

官方来源：

- [GPT-4o model](https://developers.openai.com/api/docs/models/gpt-4o)
- [Models](https://developers.openai.com/api/docs/models)

### 2.2 图像与结构化输出适配性

官方 Images and vision 指南确认 Responses API 使用 `input_image` 与
`image_url` 传入图片。Structured Outputs 指南确认 Responses API 可使用
`text.format` 的 `json_schema` 严格约束输出，且兼容
`gpt-4o-2024-08-06` 及之后的模型。因此
`gpt-4o-2024-11-20 + Responses API` 在能力层面适合 VisionQA 的图像观察
和结构化输出。

当前 Adapter 已使用 `input_image`，并对 JSON 结果执行项目运行时校验；
尚未把 Provider 草稿 schema 直接放入 `text.format`。这不阻塞安全门测试，
但在第一次真实基准前建议再将草稿契约升级为严格 JSON Schema，减少格式
失败率。该变化应单独评测，不应与模型切换同时进行。

官方来源：

- [Images and vision](https://developers.openai.com/api/docs/guides/images-vision)
- [Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

### 2.3 `store:false`、训练使用与 ZDR

三者不是同一控制：

| 控制 | 层级 | 官方语义 | VisionQA 处理 |
|---|---|---|---|
| `store:false` | 单次请求参数 | 控制 Responses 应用状态存储；不能取消默认滥用监控日志 | 请求固定发送，但不能作为 ZDR 证据 |
| API 训练使用 | 组织数据共享选择 | API 数据默认不用于训练，除非客户主动 opt in | 仍要求运行前确认没有启用共享 |
| ZDR | 获批后的组织/项目设置 | 需 OpenAI 批准并在组织或项目层配置；排除客户内容进入常规滥用监控日志，并强制 `store` 视为 false | 必须独立确认，未确认时 fetch 前失败 |

官方文档还说明：

- 默认滥用监控日志最长可保留 30 天；
- `/v1/responses` 是 ZDR eligible，但部分能力存在例外；
- 图像和文件输入会进行 CSAM 扫描；命中时即使启用 ZDR 也可能保留供人工
  复核。

因此外审文字中“`store:false`（OpenAI 不留存请求）”的表述不够准确，已
在代码和运行说明中纠正。ZDR 不是请求级布尔参数，也不能由代码自行开通。

官方来源：

- [Data controls in the OpenAI platform](https://developers.openai.com/api/docs/guides/your-data)

## 3. Adapter 治理差距与处理

| 项目 | 原状态 | 本次处理 | 余留边界 |
|---|---|---|---|
| staging 前置 | 无 | 必须 `VISION_ENVIRONMENT=staging` 且 ready | staging 资源真实性由平台 Agent 验证 |
| ZDR | 只有说明 | 独立 `VISION_ZDR_CONFIRMED=true` 硬门 | 需账户管理员提供项目级配置证据 |
| 训练控制 | 未编码 | 独立确认未 opt in | 需账户管理员核对数据共享设置 |
| 模型 ID | 任意非空 | 只允许 `gpt-4o-2024-11-20` | 升级需重新外审 |
| 预算 | 无 | 批预算 ≤50 USD，预估成本不得超过预算 | 供应商实际总账仍需 OpenAI 项目 spend limit |
| 批量 | 无 | 1–50 张 | 调度器仍需按批次传值 |
| 并发 | 无 | 配置 ≤3；进程内第 4 个请求 fetch 前拒绝 | 多实例全局并发需平台级队列 |
| 图片 URL | 无 | 仅 HTTPS、`short_lived_private`、15 分钟内过期 | 签名生成与吊销由 R2/平台负责 |
| 日志 | 不记 key | 新错误不含 key 或 URL；测试验证 outcome 不含二者 | 平台访问日志仍需单独脱敏 |

## 4. 已实现的硬门

Live OpenAI Adapter 现在只有在下列环境变量同时满足时才能创建：

```text
VISION_PROVIDER=openai
VISION_PROVIDER_APPROVED=openai
VISION_PAID_CALLS_ENABLED=true
VISION_DATA_PROCESSING_APPROVED=true
VISION_ENVIRONMENT=staging
VISION_STAGING_READY=true
VISION_ZDR_CONFIRMED=true
VISION_API_DATA_SHARING_DISABLED_CONFIRMED=true
VISION_PRIVATE_IMAGE_URLS_CONFIRMED=true
VISION_MODEL=gpt-4o-2024-11-20
VISION_BUDGET_LIMIT_USD=<0..50]
VISION_ESTIMATED_BATCH_COST_USD=<0..VISION_BUDGET_LIMIT_USD]
VISION_BATCH_SIZE=<整数 1..50>
VISION_MAX_CONCURRENCY=<整数 1..3>
OPENAI_API_KEY=<secret manager 注入>
```

每个 live 图片输入还必须满足：

```text
url=https://<private-signed-url>
access=short_lived_private
expiresAt=<未来 15 分钟以内的 ISO 时间>
```

任一条件失败均抛出不含敏感值的 `CONFIGURATION`，不会调用 `fetch`。
请求仍固定包含 `store:false`，但代码不会据此推断 ZDR 已启用。

## 5. 测试覆盖

新增测试覆盖：

- 缺 staging ready、ZDR、secret、预算配置时 `fetch=0`；
- 预算 >50、预估成本超预算、批 >50、并发 >3、滚动模型 alias 被拒绝；
- 非私有、非 HTTPS 或超过 15 分钟的 URL 在 `fetch` 前被拒绝；
- 第 4 个并发请求在 `fetch` 前被拒绝；
- 返回对象和错误中不含 API key、图片 URL。

最终验证结果：

- `npm run test:adapters`：9/9 通过；
- `npm test`：build 通过，静态/Schema/production smoke 8/8，TypeScript
  28/28，总计 36/36；
- `npm run lint`：通过。

## 6. Staging 激活 runbook

### Gate A：账户与数据控制（账户管理员）

1. 使用独立 OpenAI API Project，不复用 production project。
2. 确认该组织/项目已经由 OpenAI 批准并实际配置 ZDR；保留不含 secret 的
   设置截图或审批编号。
3. 核对项目未主动 opt in 共享 API 输入/输出用于训练。
4. 设置 OpenAI 项目级预算或 spend limit 不高于 50 USD。本地预估门不是
   供应商账单硬上限，二者必须同时存在。
5. 创建仅用于 staging 的 service account key，通过 secret manager 注入；
   不写入 `.env`、CSV、Markdown、日志或聊天。

### Gate B：平台与资产（Platform Agent）

1. 独立 staging D1/R2 迁移和 smoke 全部通过后，才设置
   `VISION_STAGING_READY=true`。
2. R2 bucket 保持私有，为每张图片生成 15 分钟以内的 HTTPS 签名 URL。
3. 平台日志只记录 asset ID、run ID 和 Provider request ID，不记录完整
   签名 URL、请求 body 或 Authorization header。
4. 跨实例调度器把全局并发限制为 3；Adapter 的进程内门只作为第二道防线。

### Gate C：批次批准（预算责任人 / 数据责任人）

1. 批次只含已授权 `commercial-seed`，不得含客户生产数据或 PII。
2. 批次最多 50 张，填写保守的预估成本且不超过本批预算。
3. 将本报告列出的所有变量通过 staging secret/config 注入；模型必须是
   `gpt-4o-2024-11-20`。
4. 先运行 `fetch=0` 的负向门测试，再允许一次小批（建议 3–5 张）真实
   canary。真实调用属于下一授权动作，本报告没有执行。

### Gate D：canary 后验收

记录但不记录图片 URL 或密钥：

- evaluation ID、provider request ID、模型 snapshot；
- 成功/失败、延迟、输入/输出 token、估算和实际账单；
- JSON 结构失败率、证据完整率、与 gold 的评分差；
- 重试次数和错误分类。

任一条件触发立即停止后续批次：

- 累计成本接近 50 USD 上限；
- 发现 URL、key 或图片内容进入日志；
- 模型 snapshot 与批准值不一致；
- 结构化结果无法通过 v0.3 runtime validation；
- ZDR、训练共享或 staging 状态证据发生变化。

## 7. 最终结论

代码级激活准备已完成，但真实激活仍是 `BLOCKED`：

- staging D1/R2 是否真实就绪需要平台 Agent 证明；
- ZDR 是账户/项目级控制，需要 OpenAI 批准和管理员确认；
- secret 尚未安全注入；
- 尚无 OpenAI 项目级 50 USD spend limit 证据。

在这些外部条件满足前应继续使用 Fixture。不得把本次代码验收描述成真实
模型已运行，也不得把 `store:false` 描述成零数据留存。
