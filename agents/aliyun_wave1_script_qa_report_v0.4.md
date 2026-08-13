# VisionQA 阿里云 Staging Wave1 独立 QA 报告 v0.4

> 审查日期：2026-07-29（Asia/Shanghai）  
> 审查对象：`ALIYUN_STAGING_WAVE1_v0.4`、`VisionQA_ALIYUN_STAGING_WAVE1_v0.4.zip`、`ALIYUN_OPERATOR_BOOTSTRAP_v0.2.2`、v0.3 QA 报告  
> 云端执行：0；云端修改：0；订单：0；模型调用：0  
> **最终结论：`NO_GO`**

## 1. 完整性与本地复验

- ZIP SHA-256 独立复算通过：
  `C54598DE6C823C7F84EDACAAE49645C062C6EB583249DFFE3CC7D0C1491D034E`
- RAM v0.2.2 SHA-256 独立复算通过：
  `6640A084568021175EA69D4829754CDC54CE011E2AAA3F7FE6713AA3038819F7`
- `SHA256SUMS` 的 10 项全部复算一致。
- 四个交付 Shell 脚本及 `test_state_paths.sh` 均通过真实 Linux Bash `bash -n`。
- 真实 Bash 状态路径测试：`BASH_STATE_PATHS=PASS cases=8`。
- manifest/ledger 攻击模型：`STATE_ATTACK_TESTS=PASS cases=5`。
- 预算批准制品实际 SHA 为
  `f82a9aa43271521d4505a9f78f7073f1c8ebf0170003078e378bd63f95b7ce39`，
  与 preflight 内嵌值一致，且批准行固定为 `STG-BUDGET-001, ..., APPROVED, APPROVE`。

## 2. v0.3 阻断项复验

| 项目 | 结果 | 证据 |
|---|---|---|
| active-run 提交时序 | PASS | CLI/help、STS、全部输入、预算、RG 和所有资源漂移门通过后，才创建 manifest/context，并原子提交 active-run |
| preflight 失败无锁 | PASS | `COMMITTED=0` 的 EXIT trap 删除候选 prelog、manifest、context.new、active-run.tmp，并仅在 run 匹配时删除 active-run |
| rollback 失败可重试 | PASS | 非零退出追加 `ROLLBACK_FAILED`，保留 active-run |
| rollback 成功终态 | **FAIL，见 P1-2** | 存在“先删除 active-run，后写 `ROLLBACK_COMPLETE`”的不可恢复窗口 |
| append-only ledger | PASS | 交付脚本仅以 `>>` 追加，未发现截断或覆盖 ledger |
| 本批精确回滚 | PASS（静态） | run+batch+kind+真实 ID SHA+manifest checkpoint+created_by_run+region+RG 联合绑定；复用资源不删 |
| NotFound/403 分类 | PASS | 仅白名单结构化错误码映射为 44；403、超时、未知或不可解析错误不当作不存在 |
| CLI help | PASS（静态） | preflight 对声明使用的 Action 逐项执行 `aliyun <service> <Action> help`；实际 Cloud Shell 兼容性仍须现场 preflight 验证 |

## 3. 安全与配置复验

- OSS：新桶默认 private；显式 BPA=true；SSE-OSS/AES256；`staging/visionqa/` 对象 14 天；未完成分片 1 天；回滚要求目标前缀为空且无未完成分片。
- FC：Node.js 20 fixture；`LIVE_PROVIDER_ENABLED=false`；实例并发 1；保留并发/最大实例 1；预留实例 target 0；两个固定函数均回读配置、RG 和四标签。
- 网络：固定 `cn-beijing`；VPC/vSwitch/安全组固定名称、CIDR、RG、四标签；安全组入站规则数必须为 0。
- SLS：固定项目及两个 LogStore，TTL 30/90 天，RG 与四标签回读。
- 禁止能力静态扫描：未发现 RDS 下单、NAT/EIP、Qwen/DashScope、AccessKey 创建、RAM/IAM 提权或 BSS 调用；RAM 策略仍显式 Deny 这些能力。

## 4. 阻断问题

### P1-1：RAM v0.2.2 仍未做到 Wave1 Action 逐项一致和最小权限

策略允许但 Wave1 脚本与 `ACTION_INVENTORY.txt` 均未使用的 Action：

- `oss:GetBucketLocation`
- `resourcemanager:ListResourceGroups`

此外，FC 同一个 Allow statement 把所有读写/删除 Action 都授权到：

```text
acs:fc:cn-beijing:<ACCOUNT_ID>:functions/*
```

因此 `fc:DeleteFunction`、`fc:PutConcurrencyConfig`、`fc:PutProvisionConfig`、`fc:TagResources` 等变更能力不只覆盖两个固定 staging 函数，也覆盖北京区其他函数。这不满足本轮“Action 逐项策略对齐”及固定资源最小权限要求。`ListFunctions` 若必须使用通配资源，应拆成只读 statement；创建、配置、打标和删除应只绑定：

- `visionqa-staging-api`
- `visionqa-staging-evaluation-task`

Cloud Shell 会话 Action 可作为登录基础能力单独保留并在清单中明确，不应与 Wave1 资源操作 Action 混淆。

### P1-2：rollback 成功收尾仍有 active-run 丢失但无 COMPLETE 的窗口

当前末尾顺序为：

```bash
rm -f -- "$RUN_FILE"
record ROLLBACK_COMPLETE PASS
ROLLBACK_OK=1
```

如果删除 active-run 后，`jq`、磁盘或 ledger 追加失败，EXIT trap 虽会尝试记录 `ROLLBACK_FAILED`，但 active-run 已不存在；之后不能按正常重试路径再次绑定原 run。这违背“失败保留 active-run 可重试；COMPLETE 后清理”的验收语义。

应改成：

1. 先成功追加并持久化 `ROLLBACK_COMPLETE`；
2. 再验证 active-run 内容仍精确匹配当前 run；
3. 最后原子/条件清理 active-run；
4. 对清理失败给出可安全重试、不会重复删除资源的终态处理。

相应真实 Bash 测试必须注入 `ROLLBACK_COMPLETE` 追加失败和 active-run 清理失败，验证不会形成无 active-run、无 terminal record 的孤儿状态。

## 5. 测试覆盖说明

现有 8 路 Bash 测试对真实交付脚本主要采用行号/grep 静态断言，状态转换部分是临时目录中的简化模型，并未故障注入执行真实 rollback 尾部。因此它没有发现 P1-2。五个 JS 攻击模型覆盖跨 run、跨 batch、错误 ID 和 manifest 篡改，但不能替代真实 Shell 的 I/O 失败测试。

## 6. 解禁条件

必须发布全新、不可覆盖旧包的 v0.5，并完成：

1. RAM 策略删除未使用 Action，拆分 FC 列表读取与固定函数变更权限，确保变更能力不能作用于 `functions/*`；
2. 更新 `ACTION_INVENTORY.txt`、策略 SHA、`SHA256SUMS` 和 ZIP；
3. 调整 rollback 成功终态与 active-run 清理顺序，消除孤儿窗口；
4. 为 ledger terminal append 失败及 active-run 清理失败补真实 Bash 故障注入；
5. 由新的独立 QA 复算 SHA、运行 Bash/攻击测试并重新裁决。

在新的独立 QA 给出 `GO_FOR_MANUAL_CLOUDSHELL` 前，不应向用户提供上传或运行 v0.4 的命令。
