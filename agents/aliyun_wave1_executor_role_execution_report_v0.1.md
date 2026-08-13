# VisionQA Wave1 专用执行 Role 管理员执行报告 v0.1

> 日期：2026-07-30（Asia/Shanghai）  
> 执行身份：阿里云主账号 Cloud Shell  
> 报告级别：脱敏；不包含 AccountId、Role ARN、策略版本号或临时凭据。

## 已完成的云端变更

1. 创建专用 RAM Role：`visionqa-staging-wave1-executor`。
2. Role 最大会话时长设为 3600 秒。
3. Role 信任策略仅允许 `visionqa-staging-operator` 调用 `sts:AssumeRole`。
4. Role 信任策略要求 `acs:MFAPresent=true`。
5. 创建并附加最小权限策略 `VisionQAStagingWave1ExecutorV01`。
6. 为现有 `VisionQAStagingOperatorBootstrapV01` 创建新默认版本，将 Operator 收紧为：
   - Cloud Shell 会话权限；
   - 必需的只读身份与资源探针；
   - 仅对唯一专用执行 Role 的 `sts:AssumeRole`；
   - 显式拒绝 RAM 提权、AccessKey、RDS、NAT/EIP、Qwen/DashScope、BSS 等禁止项。

本轮未创建 AccessKey/API Key，未创建 OSS/VPC/vSwitch/安全组/FC/RDS/NAT/EIP 等业务资源，未付费，未调用 Qwen。

## 脱敏静态核验

```text
EXECUTOR_ROLE=CREATED
EXECUTOR_POLICY=CREATED
EXECUTOR_ATTACH=PASS
TRUST_EXACT_OPERATOR_ONLY=PASS
TRUST_MFA_REQUIRED=PASS
MAX_SESSION_DURATION_3600=PASS
ROLE_POLICY_ATTACHMENT_EXACT_ONE=PASS
EXECUTOR_FORBIDDEN_BOUNDARY=PASS
OPERATOR_ASSUME_EXACT_ROLE_ONLY=PASS
OPERATOR_TOTAL_ATTACHED_POLICIES_ONE=PASS
OPERATOR_ACCESS_KEY_ZERO=PASS
```

## 17 项验收状态

| 编号 | 状态 | 说明 |
|---:|---|---|
| 1 | PASS | Operator AccessKey=0 |
| 2 | PASS_STATIC | Operator Allow 中仅有唯一执行 Role ARN 的 `sts:AssumeRole` |
| 3 | PASS | Role 信任主体仅为批准 Operator，并要求 MFA |
| 4 | PASS_STATIC | Role Allow 与审定 Wave1 边界一致或更窄 |
| 5 | PENDING_OPERATOR_SESSION | 必须用 Operator 直接调用安全的预检型 mutating Action 并确认 AccessDenied；主账号不能代测 |
| 6 | PASS_STATIC | 禁止项为显式 Deny |
| 7–13 | BLOCKED_OPERATOR_SESSION | 必须由 Operator 调用 AssumeRole，在内存中核验完整三元组、到期时间、AssumedRoleUser 和 fail-closed；不得由主账号调用 |
| 14 | PENDING_STAGING_AGENT | 需要新版不可覆盖 wrapper 与 ZIP |
| 15 | PENDING_INDEPENDENT_QA | 需要独立 QA 复算 SHA 与全套攻击/泄露测试 |
| 16 | NO-GO | 新 QA 给出 GO 前不得执行 Wave1 |
| 17 | ENFORCED | 任一 preflight 失败必须停止，apply 不得启动 |

## 唯一阻塞

当前 Chrome Cloud Shell 身份为阿里云主账号。阿里云官方规定主账号不能调用 `AssumeRole`，因此无法在本会话完成第 5、7–13 项运行时验证。

下一步仅需要用户在 Chrome 中以 `visionqa-staging-operator` 打开 Cloud Shell，并完成正常登录/MFA；不要发送密码、验证码或任何凭据。随后执行只回显布尔状态的 STS 验证，临时三元组只存在于子 Shell 内存。

## Gate

```text
ADMIN_ROLE_AND_POLICY_MIGRATION=COMPLETE
STATIC_BOUNDARY_REVIEW=PASS
OPERATOR_STS_RUNTIME_VERIFICATION=BLOCKED_OPERATOR_LOGIN_REQUIRED
WAVE1_APPLY=NO-GO
```
