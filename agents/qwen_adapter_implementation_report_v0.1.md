# VisionQA Qwen Provider Adapter 实现报告 v0.1

> 角色：Qwen Provider Adapter 实现 Agent  
> 日期：2026-07-29  
> 状态：`IMPLEMENTED / MOCK_VERIFIED / NO_LIVE_CALL / ACTIVATION_LOCKED`

## 1. 职责、输入、输出与验收

### 职责

- 实现阿里云百炼华北 2（北京）Qwen 多模态 Provider Adapter；
- 保持 v0.3 契约、Fixture、本地确定性评分、Gate 和 Repair Prompt 不变；
- 在网络前执行 provider、模型、staging、数据治理、secret、预算、批量和并发硬门；
- 实现兼容接口请求、严格 JSON 解析、错误分类、重试边界和图片 preflight；
- 默认停用旧 OpenAI live 路径，不执行任何真实或付费调用。

### 输入

- `agents/domestic_model_selection_report_v0.1.md`
- `agents/domestic_adapter_architecture_v0.1.md`
- `agents/domestic_model_data_governance_v0.1.md`
- `web/lib/visionqa/providers/*`
- `contracts/evaluation-result-v0.3.schema.json`

### 输出

- `web/lib/visionqa/providers/registry.ts`
- `web/lib/visionqa/providers/governance.ts`
- `web/lib/visionqa/providers/image-preflight.ts`
- `web/lib/visionqa/providers/qwen.ts`
- 更新 `factory.ts`、`types.ts`、`index.ts`
- 更新 Adapter README 和 mock 测试
- 本报告

### 验收结果

| 验收项 | 结果 | 证据 |
|---|---|---|
| 不执行真实调用 | PASS | 所有 live 测试使用注入的 mock fetch；默认 Fixture |
| 任一批准/证据/secret/model 门缺失时 fetch=0 | PASS | 参数化测试逐项删除 28 个配置门，网络调用保持 0 |
| 固定模型不可被环境变量替换 | PASS | registry 固定 `qwen3-vl-plus-2025-12-19`；别名和未批准 ID 均拒绝 |
| evidence 缺失降级 REVIEW | PASS | 既有 Orchestrator 行为保留并通过测试 |
| URL/secret 不进入结果与错误 | PASS | 输出序列化脱敏测试、错误不回显输入 URL |
| 旧 OpenAI 环境变量不能触发网络 | PASS | Factory 显式拒绝 `VISION_PROVIDER=openai`，fetch=0 |
| Adapter tests | PASS | 13/13 |
| 全量 tests | PASS | 40/40（8 个构建/静态测试 + 32 个 TypeScript 测试） |
| lint | PASS | 0 error |
| build | PASS | vinext production build 完成 |

## 2. 固定 Provider 注册

代码内静态注册：

```text
provider = aliyun-bailian-cn-beijing
endpoint = https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
model = qwen3-vl-plus-2025-12-19
protocol = OpenAI-compatible Chat Completions
mode = non-thinking
structured output = json_object + local strict validation
```

Provider、endpoint、模型快照和图片 host allowlist 均不能通过环境变量任意覆盖，
registry 对象及 host 数组同时执行运行时 `Object.freeze`。
增加真实 staging R2 hostname 必须经过代码评审。

旧 `openai.ts` 仅作为历史实现文件保留；Factory 不再构造它。即使运行环境残留
旧 OpenAI Key、批准变量和模型 ID，也只会得到 `CONFIGURATION`，不会发起网络
请求。

## 3. 治理组合门

Qwen Factory 在创建 Adapter 前验证：

- `QWEN_PROVIDER_APPROVED=true`；
- provider 批准值与 registry 完全一致；
- 只允许 `staging`，并要求 staging D1/R2 已验收；
- commercial seed 权利 allowlist 命中；
- 中国大陆处理、不训练、留存范围、内容审核/人工访问、删除/备份 SLA 均有证据；
- 租户隔离、日志回流关闭、secret manager、IP/model allowlist 和成本硬停完成；
- 本次运行绑定明确的 approval artifact path/id/SHA-256、三个 decision id、
  canary manifest id/SHA-256；
- 固定模型、CNY 预算、批量和并发全部有效。

预算使用人民币“分”为最小单位，不做静默汇率换算：

- 不继承原 OpenAI 的人民币 350 元、50 张、并发 3；
- 首轮 canary 强制人民币 20 元，即 `2000` 分；
- 预计批成本必须不超过本批预算；
- 图片数必须等于 5、总请求上限必须等于 15、并发必须等于 1；
- 21 元、6 张、16 请求或并发 2 均会在 `fetch` 前失败。

任一条件未知、缺失或不一致，均在 Adapter 创建阶段失败，网络请求数为 0。
当前绑定的外审 artifact 仍是 `PENDING`，registry 的
`activationStatus=PENDING_EXTERNAL_APPROVAL` 会继续硬锁 Factory。外审更新 CSV
后必须在独立代码评审中更新 SHA-256 和状态，不能仅修改运行环境布尔值激活。

## 4. 图片与请求安全

- 只接受静态 allowlist host 上的 HTTPS 图片；
- 每张图必须携带平台 staging asset signer 生成的 HMAC-SHA256 v1 信封；
- 签名 canonical payload 包含 issuer、nonce、role、MIME、expiresAt、asset
  SHA-256、可信 byteSize、URL host、path SHA-256 和完整 URL SHA-256；
- Adapter 使用只来自环境 secret 的 HMAC key 验签，key 至少 32 bytes；
- `access` 必须是 `short_lived_private`，URL 必须在未来 15 分钟内过期；
- 拒绝用户密码、fragment、非 allowlist host 和不支持的 MIME；
- HMAC 认证后的对象大小必须不超过 10 MiB；`10 MiB + 1 byte` 在网络前失败；
- 最多 5 张图片/请求，格式仅 JPEG、PNG、WebP；
- 请求固定 `response_format={"type":"json_object"}` 与
  `enable_thinking=false`；
- 结果只记录 provider/model/request id/usage/latency，不记录图片 URL、
  query、Authorization、Key、请求正文或原始响应。

## 5. JSON 与本地确定性边界

解析器只接受：

1. 单一、完整 JSON object；
2. 没有额外说明文字的纯 `json` code fence。

随后严格检查：

- 必需顶层字段；
- 三项客观 Skill；
- 商业六项；
- score 必须为 `null` 或 0–100 有限数；
- assessability 必须属于固定枚举；
- evidence、summary、strengths、gaps 和人工检查字段类型。

Provider 自报的最终 Gate、权重、综合分或 Repair Prompt 不在草稿契约中，不会
进入最终结果。最终 v0.3 仍由本地 Orchestrator 重算并执行 runtime validator。
非空 score 缺 evidence 时，分数置 `null`，结果降为
`PARTIAL + REVIEW`，不补造证据。

## 6. 错误和重试

只重试：

- `RATE_LIMITED`
- `PROVIDER_UNAVAILABLE`
- `NETWORK`
- `TIMEOUT`

不重试：

- `CONFIGURATION`
- `AUTHENTICATION`
- `INVALID_OUTPUT`
- `POLICY_BLOCKED`
- `PAYLOAD_TOO_LARGE`
- `UNSUPPORTED_MEDIA`
- `QUOTA_EXHAUSTED`
- `ABORTED`

厂商 HTTP 200 业务错误会先按限流、内容安全、欠费/额度和模型错误分类，不会
被误报为普通 JSON 错误或执行无意义付费重试。

## 7. 验证命令

```text
npm run test:adapters  # 13/13
npm test               # 40/40
npm run lint           # PASS
npm run build          # PASS
```

验证过程中没有读取真实密钥、没有上传图片、没有调用百炼或 OpenAI，也没有产生
模型费用。

## 8. UTF-8 P1 复核记录

独立 QA 最初将 PowerShell 默认控制台解码输出中的乱码判断为源码
mojibake。随后使用 UTF-8 读取源文件并核对实际 mock outbound request，确认：

- `qwen.ts` 实际发送的中文 Prompt 可读；
- `orchestrator.ts` 的证据不足降级文案可读；
- 问题只存在于 PowerShell 控制台显示解码，不存在于 UTF-8 源码或请求字节；
- 原 P1 已撤销，没有以该误报为由改写业务 Prompt 或降级文案。

为防止未来真实编码回归，本轮仅增加不改变业务语义的测试：

1. 从 mock fetch 捕获实际 outbound Prompt，断言包含“服饰电商”“证据”“JSON”
   和禁止猜测/补造证据约束；
2. 断言降级摘要与人工复核文案保持可读中文；
3. 递归以 UTF-8 读取 `web/lib/visionqa/**/*.ts`，拒绝 Unicode replacement
  character 和常见 mojibake 标记。

## 9. 独立 QA P1/P2 修复闭环

### P1-01：canary 范围未绑定明确批准

状态：`FIXED / ACTIVATION_STILL_LOCKED`

- registry 固定 artifact path/id/SHA、decision ids 和 manifest id/SHA；
- 运行配置必须严格为 20 CNY、5 images、15 requests、concurrency 1；
- 宽松值和任一 artifact/manifest 漂移都有 `fetch=0` 负测；
- 当前 artifact 是待审批版本，编译期状态仍为
  `PENDING_EXTERNAL_APPROVAL`，即使全部布尔变量手填为 true 也不能构造 live
  Factory Adapter。

### P1-02：可注入 definition 绕过 registry

状态：`FIXED`

- `QwenBailianVisionAdapter` 和构造 options 均改为模块私有，不再 production
  export；
- 唯一导出的 live seam `createGovernedQwenBailianAdapter` 在模块内部重新执行
  完整 `assertQwenGovernance`，不能接受预制 capability、apiKey、HMAC secret
  或 definition；
- Adapter 内部只读取冻结的 `QWEN_BAILIAN_DEFINITION`；
- 测试通过动态 import 断言 class 不存在，并验证 Factory 和唯一 exported seam
  在 artifact=PENDING 时即使传入完整环境也保持 `fetch=0`；
- 离线正向测试只调用无网络的 request builder、parser 和 preflight，不存在
  production 可调用的 test-only live constructor。

### P1-03：私有 URL 只相信 caller 声明

状态：`FIXED`

- 新增 `private-image-envelope.ts`；
- 平台 signer 使用 HMAC-SHA256 签发可信元数据；
- Adapter 内验证签名与 URL host/path/query、过期时间、asset SHA、byteSize、
  issuer 和 nonce 的绑定；
- 缺签、错签、改 host、改 path/query、过期全部 `fetch=0`。

### P2-01：10 MiB 只声明未执行

状态：`FIXED`

byteSize 由平台 signer 放入不可篡改信封，preflight 在 HMAC 验证后执行
`maxImageBytes`。篡改 byteSize 会先导致错签；合法签名的 10 MiB + 1 byte 会得到
`PAYLOAD_TOO_LARGE`，不会产生网络请求。

## 10. 未授权与下一 Gate

本次完成的是“可审计且默认锁定的实现”，不等于允许真实调用。真实 canary 前仍需
账户管理员提供不含 secret 的证据，并由外部审查角色确认所有组合门实际成立：

- 百炼北京业务空间与固定模型可用；
- retention、deletion/backup、人工访问和不训练证据；
- 日志回流关闭；
- staging secret、IP/model allowlist 和账户侧预算硬停；
- 真实 staging R2 私有 hostname 进入代码 allowlist；
- 外审决定表从 PENDING 变为有姓名、日期和证据引用的明确批准，并在 reviewed
  commit 中更新 artifact SHA 与 activation status；
- 一次明确的 5 张、20 CNY、最多 15 请求、并发 1 canary 运行批准。

在此之前：

```text
DEFAULT_PROVIDER = fixture
OPENAI_LIVE = disabled
QWEN_LIVE = locked
REAL_NETWORK_CALLS = 0
PRODUCTION = no-go
```
