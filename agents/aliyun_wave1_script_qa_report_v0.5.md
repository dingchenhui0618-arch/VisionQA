# VisionQA 阿里云 Staging Wave1 独立发布 QA 报告 v0.5

> 审查日期：2026-07-29（Asia/Shanghai）  
> 审查对象：`ALIYUN_STAGING_WAVE1_v0.5`、`VisionQA_ALIYUN_STAGING_WAVE1_v0.5.zip`、`ALIYUN_OPERATOR_BOOTSTRAP_v0.2.3`、v0.4 QA 报告  
> 云端执行：0；云端修改：0；订单：0；模型调用：0  
> **最终结论：`GO_FOR_MANUAL_CLOUDSHELL`**

## 1. 制品身份与完整性

- ZIP SHA-256 独立复算：
  `6DDE75FD3B55CFEACF54024B72A03B34E45E4FA953989BEE3BE0BC34EBA914D0`
- RAM v0.2.3 SHA-256 独立复算：
  `E1DC84A67BC78723AC571D887A700031080F293FFBC53834466426B7FBC8F554`
- `SHA256SUMS` 11 项逐项复算：全部 `OK`。
- 七个 Shell 文件在真实 Linux Bash 中执行 `bash -n`：PASS。
- v0.1–v0.4 仍为 `SUPERSEDED_DO_NOT_RUN`；只放行本报告指纹对应的 v0.5。

## 2. v0.4 两项阻断复验

### 2.1 FC mutating 权限固定到两个函数：PASS

RAM v0.2.3 已将 `fc:ListFunctions` 拆为独立只读 statement；其资源通配仅用于枚举。以下 FC 创建、配置、标签和删除 Action 只允许作用于两个固定 ARN：

- `visionqa-staging-api`
- `visionqa-staging-evaluation-task`

固定资源 statement 中不存在 `functions/*`。脚本 Action、`ACTION_INVENTORY.txt` 与 RAM Allow Action 对照一致；v0.4 指出的未使用 `oss:GetBucketLocation`、`resourcemanager:ListResourceGroups` 已删除。Deny 集继续覆盖 RAM 提权、AccessKey、RDS 下单、NAT/EIP、公共 OSS、公共 FC 域名、DashScope/Qwen 与 BSS。

### 2.2 rollback 两阶段提交：PASS

实际时序为：

1. durable append + fsync + 回读 `ROLLBACK_COMMITTING`；
2. 原子 rename `active-run` 为 run 专属 tombstone，并 fsync 状态目录；
3. durable append + fsync + 回读 `ROLLBACK_COMPLETE`；
4. 删除 tombstone，并再次 fsync 状态目录。

复验结果：

- ledger append 失败：保留 `active-run`，不伪造 COMMITTING；
- ledger fsync 失败：保留可重试锚点；
- rename 失败：已持久化 COMMITTING 且保留 `active-run`；
- COMPLETE append/fsync 失败：保留 durable COMMITTING 与 tombstone；
- 从 COMMITTING 重试：不重复执行云删除，补齐 COMPLETE 后清理 tombstone；
- COMPLETE 已持久化而 tombstone 清理/目录同步需重试时：终态仍可安全收敛。

真实 Shell I/O 故障注入：`IO_FAULT_INJECTION=PASS cases=6`。该实现消除了 v0.4 的“先删 active-run、后写 COMPLETE”孤儿窗口。

## 3. 独立测试结果

| 检查 | 结果 |
|---|---|
| Bash 语法 | PASS（7/7） |
| 状态路径 | `BASH_STATE_PATHS=PASS cases=8` |
| 真实 Shell I/O 故障 | `IO_FAULT_INJECTION=PASS cases=6` |
| manifest/ledger 攻击 | `STATE_ATTACK_TESTS=PASS cases=5` |
| ZIP 与目录内 SHA | PASS |
| Action inventory / RAM 对齐 | PASS |
| FC mutating 固定 ARN | PASS |
| 静态危险能力扫描 | PASS |

静态扫描在可执行调用点未发现 RDS 创建/下单、NAT/EIP、Qwen/DashScope、AccessKey、RAM 提权、BSS、公共 OSS ACL/Policy/Website、公共 FC 域名或安全组入站授权。README、预算审批制品及 RAM 的 Deny 声明中出现这些名称属于明确禁止证据，不是调用。

## 4. 配置、成本与回滚边界

- 区域固定 `cn-beijing`；资源组读取、固定显示名、Zone 输入与资源漂移均在 preflight 阶段 fail-closed。
- 四标签固定：`project=visionqa`、`environment=staging`、`owner=dingchenhui`、`managed-by=visionqa-operator`；apply 后 verify 再回读。
- 月预算门固定 ¥300，告警阈值固定 ¥150/¥240/¥300；预算批准制品 SHA 固定为
  `f82a9aa43271521d4505a9f78f7073f1c8ebf0170003078e378bd63f95b7ce39`。
- ledger 为 append-only；manifest checkpoint、run/batch、真实资源 ID 哈希、created/reused 属性及 RG/region 共同约束精确回滚。
- OSS：private、BPA=true、SSE-OSS/AES256、`staging/visionqa/` 14 天过期、未完成分片 1 天清理。
- 安全组入站规则必须为 0；FC 为 Node.js 20 fixture、`LIVE_PROVIDER_ENABLED=false`、实例并发 1、预留实例 0。
- 回滚只删除本 run 标记为 `CREATED` 且通过名称、region、RG、标签、配置及 ID 哈希联合校验的资源；复用资源不删除。

## 5. 放行边界

本结论只允许一次人工 Cloud Shell 执行 Wave1 非 RDS staging 基础层。它不授权：

- RDS 订单或最终购买；
- NAT/EIP；
- Qwen/DashScope 调用或密钥；
- AccessKey；
- 公网入口；
- production 资源；
- 绕过 preflight、跳过 verify 或修改审定 ZIP。

任何 SHA 不一致、policy 占位未私下替换、RG/Role/Zone/预算制品缺失、preflight 非零退出或 verify 失败，均立即停止，不得继续补命令。

## 6. 严格一次性最小用户步骤

1. 管理员在 RAM 控制台把现有自定义策略更新为 v0.2.3；仅管理员在私下将 `<ACCOUNT_ID>` 与 `<EXACT_FC_RUNTIME_ROLE_ARN>` 替换成账号内真实值。不要在聊天、截图或项目文件披露这些值。
2. 管理员预先准备并核对：
   - 北京区资源组 `visionqa-staging`；
   - 仅供两个 fixture FC 使用的最小运行角色；
   - 北京区可用 Zone；
   - 包内原样、未经编辑的 `approved_budget_artifact.csv`。
3. 将审定 ZIP 上传到 Cloud Shell；先执行 SHA-256 校验，结果必须严格等于：
   `6DDE75FD3B55CFEACF54024B72A03B34E45E4FA953989BEE3BE0BC34EBA914D0`。
4. 解压到全新目录，不覆盖任何旧版；只运行 v0.5。
5. 在同一个已启用 MFA 的临时 Cloud Shell 会话中依次执行：
   `bash wave1_preflight.sh && bash wave1_apply.sh && bash wave1_verify.sh`
6. 任一步失败立即停止，保留 `.visionqa-wave1-v0.5/` 全部证据，不手工删除状态或资源。只有明确需要回滚且已核对当前 run 时，才使用 README 中的固定确认变量运行 v0.5 rollback。
7. 成功后只回传脱敏状态、ledger/verify 结论与资源费用概览；不得回传账号 ID、Role ARN、资源真实 ID、临时凭证或签名 URL。

## 7. 最终裁决

v0.4 的两个 P1 阻断均已关闭，本地发布级复验全部通过。  
**裁决：`GO_FOR_MANUAL_CLOUDSHELL`。**

该 GO 不等于云端成功；Cloud Shell 中的 CLI v3 Action/参数兼容性、真实权限、资源供应与实时费用仍必须由 preflight、apply、verify 现场门控。
