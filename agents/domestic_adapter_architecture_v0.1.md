# VisionQA 国产 Provider Adapter 架构 v0.1

> 角色：国产 Provider Adapter 架构 Agent  
> 日期：2026-07-29  
> 状态：`DESIGN_READY / PROVIDER_SELECTION_PENDING / NO_LIVE_CALL`  
> 边界：本文只定义切换架构和验收门，不选择厂商、不配置密钥、不发送图片、不执行真实调用。

## 1. 职责、输入、输出与验收标准

### 职责

- 设计从 OpenAI 切换到国产多模态模型的最小改造；
- 保持 Fixture、v0.3 契约、确定性计分、Gate 和 Repair Prompt 不变；
- 定义图片输入、JSON 解析、错误分类、超时重试、证据降级和成本硬门；
- 比较 OpenAI-compatible endpoint 与厂商原生 API 的工程取舍；
- 为厂商选型 Lead 和后续实现、QA 提供可执行清单。

### 输入

- `web/lib/visionqa/providers/{types,factory,fixture,openai,orchestrator}.ts`
- `web/tests/model-adapter.test.ts`
- `contracts/evaluation-result-v0.3.schema.json`
- `agents/model_adapter_implementation_report_v0.1.md`
- `agents/openai_provider_governance_report_v0.1.md`

### 输出

- 本架构文档；
- 国产 Provider 实现任务清单；
- Provider 选型需要返回的能力参数；
- 独立 QA 验收矩阵。

### 验收标准

1. OpenAI 路径默认禁用，且不会因为旧环境变量残留被激活；
2. 无密钥或任一批准门缺失时网络调用次数为 0；
3. 更换 Provider 不改变权重、综合分、分档、Blocker Gate 或 Repair Prompt 规则；
4. 密钥、Authorization、签名图片 URL、请求正文和图片内容不进入日志或结果；
5. evidence 缺失仍按现有规则降级为 `PARTIAL + REVIEW`，不得补造证据；
6. 预算、批量、并发、数据批准和 staging 门全部在网络前生效。

## 2. 当前接口结论

现有边界总体正确：

```text
Provider Adapter
  只返回 observation draft + provider metadata
        ↓
本地 Orchestrator
  固定六项商业权重
  固定四 Skill 权重
  重算 commercial fit / overall score
  执行 Blocker 与阈值 Gate
  生成来源关联 Repair Prompt
  执行 v0.3 runtime validation
```

因此国产切换不应修改 `orchestrator.ts`、`rules.ts`、v0.3 契约或 Fixture
结果。最小变更仅应发生在 Provider 能力配置、Factory、国产 Adapter 和对应
测试。

### 当前接口差距

| 差距 | 风险 | 最小处理 |
|---|---|---|
| Factory 只认 `fixture/openai` | 不能安全切换国产 Provider | 改为代码内 allowlist + capability registry |
| OpenAI 模型、USD 成本和 ZDR 变量写死在 Factory | 厂商语义被错误复用 | 抽取通用批准门，数据控制使用厂商独立确认项 |
| Adapter 同时负责协议和图片约束 | 新厂商会复制安全逻辑 | 图片约束移到共享 preflight |
| 只有 OpenAI Responses 响应解析器 | compatible/native 返回结构不同 | Adapter 内协议解析，统一输出 draft |
| 错误码缺少内容安全拦截与载荷过大 | 可能把不可重试错误当瞬时错误 | 扩展稳定错误分类 |
| 并发计数是 OpenAI 模块级变量 | 无法跨 Adapter/实例统一 | Adapter 内保留第二道门；平台队列承担全局门 |
| `ProviderImageInput` 只有 URL 字段 | 部分原生 API 可能要求 base64/file id | 选型后增加受控 transport union，不开放任意输入 |

## 3. 推荐结构

```text
providers/
  types.ts                 # provider-neutral 输入、输出、错误
  fixture.ts               # 原样保留
  orchestrator.ts          # 原样保留
  governance.ts            # 通用网络前硬门、成本/批量/并发
  image-preflight.ts       # 图片类型、尺寸、短期 URL、脱敏
  registry.ts              # 代码内 provider/model/endpoint allowlist
  factory.ts               # 只从 registry 构造 Adapter
  domestic/
    compatible.ts          # 选型后若采用兼容协议
    native.ts              # 仅当必须使用原生协议时实现
    prompt.ts              # 共用观察层 Prompt
    parse-draft.ts         # JSON 抽取与 draft 结构校验
```

`registry.ts` 必须是代码审查过的静态配置，运行环境不能传入任意 endpoint。
这样可防止将带签名图片 URL 和凭据发送到未批准主机，也避免 SSRF/误路由。

建议的 registry 条目：

```ts
interface ApprovedProviderDefinition {
  providerId: string;
  protocol: "openai_compatible_chat" | "native";
  endpoint: string;                 // 代码固定，不从环境自由覆盖
  approvedModelIds: readonly string[];
  apiKeySecretName: string;
  imageTransport: "private_url" | "inline_base64";
  structuredOutput: "json_schema" | "json_object" | "prompt_only";
  maxImagesPerRequest: number;
  maxImageBytes: number;
  supportsUsageMetadata: boolean;
}
```

在选型 Lead 返回结论前，registry 只允许：

```text
fixture
```

`openai` 不在默认 allowlist。若保留旧代码用于对照，也必须另外设置
`VISION_LEGACY_OPENAI_ENABLED=true` 且经过新的外审；不得仅凭旧
`VISION_PROVIDER=openai` 和旧批准变量恢复网络访问。

## 4. Compatible endpoint 与原生 API 取舍

| 维度 | OpenAI-compatible | 厂商原生 API |
|---|---|---|
| MVP 改造量 | 小，可复用 HTTP/鉴权/消息构造框架 | 大，需要独立请求和响应映射 |
| 多厂商替换 | 较容易 | 每家需要一个 Adapter |
| 图像输入 | 兼容程度不一，需实测 URL/base64/detail | 能力表达通常更完整 |
| 结构化输出 | `response_format/json_schema` 支持可能不完整 | 可能有厂商专用 schema/tool 能力 |
| usage/request id | 字段看似兼容但含义可能不同 | 需明确映射，通常文档更准确 |
| 错误码/限流 | HTTP 外形相似，错误 body 不统一 | 可精确映射厂商状态和错误码 |
| 数据治理 | 与协议兼容无关，仍须逐厂商审核 | 同样必须逐厂商审核 |
| 长期可维护性 | 适合首个 MVP，但不能把“兼容”当完全等价 | 适合需要厂商特有能力时 |

**建议决策原则：**

1. 首选能够通过实测满足多图视觉、严格 JSON、usage、请求 ID、短期私有
   URL 和明确数据治理的 compatible endpoint，以减少 MVP 变更；
2. 若 compatible 路径不支持图片、严格 JSON 或可靠错误码，但原生 API
   支持，则实现独立 native Adapter；
3. 不允许用“接口兼容”代替质量、数据处理、地域、留存和价格验证；
4. 同一个 canary 不同时切换模型、Prompt、计分规则和商业模板。

## 5. 图片输入规范

### 默认方案：短期私有 HTTPS URL

- candidate 与 references 均沿用 `ProviderImageInput`；
- 只允许 `image/jpeg`、`image/png`、`image/webp`；
- `access` 必须为 `short_lived_private`；
- URL 必须为 HTTPS，过期时间在当前时间之后且不超过 15 分钟；
- hostname 必须属于项目资产域 allowlist；
- 拒绝 URL fragment、用户名密码、非标准协议和重定向到非 allowlist 主机；
- 平台日志只记录 `assetId/runId/requestId`，不记录完整 URL、query 或 body。

### 备选方案：受控 inline base64

只在选中厂商不能安全拉取私有 URL 且原生 API 明确支持时采用：

- 由平台从私有 R2 读取后在内存编码，不落临时文件；
- 增加 `contentBase64` 与 `sha256` 的受控 union，不允许与 URL 同时出现；
- 解码后 MIME 与 magic bytes 必须一致；
- 单图字节上限和总请求上限由 registry 固定；
- base64、原始字节、哈希到图片的映射不得写日志；
- 请求完成立即释放内存引用。

不得允许前端提交任意公网 URL，也不得把 data URL 用于 live Adapter。

## 6. JSON 输出与证据降级

### 输出优先级

1. 厂商原生严格 JSON Schema；
2. compatible `response_format=json_schema`；
3. `json_object`；
4. 最后才允许 `prompt_only`，且必须经过 canary 单独证明格式稳定性。

Adapter 只提取以下统一草稿：

- `observations`
- `skillAssessments`
- `commercialAssessment`
- `requiredHumanChecks`

Provider 返回的权重、综合分、分档、Gate 或 Repair Prompt 一律忽略。

### 解析规则

- 只接受一个完整 JSON object；不执行 `eval`，不宽松修复字段名；
- 如协议把文本包在 `choices[0].message.content`，只解析该字段；
- Markdown code fence 可由明确、无歧义的纯包裹剥离器移除；存在额外说明文字
  则判 `INVALID_OUTPUT`；
- 先做 JSON parse，再执行 `assertProviderObservationDraft`；
- response body、原始输出和图片 URL不得进入普通日志；
- 允许保存经过脱敏的错误类别、request id、latency、usage 和 schema
  validation path。

首个 MVP 不自动用第二次付费请求“修复 JSON”。格式错误判
`INVALID_OUTPUT` 且不重试，避免隐藏失败率和突破预算。以后如增加格式修复，
必须作为独立计费 attempt 入账并重新外审。

### evidence 降级

保持现有 Orchestrator 行为：

- 非空 score 没有至少一条非空 evidence：该 score 置 `null`；
- 不生成替代 evidence；
- 任一必要证据不完整：`score_evaluation.status=PARTIAL`；
- overall score 不能计算时为 `null`；
- Gate 为 `REVIEW`；
- 加入人工检查项。

这部分不得下沉到厂商 Adapter，以保证所有 Provider 处理一致。

## 7. 超时、重试和错误分类

保留当前默认：

- 单次 attempt 35 秒；
- 最多 3 次 attempt；
- 退避 250ms 起步、指数增长并带 jitter；
- 上游取消立即终止。

只重试明确瞬时错误：

- `RATE_LIMITED`（429 或厂商等价码）；
- `PROVIDER_UNAVAILABLE`（可恢复 5xx/厂商服务繁忙码）；
- `NETWORK`；
- `TIMEOUT`。

不重试：

- `CONFIGURATION`
- `AUTHENTICATION`
- `INVALID_OUTPUT`
- `POLICY_BLOCKED`（新增）
- `PAYLOAD_TOO_LARGE`（新增）
- `UNSUPPORTED_MEDIA`（新增）
- `ABORTED`

厂商 HTTP 200 但业务 body 返回限流、内容安全、余额不足或模型不存在时，
必须按厂商错误码映射，不能当作 JSON 失败。余额不足归
`CONFIGURATION` 或新增 `QUOTA_EXHAUSTED`，不得重试。

每次 attempt 都要计入尝试次数、延迟、token/计费估算；最终结果不能只记录
最后一次而隐藏前面的失败和成本。

## 8. 批量、并发、预算和数据硬门

在外审重新批准前沿用更严格上限：

```text
单批图片数 <= 50
全局并发 <= 3
单次 attempt 超时 = 35 秒
最多 attempt = 3
只允许 staging
```

预算不再写死 USD。使用最小货币单位，禁止静默汇率换算：

```text
VISION_BUDGET_CURRENCY=CNY
VISION_BUDGET_LIMIT_MINOR_UNITS=<批准的分>
VISION_ESTIMATED_BATCH_COST_MINOR_UNITS=<保守估算的分>
VISION_BATCH_SIZE=<1..50>
VISION_MAX_CONCURRENCY=<1..3>
```

若供应商无法提供稳定 token usage，则按图片数、最大 token 和最坏单价做
保守预授权；无法形成保守上界时禁止 live batch。Provider 账户侧还必须设置
独立 staging 预算/余额上限，本地门不能替代供应商账单门。

所有 live Adapter 共用以下网络前硬门：

```text
VISION_PROVIDER=<registry 中批准的国产 provider id>
VISION_PROVIDER_APPROVED=<必须与 provider id 完全一致>
VISION_LIVE_PROVIDER_ENABLED=true
VISION_PAID_CALLS_ENABLED=true
VISION_DATA_PROCESSING_APPROVED=true
VISION_ENVIRONMENT=staging
VISION_STAGING_READY=true
VISION_PRIVATE_IMAGE_URLS_CONFIRMED=true
VISION_PROVIDER_DATA_RETENTION_REVIEWED=true
VISION_PROVIDER_TRAINING_USE_DISABLED_CONFIRMED=true
VISION_PROVIDER_PROCESSING_REGION_APPROVED=true
VISION_MODEL=<registry 中批准的固定模型 id>
```

若厂商没有等价 ZDR，不能伪造 `VISION_ZDR_CONFIRMED=true`。应由外审明确批准
实际留存期限、训练使用、处理地域、删除机制和子处理方后，使用上述厂商中性
且有证据支持的确认项。

## 9. Secret 与 allowlist

### Secret 命名

选型前使用占位规则，落地后由 registry 固定：

```text
VISION_CN_<PROVIDER_ID>_API_KEY
VISION_CN_<PROVIDER_ID>_ACCESS_KEY_ID       # 仅原生签名协议需要
VISION_CN_<PROVIDER_ID>_SECRET_ACCESS_KEY   # 仅原生签名协议需要
```

- secret 只由 staging secret manager 注入；
- 不写 `.env`、CSV、Markdown、测试快照、命令历史或聊天；
- 测试只能使用明显的假密钥；
- 错误对象不得包含请求 headers、endpoint query、图片 URL 或响应原文。

### Allowlist

三层 allowlist 必须同时满足：

1. `providerId` 在代码 registry；
2. `modelId` 属于该 provider 的固定模型列表；
3. endpoint host 与路径是 registry 固定值。

禁止：

- `VISION_PROVIDER_BASE_URL` 任意覆盖；
- 运行时传入任意模型 alias；
- 从前端请求决定 Provider、endpoint 或模型；
- 兼容 endpoint 自动 fallback 到其他厂商或其他模型。

## 10. 最小实现任务清单

### T1：安全拆分（可在选型前完成）

- 新增 `governance.ts`，抽取 staging、批准、数据、预算、批量、并发硬门；
- 新增 `image-preflight.ts`，共享短期私有图片校验与 hostname allowlist；
- 新增空的 `registry.ts`，当前 live provider allowlist 为空；
- 修改 Factory：默认 Fixture；OpenAI 默认禁用；未知 Provider 网络前失败；
- 扩展错误码并保证现有 Fixture 测试不变。

### T2：选型落地（等待 Lead）

- 在 registry 增加一个批准的国产 provider/model/endpoint；
- 按选型结果实现 compatible 或 native Adapter；
- 实现协议专属 request builder、response parser、request id/usage 映射；
- 补充厂商业务错误码映射；
- 增加 secret 名称和厂商数据确认门；
- 不修改 Orchestrator、rules、contract 或 Fixture。

### T3：Canary 前 QA

- 使用 mock fetch 完成全部负向门、协议和脱敏测试；
- 用伪造 Provider 返回测试缺 evidence、Blocker 高分、错误权重和伪造 Gate；
- 静态扫描日志与序列化输出，不得含 key、Authorization、URL query/base64；
- 运行 adapter、全量、lint、build；
- 外审批准后才允许 3–5 张授权 seed 图 canary。

## 11. 选型 Lead 必须返回的参数

在实现 Agent 开工前，选型结论至少包含：

1. 厂商和账户主体；
2. 固定 provider id 与固定模型 id/版本语义；
3. compatible 或 native endpoint 的官方地址；
4. 图像输入方式、格式、大小、多图上限和 URL 拉取限制；
5. 严格 JSON/schema 支持情况；
6. request id、usage、限流、超时和完整错误码文档；
7. 单价、计费单位、免费额度是否可靠、账户预算硬停能力；
8. 数据是否用于训练、默认留存期、处理地域、删除机制、子处理方；
9. 是否支持不留存/专有实例等数据控制及其证据；
10. staging 可用的 secret 类型和最小权限。

缺任一安全或计费关键项，不得进入真实调用。

## 12. QA 验收矩阵

| 场景 | 预期 |
|---|---|
| 环境为空 | Fixture，fetch=0 |
| 旧 OpenAI 全套变量仍存在 | OpenAI 仍禁用，fetch=0 |
| 国产 provider 未在 registry | `CONFIGURATION`，fetch=0 |
| provider/model/endpoint 任一不在 allowlist | `CONFIGURATION`，fetch=0 |
| 无 secret 或数据批准门缺失 | `CONFIGURATION`，fetch=0 |
| 预算超限、批量 51、并发 4 | 网络前拒绝 |
| HTTP/HTTPS URL 不符合私有、TTL 或域名规则 | 网络前拒绝，错误不含 URL |
| 401/403 | `AUTHENTICATION`，不重试 |
| 429、可恢复 5xx、网络、超时 | 最多 3 次，全部 attempt 入账 |
| 余额不足/模型不存在/内容安全拦截 | 精确分类，不重试 |
| HTTP 200 + 非法 JSON/多余文本 | `INVALID_OUTPUT`，不自动付费修复 |
| score 非空但 evidence 为空 | 分数置 null，PARTIAL，Gate REVIEW |
| Provider 返回自己的总分/Gate/权重 | 被忽略，本地规则结果不变 |
| 同一 Fixture 输入切换前后 | v0.3 JSON 深度相等 |
| outcome、错误、日志、快照 | 不含密钥、Authorization、URL、base64 |
| `npm run test:adapters / npm test / lint / build` | 全通过 |

## 13. 架构结论

国产模型切换不需要重写 VisionQA 的评分系统。应保留 Provider-neutral 草稿
边界和确定性 Orchestrator，只替换协议 Adapter 与治理配置。

在厂商选型完成前，正确运行状态是：

```text
VISION_PROVIDER=fixture
live provider allowlist=[]
OpenAI default disabled
no secret
no network
```

选型完成后也应先完成 mock QA，再由外审批准一轮 3–5 张授权图片 canary。
任何国产 Provider 的启用都不自动等于 production Go。
