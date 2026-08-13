# VisionQA Alibaba Cloud Wave1 — Cloud Shell 脱敏凭证诊断 v0.1

日期：2026-07-30（Asia/Shanghai）

## 结论

`STOP / DO_NOT_APPLY`

当前 Cloud Shell 会话不是已批准的 `visionqa-staging-operator` 身份。`GetCallerIdentity` 返回的身份类型为 `Account`，与批准 Operator 的匹配结果为 `false`。Wave1 未执行 `apply`，未创建任何云资源。

## 凭证形态矩阵

| 变量 | 状态 |
|---|---|
| `ALIBABA_CLOUD_ACCESS_KEY_ID` | `PRESENT_NONEMPTY` |
| `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | `PRESENT_NONEMPTY` |
| `ALIBABA_CLOUD_SECURITY_TOKEN` | `ABSENT` |
| `ALIYUN_ACCESS_KEY_ID` | `PRESENT_NONEMPTY` |
| `ALIYUN_ACCESS_KEY_SECRET` | `PRESENT_NONEMPTY` |
| `ALIYUN_SECURITY_TOKEN` | `ABSENT` |
| `ALIBABA_CLOUD_CREDENTIALS_URI` | `ABSENT` |
| `ALIBABA_CLOUD_ROLE_ARN` | `ABSENT` |
| `ALIBABA_CLOUD_OIDC_PROVIDER_ARN` | `ABSENT` |

## 身份验证

- `IdentityType`: `Account`
- `approved_operator_match`: `false`
- 账号 ID、ARN、凭证值、长度、前后缀均未输出或记录。

## 安全影响

- v0.9 预检正确以 `incomplete_modern_sts_environment` 拒绝继续。
- 当前两套 AccessKey 变量均存在但没有 SecurityToken，因此不能作为临时 STS 会话接受。
- 当前身份权限高于批准范围，禁止使用该会话执行 Wave1。
- 不得要求用户创建或提供 AccessKey。

## 执行状态

```text
PREFLIGHT=FAIL
APPLY=NOT_STARTED
VERIFY=NOT_STARTED
ROLLBACK=NOT_REQUIRED_NOT_RUN
CLOUD_RESOURCE_CREATED=0
QWEN_CALLS=0
ACCESS_KEY_CREATED=0
```

## Operator 会话复验

重新以 `visionqa-staging-operator` 启动全新 Cloud Shell 后：

- `IdentityType`: `RAMUser`
- `approved_operator_match`: `true`
- modern：AccessKey ID/Secret 非空，SecurityToken 不存在；
- legacy：AccessKey ID/Secret 非空，SecurityToken 不存在；
- 即凭证族状态为 `PARTIAL + PARTIAL`。

该会话身份正确，但仍不满足独立 QA 要求的“至少一套完整临时 STS 链”。因此继续保持 `DO_NOT_APPLY`，不得将两套不完整凭证拼接，也不得要求用户提供 AccessKey。
