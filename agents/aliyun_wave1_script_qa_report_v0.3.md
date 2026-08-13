# VisionQA 阿里云 Staging Wave1 独立 QA 报告 v0.3

> 审查日期：2026-07-29（Asia/Shanghai）  
> 审查对象：`ALIYUN_STAGING_WAVE1_v0.3`、`VisionQA_ALIYUN_STAGING_WAVE1_v0.3.zip`、`ALIYUN_OPERATOR_BOOTSTRAP_v0.2.1`、v0.2 QA 报告  
> 云端执行：0；云端修改：0；订单：0；模型调用：0  
> **最终结论：`NO_GO / DO_NOT_UPLOAD_OR_RUN`**

## 1. 本地复验结果

- ZIP SHA-256 独立复算一致：
  `B65E58C9028FDC69EBEC3D7BEDF76435A5123445C280E81CE753A17E22E51D3D`
- `SHA256SUMS` 全部通过，包括预算批准制品和外部 RAM 策略 v0.2.1。
- 四个 Shell 脚本均通过 Git Bash `bash -n`。
- `test_state_attacks.mjs`：`PASS cases=5`。
- 危险能力静态扫描：脚本未调用 RDS 下单、NAT/EIP、Qwen/DashScope、AccessKey、RAM/IAM 提权或 BSS；策略继续显式 Deny。
- 预算批准制品实际 SHA 与脚本内嵌 SHA 一致，且固定制品包含 `STG-BUDGET-001, ..., APPROVED, APPROVE`。

## 2. v0.2 三个 P0 的复验

| 项目 | 结果 | 证据 |
|---|---|---|
| 预算 artifact 固定 SHA 真实绑定 | PASS | preflight 计算 `approved_budget_artifact.csv` 的实际 SHA，与内嵌固定值比较；伪造任意 64 位字符串不能绕过 |
| append-only ledger | PASS | 只使用 `touch` 和 `>>`，不存在 `: > ledger` 或覆盖写 |
| 本 run/batch + 真实 ID + manifest checkpoint | PASS（核心绑定） | ledger 同时记录 batch/run/kind/真实 ID SHA；manifest 保存真实 ID；每次 manifest 更新后写 checkpoint |
| rollback 仅本 run CREATED | PASS（核心绑定） | `created()` 同时绑定 run、batch、kind、ID SHA、CREATED；`resource_id()` 要求 `created_by_run=true`、北京区和指定资源组 |
| rollback ownership/config | PASS（静态） | 回读固定名称、区域/资源组、四标签及主要安全配置后才删除；OSS 另检查空桶与未完成分片 |

## 3. 阻断问题

### P0：preflight 失败会制造不可恢复的“未完成 run”锁

`wave1_preflight.sh` 在 CLI v3/help、STS、Zone、Resource Group、Role、预算和资源漂移检查**之前**就：

1. 生成新 `RUN_ID`；
2. 覆盖 `active-run`。

但失败路径没有写终态，也没有安全地撤销尚未开始 apply 的 run。下一次重跑会读取该 `active-run`，在 append-only ledger 中找不到 `VERIFY_COMPLETE` 或 `ROLLBACK_COMPLETE`，立即报 `unfinished_prior_run`。此时 manifest/context 可能尚未生成，rollback 也无法使用。

因此任何 help 不兼容、输入错误、临时超时、403 或资源漂移，都会把用户卡死并迫使其手工修改受保护状态；这不满足“一次性最小操作”和可恢复执行要求。

必须在新版本修复，建议：

- 所有纯只读门、依赖检查和用户输入校验完成后再创建/切换 `active-run`；或
- 为 preflight-only 失败追加明确 `PREFLIGHT_ABORTED` 终态，且仅在 manifest/apply 尚未发生时允许安全重试；
- 不得通过删除 ledger 或手工篡改状态解锁。

### P1：rollback 没有记录 `ROLLBACK_COMPLETE`

preflight 把 `ROLLBACK_COMPLETE` 当作允许后续新 run 的终态，但 `wave1_rollback.sh` 成功末尾只输出 `ROLLBACK=PASS`，没有向 ledger 追加该 action。成功回滚后仍会被下一次 preflight 判定为 unfinished。

### P1：RAM 策略与 Wave1 实际 Action 仍未逐项一致

v0.2 QA 要求关闭“未使用的宽写权限”。v0.2.1 策略仍允许本 Wave1 脚本没有使用的写能力，包括：

- `oss:PutObject`、`oss:GetObject`、`oss:DeleteObject`、`oss:AbortMultipartUpload`、`oss:ListParts`
- `log:UpdateLogStore`、`log:CreateIndex`、`log:UpdateIndex`
- `fc:UpdateFunction`

这些不是当前 fixture 基础创建流程的必需 Action，违反本轮“Action 与 RAM 策略逐项一致/最小权限”的验收项。若为后续 Wave 保留，应放入后续独立策略，而非当前 Wave1 bootstrap。

### P1：攻击测试覆盖不足

当前 5 个测试只是 JavaScript 中对简化数组/字符串哈希的模型测试，没有执行真实 Shell 中的 `created()`、`resource_id()`、checkpoint 选择或 rollback fail-closed 路径。至少还应覆盖：

- ledger 追加旧 run、同 batch 不同 run、同 run 不同 batch；
- manifest 替换、截断、重排/空白变化；
- `active-run` 被替换；
- 最新 checkpoint 缺失、跨 run checkpoint 注入；
- NotFound、403、超时、非 JSON 错误的分类；
- 四标签缺任一项、重复标签、错误 Resource Group/region/name/config；
- rollback 成功后确实写入 `ROLLBACK_COMPLETE`。

## 4. 已通过的 P1/安全项

- `owner=dingchenhui` 已进入四标签检查。
- OSS、SLS、FC 均有 Resource Group 回读；VPC/vSwitch/SG 同样校验。
- 依赖列表已覆盖 `zip/base64/mktemp/cut/stat/od/tr` 等实际命令。
- NotFound 仅对白名单结构化 `Code` 返回 44；403、超时、未知/不可解析错误不会被当成不存在。
- preflight 要求 CLI v3，并对声明 Action 执行只读 `help` 门；真正的目标 Cloud Shell 兼容性仍只能由 preflight 当场验证。
- OSS：private、BPA、SSE-OSS(AES256)、对象 14 天、未完成分片 1 天均配置并回读。
- FC：`instanceConcurrency=1`、`reservedConcurrency=1`、预留实例 `target=0` 均配置并回读；运行模式固定 fixture，`LIVE_PROVIDER_ENABLED=false`。
- 安全组不创建 ingress，并要求已有 ingress 数量为 0。

## 5. 解禁条件

发布不可覆盖旧包的 v0.4，并完成：

1. 修复 preflight 失败后的安全可重试状态机；
2. rollback 成功追加 `ROLLBACK_COMPLETE`；
3. 将 Wave1 RAM Allow 收敛为脚本真实使用的 Action；
4. 用真实脚本/临时状态目录补齐攻击测试；
5. 重建 ZIP、SHA256SUMS，并由全新独立 QA 复验。

在新 QA 给出 `GO_FOR_MANUAL_CLOUDSHELL` 前，不应向用户提供上传或运行 v0.3 的命令。
