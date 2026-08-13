# VisionQA 阿里云 Staging Wave1 独立发布 QA 报告 v0.8

> 审查日期：2026-07-30（Asia/Shanghai）  
> 审查对象：`ALIYUN_STAGING_WAVE1_v0.8`、`VisionQA_ALIYUN_STAGING_WAVE1_v0.8.zip`、实现报告 v0.8、v0.7 QA 报告、RAM v0.2.3  
> 云端执行：0；云端修改：0；订单：0；模型调用：0  
> **最终结论：`GO_FOR_MANUAL_CLOUDSHELL`**

## 1. 制品身份与完整性

- ZIP SHA-256 独立复算：
  `1CD010C14BF7BB7C89C04868C7F5EF9702A5E5CEA1348E262A7AFEE14E4F037B`
- ZIP 条目：14/14。
- RAM v0.2.3 SHA-256 保持：
  `E1DC84A67BC78723AC571D887A700031080F293FFBC53834466426B7FBC8F554`
- `SHA256SUMS`：12 个包内文件及 RAM 策略全部 `OK`。
- Shell `bash -n`：9/9 PASS。
- v0.1–v0.7 保持 `SUPERSEDED_DO_NOT_RUN`；本报告只放行上述指纹对应的 v0.8。

## 2. v0.7 凭证阻断复验

### 2.1 Profile 隔离契约：PASS

`credential_gate.sh` 已固定：

```bash
export ALIBABA_CLOUD_IGNORE_PROFILE=TRUE
```

该值与阿里云 CLI 官方大小写敏感契约一致。官方文档说明只有全大写 `TRUE` 才忽略配置文件 Profile，并只使用环境变量凭证：

- https://www.alibabacloud.com/help/en/cli/environment-variables

### 2.2 Profile 优先级仿真：PASS

真实 Shell 测试桩模拟了高权限活动 Profile：

- 未设置 `ALIBABA_CLOUD_IGNORE_PROFILE`：身份门拒绝；
- 空值：身份门拒绝；
- 小写 `true`：身份门拒绝；
- 精确大写 `TRUE`：使用环境临时 STS 链；
- 外部预置小写值时，主凭证门覆盖为精确 `TRUE` 后才执行 STS 验证。

因此 Profile 不再能够覆盖待验证的临时 STS 环境链。

### 2.3 临时 STS 完整性与身份：PASS

凭证门只允许单一变量族同时具备：

- 非空 AccessKey ID；
- 非空 AccessKey Secret；
- 非空 SecurityToken。

随后在 `IGNORE_PROFILE=TRUE` 的同一进程环境中调用 `GetCallerIdentity`，并验证 `IdentityType` 与 ARN 为批准的 Operator RAM 会话或明确 Cloud Shell assumed-role。以下路径均 fail-closed：

- 无凭证；
- profile-only；
- metadata-only；
- 不完整 AK；
- AK 无 Token；
- 空 Token；
- 假 Token；
- 过期 Token；
- 身份不符；
- modern/legacy 混合变量链。

凭证与 Profile 优先级测试：`CREDENTIAL_GATE_TESTS=PASS cases=16`。

## 3. 全量回归

| 检查 | 结果 |
|---|---|
| Bash 语法 | PASS（9/9） |
| 凭证门/Profile 优先级 | PASS（16/16） |
| 状态路径 | PASS（8/8） |
| 真实 I/O 故障 | PASS（6/6） |
| manifest/ledger 攻击 | PASS（5/5） |
| SHA256SUMS | PASS |
| ZIP 条目 | PASS（14/14） |
| 静态凭据泄露扫描 | PASS |
| 静态禁止能力扫描 | PASS |
| RAM Action 边界 | PASS |

未发现 `set -x`、`printenv`、凭证明文输出、原始 STS 响应输出或完整账号标识落盘。未发现 RDS 下单、NAT/EIP、Qwen/DashScope、AccessKey 创建、公共 OSS/FC、公共入站或 production 调用。

RAM 权限未扩大；FC mutating 仍只允许两个固定 fixture 函数 ARN，`ListFunctions` 继续作为独立只读枚举。

## 4. 既有安全边界复验

- 区域固定 `cn-beijing`。
- 预算制品 SHA 固定，月预算门 ¥300，阈值 ¥150/¥240/¥300。
- OSS 固定 private、BPA=true、SSE-OSS/AES256、对象 14 天、未完成分片 1 天。
- 安全组入站规则必须为 0。
- FC 固定 Node.js 20 fixture、`LIVE_PROVIDER_ENABLED=false`、实例并发 1、预留实例 0。
- RG、四标签、命名、Zone 和既有资源漂移均 fail-closed。
- ledger/manifest/created-by-run/真实 ID 哈希继续约束精确回滚。
- rollback 两阶段 COMMITTING/tombstone/COMPLETE 恢复语义保持通过。

## 5. 放行范围

裁决允许恢复一次人工 Cloud Shell Wave1 执行，但仅限：

1. 上传本报告 SHA 对应的 v0.8 ZIP；
2. 在全新目录解压，不覆盖旧包；
3. 校验 ZIP SHA 与包内 `SHA256SUMS`；
4. 使用已启用 MFA、已绑定审定 RAM v0.2.3 的 Cloud Shell 临时 STS 会话；
5. 顺序执行 v0.8 的 preflight、apply、verify；
6. 任一步失败立即停止并保留状态证据。

本 GO 不授权 RDS、NAT/EIP、Qwen、AccessKey、公共入口、production 或任何手工绕过。它也不代表云端已成功；真实 CLI、STS、权限、供应与费用仍由现场 preflight/apply/verify 门控。

## 6. 最终裁决

v0.6 的无凭证放行问题和 v0.7 的 Profile 隔离大小写问题均已关闭。  
**结论：`GO_FOR_MANUAL_CLOUDSHELL`。**
