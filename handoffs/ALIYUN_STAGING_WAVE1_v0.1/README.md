# SUPERSEDED_DO_NOT_RUN — VisionQA 阿里云 Staging Wave1 Cloud Shell 包

> 本 v0.1 已被独立安全 QA 判定为 NO-GO，禁止上传或执行。等待后续通过复审的新版本。

本包用于 `cn-beijing` 的已批准非 RDS Wave1。它不会创建 RDS、NAT、EIP、百炼 Key、AccessKey，不会调用 Qwen，也不包含生产资源。

## 文件

- `wave1_preflight.sh`：纯只读；检查身份、静态 AK 环境、固定命名资源、重复项和配置漂移。
- `wave1_apply.sh`：只创建已批准的 VPC、vSwitch、安全组、私有 OSS、SLS 和 fixture FC。
- `wave1_verify.sh`：只读验证配置。
- `wave1_rollback.sh`：仅精确删除本批资源；默认拒绝运行。

## 执行前必须已有

当前 Bootstrap 策略禁止创建 RAM Role，并未包含创建资源组权限。因此在运行脚本前，管理员必须已经准备：

1. 北京区资源组 `visionqa-staging`，取得 Resource Group ID；
2. RAM 服务角色 `visionqa-staging-runtime`，信任主体仅为 FC；
3. 一个确认可用的北京可用区 ID。

不要创建 AccessKey。不要把账号 ID、Role ARN、Token 或 Cookie发到聊天中。

## 上传与一次执行

在 Cloud Shell 新建目录，上传本目录的四个 `.sh` 文件并进入该目录。先在终端本地设置三个值：

```bash
export VISIONQA_ZONE_ID='cn-beijing-实际可用区'
export VISIONQA_RESOURCE_GROUP_ID='rg-实际ID'
export VISIONQA_FC_ROLE_ARN='acs:ram::账号ID:role/visionqa-staging-runtime'
```

这些值只进入当前 Cloud Shell 会话，不要发给项目组。然后一次运行：

```bash
bash wave1_preflight.sh && bash wave1_apply.sh && bash wave1_verify.sh
```

若出现 `PREFLIGHT=FAIL` 或 `APPLY=FAIL`，立即停止，不要绕过检查。只把 `reason=` 和最后三行状态发给项目组。

## 费用与停止线

- 月度基础设施上限：人民币 300 元；
- OSS、SLS、FC 为按量低用量配置，不等于绝对免费；
- 脚本不打开购买页、不确认订单；
- 任何控制台计费确认、预付费选择或预计超过 300 元时必须停止；
- 不允许公共 OSS、`0.0.0.0/0` 入站、公网 RDS、NAT/EIP 或真实模型调用。

## 回滚

回滚会删除云资源和云端数据，必须由 Owner 明确执行：

```bash
VISIONQA_CONFIRM_ROLLBACK=DELETE_WAVE1_STAGING bash wave1_rollback.sh
```

回滚脚本不会通配删除 OSS 对象；Bucket 非空会停止，防止误删。
