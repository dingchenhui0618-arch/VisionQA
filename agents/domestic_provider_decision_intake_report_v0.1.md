# VisionQA 国产 Provider 决策接入报告 v0.1

> 角色：国产 Provider 决策接入 Agent  
> 日期：2026-07-29  
> 状态：`ROUTE_APPROVED / ACTIVATION_PENDING / NETWORK_REQUEST_COUNT=0`

## 1. 职责、输入、输出与验收

### 职责

- 读取实际返回的决策 CSV，而不是按聊天摘要判定；
- 校验四行决定的唯一 ID、合法 decision、条件、审查者角色和日期；
- 将产品批准、预算批准和阿里云账户管理员可证明事项分开；
- 绑定审批 artifact 的路径、ID 与 SHA-256；
- 在任何权限或证据模糊时保持 `PENDING`，不读取或索要 API Key，不调用模型。

### 输入

- `D:\VisionQA\handoffs\DOMESTIC_PROVIDER_REVIEW_v0.1\provider_activation_decisions.csv`
- `D:\VisionQA\handoffs\DOMESTIC_PROVIDER_REVIEW_v0.1\README.md`
- `D:\VisionQA\agents\domestic_model_selection_report_v0.1.md`
- `D:\VisionQA\agents\domestic_model_data_governance_v0.1.md`
- `D:\VisionQA\agents\domestic_provider_change_control_v0.1.md`
- `D:\VisionQA\web\lib\visionqa\providers\registry.ts`

### 输出

- 本报告；
- `D:\VisionQA\handoffs\DOMESTIC_PROVIDER_REVIEW_v0.1\execution_ledger.csv`；
- 总执行台账中的四项国产 Provider 记录；
- Qwen registry 中当前返回 artifact 的哈希绑定（状态仍非 `APPROVED`）。

### 验收结果

- PASS：CSV 恰好 4 行，4 个 `decision_id` 唯一且均为预期 ID；
- PASS：四行 `reviewer_decision` 均为允许值 `APPROVE`，日期均为 `2026-07-29`；
- PASS：四个 `evidence_ref` 的基础文件均真实存在；
- PASS：审批 artifact 已绑定绝对路径、ID 与 SHA-256；
- PASS：预算范围精确记录为 **¥20 / 5 张 / 15 请求 / 并发 1**；
- PASS：未读取、记录或要求任何 API Key、AccessKey、SecretKey 或 Token；
- PASS：未发起模型请求，`NETWORK_REQUEST_COUNT=0`；
- FAIL（激活门）：提交者角色与三项所需权责未完全匹配，阿里云管理员证据不存在。

## 2. Artifact 绑定

```text
artifact_path = D:\VisionQA\handoffs\DOMESTIC_PROVIDER_REVIEW_v0.1\provider_activation_decisions.csv
artifact_id = DOMESTIC_PROVIDER_REVIEW_v0.1
artifact_sha256 = 70b50cb4c5e2dbb493d1d32e70023b37191f92f0e3a7b0d3a72425bf55796dde
row_count = 4
unique_decision_id_count = 4
```

当前 artifact 已被 registry 绑定，但 registry 的 `activationStatus` 为
`PENDING_ROLE_AND_ACCOUNT_EVIDENCE`。治理代码只接受精确的 `APPROVED`，因此即使环境变量被错误开启，也会在 `fetch` 前失败。

## 3. 规范化结果

| decision_id | 原始决定 | 所需角色 | 实际提交者声明 | 规范化结果 | 执行状态 |
|---|---|---|---|---|---|
| `DOMESTIC-ROUTE-001` | APPROVE | 外部产品/技术审查 | 投资人 + 产品负责人，代理外部审查 | `APPROVED_ROUTE_ONLY` | 路线完成，不构成激活 |
| `DOMESTIC-QWEN-001` | APPROVE | 外部技术审查 | 投资人 + 产品负责人，代理外部审查 | `PENDING_TECHNICAL_REVIEW_AUTHORITY` | 待明确技术审查权限 |
| `DOMESTIC-BUDGET-001` | APPROVE | 预算责任人 | 投资人 + 产品负责人，代理外部审查 | `PENDING_BUDGET_OWNER_ROLE_CONFIRMATION` | 待明确预算授权身份 |
| `DOMESTIC-DATA-001` | APPROVE | 数据责任人 / 阿里云账户管理员 | 投资人 + 产品负责人，代理外部审查 | `CONDITIONAL_PRODUCT_APPROVAL_ONLY` | 待账户管理员证据 |

### 判定说明

`DOMESTIC-ROUTE-001` 与用户此前“真实模型改为国产模型”的直接授权一致，可以作为路线决定接入。

其余三项不能仅凭 `APPROVE` 字样升级为可执行批准：

- Qwen 行需要外部技术审查权限；当前姓名栏没有明确声明该权限；
- 预算行要求预算责任人批准；“投资人”可能具备预算权，但 CSV 没有明确声明，不能推定；
- 数据行明确以管理员证据齐全为条件；提交者没有声明阿里云账户管理员身份，也没有附管理员证明。

## 4. 管理员证据核验

外审目录实际只有：

- `README.md`
- `provider_activation_decisions.csv`

项目范围内没有找到阿里云账户管理员证明 Markdown/PDF、脱敏控制台截图、合同条款引用或工单引用。因而以下项目均保持未证明：

1. 业务空间、Endpoint 和模型权限实际固定在 `cn-beijing`；
2. 账户可调用精确快照 `qwen3-vl-plus-2025-12-19`；
3. 未开启训练、评测集、质量改进或日志回流授权；
4. 图片、Prompt、响应、审核副本、故障日志和备份的精确保留天数；
5. 删除 SLA、备份淘汰期与删除证明；
6. 人工审核的角色、触发条件、访问审计与关闭能力；
7. PrivateLink/VPC 可用性，或 staging R2 GET-only、随机路径、TTL≤15 分钟私有 URL 的实测证据；
8. 独立 staging 空间、固定模型/IP allowlist 与默认全网白名单关闭；
9. 账户侧配额，以及代码侧 ¥20 预扣和 `fetch` 前硬停实测。

管理员证据路径：`NOT_FOUND`。README 和公开治理报告不能替代账户、合同或工单证据。

## 5. 当前激活状态

```text
DOMESTIC_ROUTE = APPROVED
QWEN_TECHNICAL_APPROVAL = PENDING_ROLE_CONFIRMATION
DOMESTIC_BUDGET_APPROVAL = PENDING_ROLE_CONFIRMATION
ALIYUN_ACCOUNT_GOVERNANCE_EVIDENCE = NOT_FOUND
STAGING_D1_R2 = SEPARATE_PLATFORM_GATE
APPROVAL_REGISTRY = PENDING_ROLE_AND_ACCOUNT_EVIDENCE
QWEN_FETCH = DISABLED
NETWORK_REQUEST_COUNT = 0
PRODUCTION = NO_GO
```

即使 Cloudflare OAuth 已完成，它也只解除 staging 基础设施认证阻塞，不会补齐 Qwen 的技术审查权限、预算责任人权限或阿里云账户治理证明。

## 6. 最小补证

不需要提交任何密钥。只需要三类非敏感证明：

1. 提交者或另一审查者明确声明其承担“外部技术审查角色”，并确认 `DOMESTIC-QWEN-001`；
2. 预算责任人明确声明批准 **¥20 硬停、5 张、最多 15 请求、并发 1、禁止自动续费**；
3. 阿里云账户管理员按 README 的十项清单提供脱敏证据引用。

在这些证明与独立 staging 验收全部通过后，仍需单独的本次运行显式批准，才能申请最多 5 张 canary；不会自动切到 production。
