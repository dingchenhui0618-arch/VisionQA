# VisionQA 阿里云 Staging Wave1 独立发布 QA 报告 v0.6

> 审查日期：2026-07-30（Asia/Shanghai）  
> 审查对象：`ALIYUN_STAGING_WAVE1_v0.6`、`VisionQA_ALIYUN_STAGING_WAVE1_v0.6.zip`、实现报告 v0.6、v0.5 云端失败报告、RAM v0.2.3  
> 云端执行：0；云端修改：0；订单：0；模型调用：0  
> **最终结论：`NO_GO`**

## 1. 制品与回归复验

- ZIP SHA-256 独立复算：
  `DF369258ADDD2D8BB5E153E5A0E9DD2B530503ECC56A60A383CA59D5FAE31601`
- RAM v0.2.3 SHA-256：
  `E1DC84A67BC78723AC571D887A700031080F293FFBC53834466426B7FBC8F554`
- ZIP 条目：14/14，与交付目录一致。
- `SHA256SUMS`：12 个包内文件及 RAM 策略全部 `OK`。
- Shell `bash -n`：9/9 PASS。
- 凭证门测试：`CREDENTIAL_GATE_TESTS=PASS cases=9`。
- 状态路径：`BASH_STATE_PATHS=PASS cases=8`。
- I/O 故障：`IO_FAULT_INJECTION=PASS cases=6`。
- manifest/ledger 攻击：`STATE_ATTACK_TESTS=PASS cases=5`。
- 静态禁止能力扫描：可执行脚本中未发现 RDS 下单、NAT/EIP、Qwen/DashScope、AccessKey 创建、公共 OSS、公共 FC 域名或安全组入站授权。
- RAM Action 边界未扩大；FC mutating 仍只绑定两个固定函数 ARN，`ListFunctions` 单独只读。

以上回归通过，但凭证门存在一个发布阻断，测试矩阵把错误行为写成了预期 PASS，因此不能放行。

## 2. P1 阻断：无凭证环境变量时无条件放行 profile/metadata

`credential_gate.sh` 当前逻辑：

```bash
if (( modern_present == 0 && legacy_present == 0 )); then
  VISIONQA_CREDENTIAL_MODE=profile_or_cloudshell_metadata
  return 0
fi
```

这意味着没有 AccessKey/SecurityToken 环境变量时，凭证门本身直接成功。后续 preflight 虽执行 `GetCallerIdentity`，但只提取 `AccountId` 用于桶名哈希，并未再次执行凭证门中的允许身份校验。

因此以下路径仍可通过：

- CLI profile 中配置的长期静态 AccessKey；
- metadata/profile 返回的非 `visionqa-staging-operator` 身份；
- 比 Operator 权限更高的其他可用身份。

这与本轮强制规则“只有 AK + 非空 SecurityToken 且 `GetCallerIdentity`/身份链通过才允许”冲突，也等于用无环境变量 profile 绕过 v0.5 要修复的长期 AK 禁令。

`test_credential_gate.sh` 当前明确写成：

```bash
run_case pass no_environment
```

所以 `9/9 PASS` 并不能关闭该风险；它反而确认了无凭证环境被允许。

## 3. 已正确关闭的路径

以下实现按预期 fail-closed：

- AK 无 SecurityToken；
- 空 SecurityToken；
- 假 Token；
- 过期 Token；
- `GetCallerIdentity` 失败；
- 身份不符；
- modern/legacy 两套凭证变量混用；
- AK ID 或 Secret 不完整。

凭证门不打印 AccessKey、Secret、SecurityToken 或原始 STS 响应；preflight 仅持有 STS 响应于 Shell 变量，随后只保存账号哈希，不输出完整账号标识。未发现 `set -x`、`printenv` 或凭证明文日志。

## 4. 修复与解禁条件

必须发布新的、不可覆盖 v0.6 的版本，并同时满足：

1. 无 modern/legacy 凭证环境变量时默认拒绝，不得回退到任意 CLI profile 或 metadata。
2. 只允许一套完整的凭证族：
   - AccessKey ID 非空；
   - AccessKey Secret 非空；
   - SecurityToken 非空。
3. 使用当前同一凭证链执行 `GetCallerIdentity`，并验证为允许的 Operator 临时会话或经过明确固定的 Cloud Shell assumed-role。
4. 不得只验证 `AccountId` 存在；必须执行允许身份校验。
5. 将 `no_environment` 改为 fail，并新增/保留真实 Shell 测试覆盖：
   - 无凭证；
   - 合法临时 STS；
   - AK 无 token；
   - 空 token；
   - 假 token；
   - 过期 token；
   - 身份不符；
   - modern/legacy 混合；
   - 不完整 AK。
6. 保持不输出凭证、原始 STS 响应或完整账号标识。
7. 重新计算 `SHA256SUMS` 与 ZIP SHA，由独立 QA 重新执行全套回归。

## 5. 版本裁决

- v0.1–v0.5：`SUPERSEDED_DO_NOT_RUN`。
- v0.6：`NO_GO / DO_NOT_UPLOAD_OR_EXECUTE`。
- v0.5 的 Cloud Shell 失败仍保持 `NO_CLOUD_RESOURCE_CREATED`；不得回退重跑。

在新版本通过独立 QA 前，不得把 v0.6 上传或执行于 Cloud Shell，也不得手工删除凭证门、修改测试预期或通过其他 profile 绕行。
