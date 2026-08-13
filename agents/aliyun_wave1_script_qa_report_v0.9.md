# VisionQA 阿里云 Staging Wave1 独立发布 QA 报告 v0.9

> 审查日期：2026-07-30（Asia/Shanghai）  
> 审查对象：`ALIYUN_STAGING_WAVE1_v0.9`、`VisionQA_ALIYUN_STAGING_WAVE1_v0.9.zip`、实现报告 v0.9、v0.8 真实 preflight 报告、RAM v0.2.3  
> 云端执行：0；云端修改：0；订单：0；模型调用：0  
> **最终结论：`GO_FOR_MANUAL_CLOUDSHELL`**

## 1. 制品完整性

- ZIP SHA-256 独立复算：
  `88ACBC7336CC4BE60E72F97F2F77A4AC454C39829DAE637C74200304FC7BE067`
- ZIP 条目：14/14。
- RAM v0.2.3 SHA-256 保持：
  `E1DC84A67BC78723AC571D887A700031080F293FFBC53834466426B7FBC8F554`
- `SHA256SUMS`：12 个包内文件及 RAM 策略全部 `OK`。
- Shell `bash -n`：9/9 PASS。
- v0.1–v0.8 保持 `SUPERSEDED_DO_NOT_RUN`；只放行上述 SHA 对应的 v0.9。

## 2. v0.8 真实 Preflight 阻断复验

v0.8 在真实 Cloud Shell 中因同时存在 modern 与 legacy 两套临时凭证变量而 fail-closed，未进入 apply、verify 或 rollback，云资源与费用仍为 0。v0.9 对镜像凭证链进行了严格、可审计的规范化。

### 2.1 双链完全一致：PASS

modern 与 legacy 同时存在时，只有以下三项都已定义、均非空且逐字节相同才通过：

- AccessKey ID；
- AccessKey Secret；
- SecurityToken。

ID、Secret 或 Token 任一不等、缺项或空值均 fail-closed。比较均使用双引号保护的 Bash 字符串比较，不发生分词、通配或命令解释。

通过后仅保留 modern 链，并明确 unset：

```text
ALIYUN_ACCESS_KEY_ID
ALIYUN_ACCESS_KEY_SECRET
ALIYUN_SECURITY_TOKEN
```

### 2.2 Legacy-only 规范化：PASS

完整且非空的 legacy-only 临时 STS 链会逐项复制为 modern 环境变量，随后删除全部 legacy 变量。后续身份调用及其他 CLI 操作只存在一条 modern 凭证链。

### 2.3 额外凭证源：PASS

以下额外源只要被定义即拒绝，包括空值定义：

- `ALIBABA_CLOUD_PROFILE`
- `ALIBABA_CLOUD_CREDENTIALS_URI`
- `ALIBABA_CLOUD_SESSION_TOKEN`
- `ALIYUN_SESSION_TOKEN`

无凭证、profile-only、metadata-only、额外 token 均 fail-closed。

### 2.4 Profile 隔离与同链身份：PASS

规范化后固定：

```bash
ALIBABA_CLOUD_IGNORE_PROFILE=TRUE
```

随后在同一进程和同一 modern 环境链执行 `GetCallerIdentity`，并验证 IdentityType/ARN 为批准的 Operator RAM 会话或明确 Cloud Shell assumed-role。假 Token、过期 Token、STS 失败及身份不符均拒绝。

凭证门、镜像链与 Profile 测试：
`CREDENTIAL_GATE_TESTS=PASS cases=23`。

## 3. 全量回归

| 检查 | 结果 |
|---|---|
| Bash 语法 | PASS（9/9） |
| 凭证门/镜像链/Profile | PASS（23/23） |
| 状态路径 | PASS（8/8） |
| 真实 I/O 故障 | PASS（6/6） |
| manifest/ledger 攻击 | PASS（5/5） |
| SHA256SUMS | PASS |
| ZIP 条目 | PASS（14/14） |
| 凭据泄露静态扫描 | PASS |
| 禁止能力静态扫描 | PASS |
| RAM Action 边界 | PASS |

未发现 `set -x`、`printenv`、凭证明文输出、原始 STS 返回输出或完整账号标识落盘。未发现 RDS 下单、NAT/EIP、Qwen/DashScope、AccessKey 创建、公共 OSS/FC、公共入站或 production 调用。

RAM 权限未扩大；FC mutating 仍只限两个固定 fixture 函数 ARN，`ListFunctions` 继续作为独立只读枚举。

## 4. 既有资源安全边界

- `cn-beijing`、RG、Zone、固定命名、四标签及漂移门保持 fail-closed。
- 月预算 ¥300，阈值 ¥150/¥240/¥300；审批制品 SHA 固定。
- OSS 固定 private、BPA=true、SSE-OSS/AES256、对象 14 天、未完成分片 1 天。
- 安全组入站规则必须为 0。
- FC 固定 Node.js 20 fixture、`LIVE_PROVIDER_ENABLED=false`、实例并发 1、预留实例 0。
- ledger/manifest/run/batch/created-by-run/真实 ID 哈希继续约束精确回滚。
- rollback 的 COMMITTING → tombstone → COMPLETE 两阶段恢复语义回归通过。

## 5. 放行范围

本结论允许恢复一次人工 Cloud Shell 执行，仅限：

1. 在当前 Cloud Shell VM 中重新确认三项前置制品真实存在，不依赖上传面板历史状态；
2. 使用本报告 SHA 对应的 v0.9 ZIP；
3. 在全新目录解压并复验 ZIP SHA、`SHA256SUMS` 与私有 runtime 输入；
4. 所有 fail-fast 编排放入子 Shell，避免退出父 Cloud Shell；
5. 顺序执行 v0.9 preflight、apply、verify；
6. 任一步失败立即停止并保留 `.visionqa-wave1-v0.9/` 证据。

本 GO 不授权 RDS、NAT/EIP、Qwen、AccessKey、公共入口、production 或手工绕过。真实云端成功仍需现场 preflight/apply/verify 证明。

## 6. 最终裁决

v0.8 的真实 Cloud Shell 双凭证镜像阻断已安全关闭，未通过无条件放宽处理。  
**结论：`GO_FOR_MANUAL_CLOUDSHELL`。**
