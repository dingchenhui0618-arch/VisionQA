# VisionQA 阿里云 Staging Wave1 脚本实现报告 v0.6

> 日期：2026-07-30（Asia/Shanghai）  
> 状态：`READY_FOR_INDEPENDENT_QA / NOT_EXECUTED`  
> 云资源、订单、模型调用：0

## 交付

- `handoffs/ALIYUN_STAGING_WAVE1_v0.6/`
- `handoffs/VisionQA_ALIYUN_STAGING_WAVE1_v0.6.zip`
- ZIP SHA-256：`DF369258ADDD2D8BB5E153E5A0E9DD2B530503ECC56A60A383CA59D5FAE31601`
- RAM 策略继续使用已审定 `ALIYUN_OPERATOR_BOOTSTRAP_v0.2.3`，权限未扩大。

## v0.5 云端失败修复

v0.5 将 Cloud Shell 临时 STS 注入的 AccessKey 环境变量误判为长期静态 AccessKey。v0.6 新增独立凭证门：

- 无凭证环境变量时允许 CLI profile/metadata 路径，后续仍必须通过 `GetCallerIdentity`；
- AK 环境存在时必须存在同族非空 SecurityToken；
- STS 身份必须是指定 Operator RAM 临时会话，或明确的 Cloud Shell assumed-role；
- 长期 AK（无 Token）、空 Token、假/过期 Token、STS 失败、身份不符、现代/旧版变量混用全部 fail-closed；
- 不输出 AccessKey、SecurityToken 或原始 STS 响应。

## 本地验证

| 检查 | 结果 |
|---|---|
| Bash 语法 | PASS |
| 凭证门真实 Shell 路径 | `CREDENTIAL_GATE_TESTS=PASS cases=9` |
| 状态路径 | `BASH_STATE_PATHS=PASS cases=8` |
| I/O 故障注入 | `IO_FAULT_INJECTION=PASS cases=6` |
| Manifest/ledger 攻击 | `STATE_ATTACK_TESTS=PASS cases=5` |
| `SHA256SUMS` | 全部 PASS |
| ZIP 条目检查 | 14/14 |

## Gate

- v0.1–v0.5：`SUPERSEDED_DO_NOT_RUN`
- v0.6：`READY_FOR_INDEPENDENT_QA / NOT_AUTHORIZED_FOR_CLOUD_EXECUTION`

独立 QA 给出 GO 前，不得上传或执行 v0.6。
