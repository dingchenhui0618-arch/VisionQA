# VisionQA 阿里云 Staging Wave1 云端执行报告 v0.1

> 日期：2026-07-30（Asia/Shanghai）  
> 执行包：`VisionQA_ALIYUN_STAGING_WAVE1_v0.5.zip`  
> 结论：`STOPPED_AT_PREFLIGHT / NO_CLOUD_RESOURCE_CREATED`

## 已完成

- Chrome Cloud Shell 登录态可用，Operator MFA 已完成；
- 审定 ZIP 已上传；
- ZIP SHA-256 与发布 QA 固定值一致；
- 解压后 `SHA256SUMS` 全部通过；
- Zone、ResourceGroupId、FC Role ARN 通过受限私有文件传入，未在聊天、报告或截图披露；
- 未执行任何手工绕过或修改审定制品。

## 停机点

`wave1_preflight.sh` 在资源创建前失败：

```text
PREFLIGHT=FAIL reason=static_access_key_env_present
```

Cloud Shell 使用临时 STS 会话，但会通过标准 AccessKey 环境变量向 CLI 注入临时凭证。v0.5 的静态 AccessKey 门仅检查变量是否存在，无法区分临时 STS 与长期静态 AccessKey，因此发生 fail-closed 误判。

失败后 Cloud Shell 连接断开并出现重新连接确认。按既定停机规则，没有点击重连，没有继续执行 `apply`、`verify` 或 `rollback`。

## 影响

```text
PREFLIGHT=FAIL
APPLY=NOT_STARTED
VERIFY=NOT_STARTED
ROLLBACK=NOT_REQUIRED_NOT_RUN
CLOUD_RESOURCE_CREATED=0
NEW_COST=0
QWEN_CALLS=0
ACCESS_KEY_CREATED=0
```

## 下一门

v0.5 不得继续执行。需要发布新版本，在不放宽长期静态 AccessKey 禁令的前提下，验证 Cloud Shell 临时 STS 身份、会话令牌与 MFA，再由独立 QA 复验后重新执行。

## v0.8 恢复尝试

- v0.8 已获独立 QA `GO_FOR_MANUAL_CLOUDSHELL`；
- 审定 v0.8 ZIP 已上传；
- Cloud Shell 已更换新 VM，旧 VM 中的策略制品与私有 runtime env 不存在；
- 全新目录准备在复制策略制品时以 `No such file or directory` 停止；
- 未进入包内 SHA、preflight、apply、verify 或 rollback；
- 连接随后断开，未点击重连；
- 云资源、费用、模型调用与 Key 仍为 0。

第二次恢复时，策略制品与私有 runtime env 已重新上传；全新目录校验命令提交后，Cloud Shell 在返回校验结果前再次断开。按停机规则未继续重连，未进入 preflight/apply/verify/rollback。当前阻塞为 Cloud Shell 会话稳定性，不是本地 v0.8 发布包。

后续诊断确认：上传任务面板会保留历史“已完成”记录，但新 VM 文件系统中不一定存在对应文件；前置检查返回 `PREREQ=FAIL`。同时，直接在交互 shell 中运行含 `exit 1` 的 fail-fast 命令会退出整个 shell，从而表现为连接断开。后续所有编排命令必须放入子 shell，且每个新 VM 必须重新上传三项制品后立即验证。

## v0.8 真实 Preflight 结果

- 三项文件在同一 VM 重新上传并验证存在；
- ZIP SHA、包内 `SHA256SUMS` 与私有 runtime 格式全部通过；
- 所有编排命令已改为子 shell，父 Cloud Shell 保持连接；
- `wave1_preflight.sh` 返回 `PREFLIGHT=FAIL reason=mixed_credential_environment`；
- 阿里云 Cloud Shell 同时注入 modern 与 legacy 两套凭证变量，触发 v0.8 fail-closed；
- apply、verify、rollback 均未运行，云资源与费用仍为 0。
