# VisionQA 阿里云 Staging Wave1 独立发布 QA 报告 v1.0

> 审查日期：2026-07-31（Asia/Shanghai）  
> 审查对象：`ALIYUN_STAGING_WAVE1_v1.0`、`VisionQA_ALIYUN_STAGING_WAVE1_v1.0.zip`、RAM v0.2.3 及其 Role/STS 资产  
> 云端执行：0；Chrome 云写：0；资源创建：0；费用：0；模型调用：0  
> **最终结论：`NO_GO`**

## 1. 制品身份

- ZIP SHA-256 独立复算：
  `C1C8D0CDA62148BB44CDF73990B723BC06E08A1C992087F8B7FDC955B913046C`
- `SHA256SUMS` 文件 SHA-256 独立复算：
  `6C37FF86F11409F6FA0E76FC44AC9B7ADF0A5C2949E5D7409C035606059940D2`
- 目录脚本 `bash -n`：PASS。
- v0.1–v0.9 仍应保持 `SUPERSEDED_DO_NOT_RUN`。

## 2. 目标 STS 安全设计复核

静态复核确认设计方向正确：

- Operator 先做身份探针，要求精确 `visionqa-staging-operator` RAMUser；
- Role 名固定为 `visionqa-staging-wave1-executor`；
- Role trust policy 只有一个 Operator 主体、唯一 `sts:AssumeRole`、`acs:MFAPresent=true`；
- Role 最大会话时长固定 3600 秒；
- AssumeRole 必须返回 ID、Secret、SecurityToken、Expiration；
- 剩余有效期要求 300–3600 秒；
- 子 Shell 设置精确 `ALIBABA_CLOUD_IGNORE_PROFILE=TRUE`，清除 legacy、profile、metadata、OIDC 等其他链；
- 二次 `GetCallerIdentity` 严格验证 `AssumedRoleUser`、账号、固定 Role 和本次 SessionName；
- Secret 只在 shell 变量/子 Shell 环境内使用，runner 不打印原始 STS 响应，不写入 ledger/context；
- 既有 Wave1 资源、OSS/BPA/SSE/lifecycle、预算、回滚、FC 固定 ARN 和禁止项设计未见扩大。

## 3. 发布阻断

### P1-1：凭证门测试直接失败

独立运行：

```text
test_credential_gate.sh
```

结果首个正向用例失败：

```text
CREDENTIAL_GATE_TEST=FAIL case=cloudshell_sts expected=pass
reason=sts_runner_context_required
```

原因是生产 `credential_gate.sh` 强制要求：

```text
VISIONQA_STS_RUNNER_ACTIVE=TRUE
VISIONQA_STS_SESSION_NAME=...
```

但 `test_credential_gate.sh` 的 `run_case` 没有注入 runner 上下文。该测试无法独立验证 29 个凭证用例，也不能作为发布证据。

安全修订方向二选一，必须保持同样安全强度：

1. 把 credential gate 测试集成到真实 `wave1_sts_runner.sh` 的测试 harness，由 runner 先建立上下文；或
2. 只在测试 stub 内注入格式正确的 `VISIONQA_STS_RUNNER_ACTIVE=TRUE` 与 session name，生产实现不放宽上下文门。

不得通过删除或放宽 `sts_runner_context_required` 修复测试。

### P1-2：STS runner 测试桩不覆盖新增只读 Action

独立运行：

```text
test_sts_runner.sh
```

结果失败，追踪到测试 `aliyun` stub 对生产 runner 新增的只读调用没有响应：

```text
STS_RUNNER=FAIL reason=executor_role_read_failed
```

生产 runner 在 AssumeRole 前会调用 `ram GetRole` 验证 trust policy 和 MaxSessionDuration，随后调用 `ram ListAccessKeys` 验证 Operator AccessKey 数量为 0；测试 stub 仍只处理 STS 两个 Action，默认退出 97。测试必须补齐安全的脱敏 stub 响应并断言：

- GetRole 信任主体精确为指定 Operator；
- `sts:AssumeRole` 唯一；
- MFA 条件为 true；
- MaxSessionDuration=3600；
- ListAccessKeys 返回 0；
- 任何 Role trust drift 或 AccessKey 非 0 都 fail-closed。

不得删除生产只读检查以迁就旧 stub。

### P1-3：`SHA256SUMS` 不能在真实 Bash 中校验

`SHA256SUMS` 包含 UTF-8 BOM 和 CRLF 行尾。PowerShell `Get-FileHash` 可以得到预期 SHA，但真实 Git Bash 执行：

```bash
sha256sum -c SHA256SUMS
```

结果为全部文件名带 `\r`、`FAILED open or read`，并提示第一行格式问题。README 的发布验收依赖该命令，因此这是跨平台发布阻断。

必须重新生成无 BOM、LF 行尾的 `SHA256SUMS`，然后同步更新目录 SHA、ZIP 内容和 ZIP SHA。不能在 Cloud Shell 现场用 `sed` 修改已审定 ZIP。

## 4. 已通过的回归项

| 检查 | 结果 |
|---|---|
| Bash 语法 | PASS |
| 状态路径 | `BASH_STATE_PATHS=PASS cases=8` |
| I/O 故障 | `IO_FAULT_INJECTION=PASS cases=6` |
| manifest/ledger 攻击 | `STATE_ATTACK_TESTS=PASS cases=5` |
| ZIP SHA | PASS |
| SHA256SUMS 文件 SHA | PASS（文件身份，不代表校验命令可用） |
| 凭证门完整测试 | FAIL（P1-1） |
| STS runner 测试 | FAIL（P1-2） |
| 静态禁止项 | PASS |
| RAM/Role Action 边界 | 静态 PASS，尚未云端验证 |

未发现 `set -x`、`printenv`、secret/Token 输出、RDS/NAT/EIP/Qwen/BSS/AccessKey 创建、公共入口或安全组入站调用。

## 5. 解禁条件

必须发布新的不可覆盖版本：

1. 修正 credential gate 测试 harness，使 29 个用例在真实 runner 上下文中执行并全通过；
2. 补齐 STS runner 的 GetRole/ListAccessKeys 脱敏 stub 与 trust/MaxSessionDuration/AccessKey=0 断言；
3. 重新生成无 BOM、LF 的 `SHA256SUMS`；
4. 重新计算所有清单 SHA 和 ZIP SHA；
5. 在真实 Git Bash 中验证：
   - `bash -n` 全部通过；
   - 凭证测试全通过；
   - STS runner 测试 PASS；
   - `sha256sum -c SHA256SUMS` 全部 `OK`；
   - 状态 8/8、I/O 6/6、攻击 5/5；
   - 禁止项与 RAM/Role 边界静态扫描通过。
6. 由独立 QA 给出新的 `GO_FOR_MANUAL_CLOUDSHELL` 后，才可继续 Chrome 云端操作。

## 6. 最终裁决

```text
V1.0_LOCAL_DESIGN=PASS
V1.0_RELEASE_TESTS=NO_GO
P1_OPEN=3
CLOUD_WRITE=0
```

**v1.0 不能上传或执行。** 这不是要求用户补交 AccessKey；需要修订测试/制品格式并重新交独立 QA。
