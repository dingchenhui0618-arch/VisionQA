# VisionQA 阿里云 Staging Wave1 v0.5

> 状态：`READY_FOR_INDEPENDENT_QA / DO_NOT_RUN_UNTIL_QA_GO`  
> 地域：`cn-beijing`；编码：UTF-8。

## 范围

仅包含已批准的 VPC、vSwitch、安全组、私有 OSS、SLS 和 fixture FC。没有 RDS 订单、NAT/EIP、模型调用、AccessKey、公共入站或生产资源。RAM 边界固定为只减权限后的 `ALIYUN_OPERATOR_BOOTSTRAP_v0.2.3`，未扩大。FC 变更权限只覆盖 `visionqa-staging-api` 与 `visionqa-staging-evaluation-task` 两个固定函数；仅只读 `ListFunctions` 使用通配范围。

## 预算批准制品

包内 `approved_budget_artifact.csv` 是 Owner 已批准决定表的固定副本。Preflight 将实际计算其 SHA-256，并严格匹配内嵌值：

```text
f82a9aa43271521d4505a9f78f7073f1c8ebf0170003078e378bd63f95b7ce39
```

同时要求 `STG-BUDGET-001` 为 `APPROVED,APPROVE`。任意替换、编辑或伪造的 64 位字符串均不能通过。

## 一次执行

独立 QA 给出 GO 后，上传审定 ZIP、校验 ZIP SHA，并运行：

```bash
bash wave1_preflight.sh && bash wave1_apply.sh && bash wave1_verify.sh
```

Preflight 会：

- 检查完整依赖；
- 要求阿里云 CLI v3；
- 对脚本使用的每个 Action 执行只读 `help` 参数解析；
- 隐藏输入 FC Role ARN；
- 验证北京 Zone、资源组、预算批准制品；
- Describe-before-create，并区分明确 NotFound 与 403/超时/未知错误；
- 检查固定命名、资源组、四标签、private/BPA/SSE/lifecycle、FC 限制；
- 为本次创建不可变 `batch_id` 和随机唯一 `run_id`。

## Append-only 证据

状态目录为 `.visionqa-wave1-v0.5/`：

- `ledger.jsonl`：只追加，Preflight 永不截断；
- `active-run`：当前 run ID；
- `run-<run_id>.json`：权限 600 的 run manifest，保存真实资源 ID；
- `context.env`：权限 600。

每次 manifest 更新都会计算 SHA-256 并写入同一 run/batch 的 ledger checkpoint。ledger 中的资源记录只保存真实 ID 的 SHA-256。发现未完成旧 run 时，新 preflight 会停止。

`active-run` 只会在 CLI/help、STS、所有输入、预算制品和资源漂移门全部通过，并且 manifest/context 已安全生成后原子写入。任意 Preflight 失败都会清理候选临时状态，不留下未终结 run。

## 精确回滚

回滚前同时验证：

1. 当前 `run_id` 与 `batch_id`；
2. manifest SHA 与 ledger 最新 checkpoint；
3. manifest 中真实资源 ID 的 SHA 与本 run 的 `CREATED` ledger；
4. 区域、资源组、固定名称、四标签和关键配置回读；
5. OSS 为空且没有未完成分片。

只删除本 run 创建的资源，不删除复用资源。回滚采用可恢复两阶段提交：

1. 持久化并验证 `ROLLBACK_COMMITTING`；
2. 原子重命名 `active-run` 为本 run tombstone 并同步目录；
3. 持久化并验证 `ROLLBACK_COMPLETE`；
4. 删除 tombstone 并再次同步。

Ledger 写入、fsync 或 rename 失败都会保留 `active-run` 或已持久化的 `COMMITTING` 恢复锚点；重试不会重复删除云资源。任何不一致立即停止：

```bash
VISIONQA_CONFIRM_ROLLBACK=DELETE_WAVE1_STAGING_V0_5 bash wave1_rollback.sh
```

## 旧版

v0.1、v0.2、v0.3、v0.4 均为 `SUPERSEDED_DO_NOT_RUN`。
