# VisionQA 国产 Provider 变更控制报告 v0.1

> 角色：国产 Provider 变更控制 Lead  
> 日期：2026-07-29  
> 状态：`CHANGE_RECORDED / QWEN_PREFERRED / NO_LIVE_CALL`

## 1. 职责、输入、输出与验收

### 职责

- 正式记录用户将真实模型路线从 OpenAI 切换为国产模型；
- 保留旧审批历史，阻止旧环境变量或旧批准恢复 OpenAI；
- 将 Provider 选型与账户数据治理证明分离；
- 建立无需密钥的最小外审与管理员证明清单。

### 输入

- `agents/domestic_model_selection_report_v0.1.md`
- `agents/domestic_model_data_governance_v0.1.md`
- `agents/domestic_adapter_architecture_v0.1.md`
- `handoffs/MVP_EXTERNAL_REVIEW_v0.1/external_review_decisions.csv`
- `handoffs/MVP_EXTERNAL_REVIEW_v0.1/execution_ledger.csv`

### 输出

- 本报告；
- `handoffs/DOMESTIC_PROVIDER_REVIEW_v0.1/README.md`；
- `handoffs/DOMESTIC_PROVIDER_REVIEW_v0.1/provider_activation_decisions.csv`；
- `PROJECT_STATE.md` 与执行台账的变更记录。

### 验收标准

- 原 OpenAI 四项决定保留，但为 `SUPERSEDED_NOT_ACTIVATED`；
- Qwen 首选、GLM 备用、豆包/千帆 HOLD；
- 用户的路线授权不被误写为阿里云数据治理已通过；
- 北京地域、固定模型、不训练、保留、删除、人工审核、网络路径和预算逐项列证；
- 不索要、不记录任何 secret；
- 真实网络调用仍为 0。

## 2. 变更决定

```text
旧路线：OpenAI / gpt-4o
新路线首选：aliyun-bailian / cn-beijing / qwen3-vl-plus-2025-12-19
备用：zhipu-bigmodel / glm-4.6v
HOLD：volcengine-doubao / baidu-qianfan
```

用户的“真实模型换成国产模型”构成**路线级授权**。它允许团队停止 OpenAI 激活工作并进入国产 Provider 外审、Adapter 和账户证明阶段；它不构成：

- 对任一阿里云账户、合同或数据处理条款的事实证明；
- 对 20 元人民币预算的批准；
- 对实际发送 commercial-seed 的单次运行批准；
- 对 production 或自动发布的批准。

## 3. 原 OpenAI 决定的处理

以下原决定均没有产生真实调用，现由新方向替代：

| 原 decision_id | 历史 raw decision | 新执行状态 |
|---|---|---|
| `PROVIDER-OPENAI-001` | APPROVE | `SUPERSEDED_NOT_ACTIVATED` |
| `PROVIDER-MODEL-001` | APPROVE / gpt-4o | `SUPERSEDED_NOT_ACTIVATED` |
| `PROVIDER-PAID-001` | APPROVE / ≤50 USD | `SUPERSEDED_NOT_ACTIVATED` |
| `PROVIDER-DATA-001` | APPROVE / OpenAI data controls | `SUPERSEDED_NOT_ACTIVATED` |

旧记录不得删除或改写为“从未批准”；正确表述是“历史上批准，但组合门未闭环、从未激活，后被国产路线替代”。原 50 USD 预算不得换算或继承为国产模型预算。

## 4. 当前 Provider 队列

| 顺位 | Provider / 模型 | 状态 | 依据 |
|---|---|---|---|
| 1 | 阿里云百炼 `qwen3-vl-plus-2025-12-19`，华北 2（北京） | `PREFERRED_CONDITIONAL` | 固定快照、图像输入、JSON mode、公开“不训练”与国内地域证据较完整 |
| 2 | 智谱 `glm-4.6v` | `BACKUP_CONDITIONAL` | 视觉电商能力匹配，但留存、地域、人工访问、固定快照和价格仍需企业补证 |
| 3 | 豆包视觉 | `HOLD` | 标准客户数据授权可能允许模型优化且存在长期/不可撤回风险 |
| 4 | 百度千帆 | `HOLD` | 标准协议中的保密边界与购买素材的非公开属性冲突 |

## 5. 证据状态

| 项目 | 当前结论 | 证据责任人 |
|---|---|---|
| 北京地域 | 官方文档可确认华北 2；账户实际地域和全链路境内仍待证明 | 阿里云账户管理员 / 合同或工单 |
| 固定模型 | 官方存在 `qwen3-vl-plus-2025-12-19`；账户可用性待证明 | 阿里云账户管理员 |
| API 数据不训练 | 官方隐私说明已有公开承诺 | 账户管理员仍需证明未开启日志回流、训练/评测授权 |
| 保存时长 | 未知；“不训练”不等于零留存 | 阿里云账户管理员 / 合同或工单 |
| 删除 SLA / 备份淘汰 | 未知 | 阿里云账户管理员 / 合同或工单 |
| 人工审核 / 内容安全访问 | 未知 | 阿里云账户管理员 / 合同或工单 |
| 私网 / 租户隔离 | 业务空间隔离可用；该模型 PrivateLink 未证实 | 阿里云账户管理员 |
| 短期图片 URL | 项目要求私有、GET-only、随机路径、TTL≤15分钟；真实 staging R2 尚未验收 | Cloudflare Platform Agent + 数据责任人 |
| 项目预算上限 | 技术建议 20 CNY；尚待预算责任人批准并实测硬停 | 预算责任人 + Adapter QA |

## 6. 当前 Gate

```text
USER_DOMESTIC_ROUTE_AUTHORIZED = true
OPENAI_APPROVALS = SUPERSEDED_NOT_ACTIVATED
PREFERRED_PROVIDER = aliyun-bailian
PREFERRED_REGION = cn-beijing
PREFERRED_MODEL = qwen3-vl-plus-2025-12-19
BACKUP_PROVIDER_MODEL = zhipu-bigmodel/glm-4.6v
DOUBAO = HOLD
QIANFAN = HOLD
ALIYUN_ACCOUNT_GOVERNANCE_EVIDENCE = INCOMPLETE
DOMESTIC_BUDGET_APPROVAL = PENDING
REAL_NETWORK_CALLS = 0
PRODUCTION = NO_GO
```

下一步是由外部审查者与阿里云账户管理员完成
`handoffs/DOMESTIC_PROVIDER_REVIEW_v0.1`，而不是提交 API Key。只有全部证据闭环后，才可另行申请最多 5 张、并发 1、人民币硬停的 staging canary。

