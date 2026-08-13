# VisionQA Wave1 v1.0 STS Runner 发布交接

日期：2026-07-31（Asia/Shanghai）
状态：`READY_FOR_INDEPENDENT_QA / DO_NOT_RUN_UNTIL_QA_GO`

## 发布内容

- 目录：`D:\VisionQA\handoffs\ALIYUN_STAGING_WAVE1_v1.0`
- ZIP：`D:\VisionQA\handoffs\VisionQA_ALIYUN_STAGING_WAVE1_v1.0.zip`
- ZIP SHA-256：`C1C8D0CDA62148BB44CDF73990B723BC06E08A1C992087F8B7FDC955B913046C`
- 目录 SHA256SUMS 文件 SHA-256：`6C37FF86F11409F6FA0E76FC44AC9B7ADF0A5C2949E5D7409C035606059940D2`

## v1.0 核心安全入口

`wave1_sts_runner.sh` 只允许 Operator 先 AssumeRole 到固定的 `visionqa-staging-wave1-executor`，并在内存子 Shell 中使用完整 STS 三元组。它验证：Operator 身份、固定角色 ARN、固定会话名前缀、AssumeRole 返回的完整凭证、Expiration 剩余 300–3660 秒、二次 AssumedRoleUser 身份。随后设置 `ALIBABA_CLOUD_IGNORE_PROFILE=TRUE`，清理 legacy/profile/metadata/OIDC 链，再调用原审定 preflight/apply/verify。任一失败都停止，不自动 rollback。

临时 ID、Secret、SecurityToken、Expiration、原始 STS 响应不打印、不写盘、不进 ledger/聊天。

## 本地验证

```text
STS_RUNNER_TESTS=PASS
CREDENTIAL_GATE_TESTS=PASS cases=29
BASH_STATE_PATHS=PASS cases=8
IO_FAULT_INJECTION=PASS cases=6
STATE_ATTACK_TESTS=PASS cases=5
```

## 云端状态

- 专用 Role 与策略已由管理员 Agent 创建并完成静态边界核验；Operator AccessKey=0。
- Chrome 中 Operator Cloud Shell 身份已确认；尚未调用 AssumeRole、preflight、apply 或 verify。
- 独立 QA 给出 `GO_FOR_MANUAL_CLOUDSHELL` 前禁止任何云写操作。
