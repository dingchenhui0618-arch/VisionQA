# VisionQA Qwen Adapter 独立 QA 报告 v0.1

> 角色：Qwen Adapter 独立 QA Lead  
> 初审日期：2026-07-29  
> 独立复验日期：2026-07-29  
> 网络约束：未向模型、云厂商或外部图片地址发起请求；未读取或使用真实 Key  
> 复验结论：`LOCKED_IMPLEMENTATION_GO / LIVE_CANARY_NO-GO / PRODUCTION_NO-GO`

## 1. 职责、输入、输出和验收标准

### 职责

- 独立复跑全量 test、Adapter test、lint、build；
- 对 provider allowlist、固定模型、北京 endpoint、staging、数据治理、
  secret、预算、批量、并发、短期私有 URL、JSON 和 evidence 降级做负测；
- 验证旧 OpenAI 环境变量残留 `fetch=0`；
- 检查错误和运行日志不泄露 Key 或完整图片 URL；
- 将代码验收与外部数据治理/预算批准分开判定；
- 确认真实调用为 0。

### 输入

- `D:\VisionQA\agents\qwen_adapter_implementation_report_v0.1.md`
- `D:\VisionQA\agents\domestic_model_selection_report_v0.1.md`
- `D:\VisionQA\agents\domestic_adapter_architecture_v0.1.md`
- `D:\VisionQA\agents\domestic_model_data_governance_v0.1.md`
- `D:\VisionQA\web\lib\visionqa\providers\**`
- `D:\VisionQA\datasets\domestic_provider_canary_v0.1\manifest.json`
- `D:\VisionQA\handoffs\DOMESTIC_PROVIDER_REVIEW_v0.1\provider_activation_decisions.csv`

### 输出

- 本报告；
- 独立负测：
  `D:\VisionQA\runs\qwen_adapter_qa_v0.1\qwen-negative.test.ts`。

### 验收标准

- 每项有命令输出、静态位置或 manifest 证据；
- 不使用真实网络或真实 secret；
- P1 立即上报 CTO，修复后必须重新独立复验；
- 测试通过不等于治理证据批准；
- P1 未关闭或外部批准仍 PENDING 时不得运行真实 canary。

## 2. 独立复验结果

### 2.1 自动化回归

在 `D:\VisionQA\web` 复跑：

```text
npm run test:adapters
npm test
npm run lint
npm run build
```

最终串行结果：

```text
Adapter tests: 13/13 PASS
全量静态/生产 smoke: 8/8 PASS
全量 TypeScript: 32/32 PASS
总计: 40/40 PASS
lint: PASS, 0 error
production build: PASS
```

一次与实现 Agent 同时构建时，Sites closeBundle 出现临时
`ENOENT drizzle/meta/0004_snapshot.json`；文件实际存在，停止并发写入后立即串行复跑
通过。该现象不属于 Qwen Adapter 功能缺陷，但后续不要在同一工作目录并行执行 build。

### 2.2 独立负测

```text
node --experimental-strip-types --test \
  D:\VisionQA\runs\qwen_adapter_qa_v0.1\qwen-negative.test.ts
```

结果：

```text
7/7 PASS
```

覆盖：

1. OpenAI 残留及未知 provider 均 `fetch=0`；
2. 即使所有环境门均写为 true，PENDING 审批仍阻止 Factory；
3. approval artifact、decision IDs、manifest、20 CNY、5 图、15 请求、
   并发 1 任一漂移均失败；
4. Qwen live class 不再导出，唯一 governed seam 同样受 PENDING 门阻止；
5. registry 已冻结，请求 builder 固定 dated model；
6. 缺签、错签、改 host/path/query、过期、超 10 MiB、签名后改大小均失败；
7. 合法信封通过本地 preflight，Prompt 为可读 UTF-8 中文且请求不含 Key。

## 3. 初审缺陷关闭情况

## P0

无。

## P1

复验后未发现未关闭 P1。

### P1-01 精确 canary 范围未绑定：CLOSED

现已绑定并冻结：

```text
approval artifact path/id/SHA-256
decision ids
manifest id/SHA-256
budget = 2000 CNY minor units
images = 5
total requests = 15
concurrency = 1
```

独立负测确认 21 CNY、6 图、16 请求、并发 2 以及任一 artifact/manifest
漂移均在构造阶段失败。

本地重新计算：

```text
provider_activation_decisions.csv SHA-256
= 8662008C344F78F0D7C12DCDE78A7EAF59C96E489AB2338ED010CE09ABFEBEC7

manifest.json SHA-256
= DAA501ECE72AF64F25FA7E180166282ECB9CB930C56F35243926AED8E3FA0746
```

均与 registry 绑定值一致。当前 registry 状态仍为
`PENDING_EXTERNAL_APPROVAL`，所以完整合法环境也不能返回 live Adapter。

### P1-02 endpoint/model/host 与构造器绕过：CLOSED

- Provider definition 及 image host 数组均 `Object.freeze`；
- Qwen Adapter class 和 options 不再导出；
- 任意 `definition` 注入接口已删除；
- 唯一导出的生产构造 seam
  `createGovernedQwenBailianAdapter(env, options)` 内部重新执行完整治理；
- 动态 import 证实模块不存在可直接 `new` 的 Adapter 导出；
- Factory 与 governed seam 在审批为 PENDING 时均 `fetch=0`。

北京 endpoint 和 dated model 仍固定为：

```text
https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
qwen3-vl-plus-2025-12-19
```

### P1-03 私有短期 URL 仅靠调用方自报：CLOSED（代码层）

新增 HMAC-SHA256 私有图片信封并绑定：

```text
issuer
nonce
role
MIME
expiresAt
asset SHA-256
byteSize
URL host
URL path SHA-256
完整 URL SHA-256
```

独立复验确认以下路径均在 fetch 前失败：

- 缺少信封；
- 错误签名；
- 修改 host；
- 修改 path；
- 修改 query；
- 已过期；
- 修改签名后的 byteSize；
- 超 10 MiB。

真实 staging 上“到期后对象确实不可读取”仍属于平台集成证据，而不是本次离线代码
复验范围；因此 live canary 仍不能放行。

## P2

### P2-01 10 MiB 声明未执行：CLOSED

签名信封绑定 byteSize，preflight 强制与 registry 的 10 MiB 上限比较。
`10 MiB + 1 byte` 独立负测为 `fetch=0`。

### P2-02 外部治理证据仍未批准：OPEN / 非代码缺陷

代码现在绑定审批 artifact 和 manifest，但不能替代审批人签字、账户控制台、合同或
工单证据。当前：

```text
DOMESTIC-QWEN-001=PENDING_EXTERNAL_REVIEW
DOMESTIC-BUDGET-001=PENDING_BUDGET_OWNER
DOMESTIC-DATA-001=PENDING_ACCOUNT_ADMIN_EVIDENCE
```

所以保持 live `NO-GO` 是正确行为。

### P2-03 尚无 Qwen live API/D1/R2 端到端闭环：OPEN

当前交付是默认锁定的 Provider 模块。产品 API/worker 尚未运行真实 Qwen 调用，也没有
真实 provider request ID、usage、费用和 D1/R2 审计闭环。接线后必须重新进行 staging
集成 QA。

### P2-04 私有信封 nonce 尚无一次性消费记录：HARDENING

信封已通过 HMAC 与 TTL 防篡改，但 nonce 目前只验证格式，没有在 D1/KV 中执行
“已消费即拒绝”。短 TTL 本身允许有效期内重试；若未来把信封定义为严格一次性凭证，
需要加入 nonce 消费/幂等策略。此项不阻塞当前默认锁定模块，不得据此放宽外部审批门。

## 4. 其他安全验收

| 项目 | 结果 |
|---|---|
| 默认 provider 为 fixture | PASS |
| `VISION_PROVIDER=openai` + 旧 Key/批准变量 | `CONFIGURATION / fetch=0` |
| 浮动模型或其他模型 ID | REJECT |
| 非 staging | REJECT |
| 非 CNY | REJECT |
| JSON 前后含额外说明 | REJECT |
| evidence 缺失 | `PARTIAL + REVIEW`，不补造 |
| Provider 返回不同 model | REJECT |
| outbound Prompt | UTF-8 中文正常 |
| 公开错误正文 | 未含测试 Key 或完整图片 URL |

对 `D:\VisionQA\runs` 扫描：

```text
Bearer
sk-*
dashscope-*
signature=
X-DashScope
VISION_CN_ALIYUN_BAILIAN_API_KEY
```

排除 QA 测试源码后未发现运行日志命中。没有发现响应全文、Authorization 或完整签名
图片 URL 被写入运行日志。

## 5. Canary 数据与真实调用

独立核验：

```text
5/5 source exists
5/5 SHA-256 matches manifest
5/5 rights_match_collection=true
execution_status=NOT_RUN
call_performed=false
```

治理门仍为：

```text
staging_ready=PENDING_PLATFORM_CONFIRMATION
private_short_lived_image_delivery=PENDING_PLATFORM_CONFIRMATION
provider_and_model_approved=PENDING_EXTERNAL_GOVERNANCE_APPROVAL
data_processing_terms_approved=PENDING_EXTERNAL_GOVERNANCE_APPROVAL
budget_approved=PENDING_OWNER_APPROVAL
```

本轮所有 fetch 均为本地注入 mock，未读取真实 Key、未上传图片、未访问 DashScope 或
OpenAI。

```text
QWEN_REAL_CALLS_OBSERVED=0
OPENAI_REAL_CALLS_OBSERVED=0
MODEL_COST_INCURRED_BY_QA=0
```

该结论来自本地执行路径、环境、manifest 和日志交叉核对；激活前仍需账户管理员提供
云端调用/账单基线。

## 6. Go / No-Go

| 范围 | 结论 | 原因 |
|---|---|---|
| 继续 fixture 离线开发 | **GO** | 默认无网络，40/40 |
| 合并 Qwen Adapter 默认锁定实现 | **GO** | 初审 P1 已关闭；PENDING 门不可绕过 |
| 启用 staging API 接线但保持 fetch=0 | **CONDITIONAL GO** | 可做审计与错误链路集成，不得配置真实调用 |
| 运行 5 张真实 Qwen canary | **NO-GO** | Provider、预算、数据、平台证据仍 PENDING |
| production | **NO-GO** | 不在授权范围，且没有真实端到端闭环 |

真实 canary 重新申请独立 QA 的最小条件：

1. 外审决定三项有姓名、日期、证据引用和明确批准；
2. registry 以代码审查方式更新 artifact SHA 与 activation status；
3. 百炼北京空间、固定模型、不训练、留存、删除、人工访问边界证据完成；
4. 真实 R2 signer 从可信对象元数据生成信封，并完成到期后不可读测试；
5. staging D1/R2 产生可追踪 evaluation ID；
6. 账户侧 20 CNY 硬停完成实测；
7. CTO 另行批准一次 5 张、总请求 15、并发 1 的 canary；
8. canary 运行前后均由 QA 核对调用/账单基线。
