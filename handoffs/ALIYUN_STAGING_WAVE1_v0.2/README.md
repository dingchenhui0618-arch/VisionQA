# SUPERSEDED_DO_NOT_RUN — VisionQA 阿里云 Staging Wave1 v0.2

> 独立 QA v0.2 已判定 NO-GO，禁止上传或执行。

> 状态：`QA_PENDING / DO_NOT_RUN_UNTIL_QA_GO`  
> 编码：UTF-8；地域固定 `cn-beijing`。

## 安全边界

本包只覆盖已批准的资源：VPC、vSwitch、安全组、私有 OSS、SLS、fixture FC。没有 RDS 订单、NAT/EIP、模型调用、AccessKey、公共入站或生产资源。

必须先由 RAM 管理员把
`ALIYUN_OPERATOR_BOOTSTRAP_v0.2.1/bootstrap_policy_wave1_v0.2.1.json`
中的 `<ACCOUNT_ID>` 和 `<EXACT_FC_RUNTIME_ROLE_ARN>` 在本地替换，再为现有
`VisionQAStagingOperatorBootstrapV01` 创建新版本并设为默认。不要把替换值发到聊天或截图中，不要叠加系统策略。

## 管理员前置

管理员预先准备：

1. 资源组显示名 `visionqa-staging`；
2. FC 运行角色 `visionqa-staging-runtime`，信任主体仅为 FC；
3. 北京区可用区 ID；
4. ¥150 / ¥240 / ¥300 三档预算告警证据文件，并在本地计算 SHA-256。

Operator 不需要创建 RAM Role、策略、资源组或 AccessKey。

## 一次执行

上传四个 `.sh` 文件到 Edge Cloud Shell 同一目录，然后运行：

```bash
bash wave1_preflight.sh && bash wave1_apply.sh && bash wave1_verify.sh
```

Preflight 会一次提示输入：

- 北京可用区 ID；
- Resource Group ID；
- 运行角色 ARN（隐藏输入，不写 shell history，落盘权限 `600`）；
- 预算告警证据 SHA-256。

账号 ID 只在内存中用于计算不可逆 6 位摘要，不打印、不写 ledger。成功输出只包含：

```text
PREFLIGHT=PASS ZONE=OK RG=OK ROLE=OK BUDGET=OK
APPLY=PASS ...
VERIFY=PASS ...
```

任何 `reason=`、重复资源、归属/标签/配置漂移、权限错误、超时或未知状态都会 fail-closed。不要绕过。

## 强制配置

- 名称前缀 `visionqa-staging`；
- 标签：`project=visionqa`、`environment=staging`、`owner=dingchenhui`、`managed-by=visionqa-operator`；
- OSS 默认 private，不调用 `PutBucketAcl`；BPA 开、SSE-OSS AES256、对象 14 天、未完成分片 1 天；
- SLS App 30 天、Security 90 天；
- FC fixture、实例并发 1、最大按量实例 1、预留实例 0；
- 月预算 300 元，预算告警证据缺失即停止。

## 部分失败与回滚

执行 ledger 位于 Cloud Shell 当前目录：

```text
.visionqa-wave1-v0.2/ledger.jsonl
```

它记录创建/复用、资源 ID 的 SHA-256 和失败步骤，不保存账号 ID、Role ARN 或凭据。真实资源 ID 只存于权限 `600` 的本地状态文件。

回滚只删除 ledger 标记为本批 `CREATED`、且标签归属重新验证通过的精确资源；不会删除复用资源，不会通配删除对象。它具有破坏性，必须由 Owner 明确执行：

```bash
VISIONQA_CONFIRM_ROLLBACK=DELETE_WAVE1_STAGING_V0_2 bash wave1_rollback.sh
```

Bucket 非空、存在未完成分片、标签不符或任何删除失败时，回滚立即停止并且不会输出假 PASS。

## 禁止使用旧版

`ALIYUN_STAGING_WAVE1_v0.1` 为 `SUPERSEDED_DO_NOT_RUN`，不得上传或执行。
