# VisionQA 阿里云 Staging Wave1 执行报告 v0.1

> 日期：2026-07-29（Asia/Shanghai）  
> 区域：`cn-beijing`  
> 结论：`APPROVED_BUT_BLOCKED_AT_SAFE_CLOUD_SHELL_CONTROL`

## 已确认

- Owner 已批准非 RDS Wave1：资源组、VPC、vSwitch、安全组、私有 OSS、SLS、fixture 模式 FC。
- 基础设施月预算上限为人民币 300 元。
- RDS 仅允许准备报价，禁止下单。
- NAT/EIP、百炼 Key、Qwen 调用继续 HOLD。
- Operator 使用 RAM + MFA，AccessKey 数量为 0。
- 只读探针：`STS / POLICY / OSS / RDS / FC / ACTIONTRAIL = OK`。

## 本轮执行结果

Windows Computer Use 能唯一识别标题含 `Cloud Shell` 的 Microsoft Edge 窗口，但无法高置信度确认当前页面 URL。根据安全规则，自动 UI 输入已立即停止；没有切换浏览器、没有索取凭据，也没有向终端输入任何资源创建命令。

当前实际外部变更：

- 新建阿里云资源：0
- 修改/删除阿里云资源：0
- 订单或计费确认：0
- RDS 询价提交/下单：0
- NAT/EIP：0
- Qwen 调用：0

## 自动化脚本包

为避免要求 Owner 逐条复制资源命令，已生成完整的 Cloud Shell 脚本包：

- `handoffs/ALIYUN_STAGING_WAVE1_v0.1/wave1_preflight.sh`
- `handoffs/ALIYUN_STAGING_WAVE1_v0.1/wave1_apply.sh`
- `handoffs/ALIYUN_STAGING_WAVE1_v0.1/wave1_verify.sh`
- `handoffs/ALIYUN_STAGING_WAVE1_v0.1/wave1_rollback.sh`
- `handoffs/ALIYUN_STAGING_WAVE1_v0.1/README.md`

脚本尚未在云端执行。四个脚本均通过 Git Bash `bash -n`；危险动作静态扫描未发现 RDS 创建/公网连接、NAT/EIP、AccessKey、真实模型、全网入站、递归 OSS 删除或身份删除动作。

现有 Bootstrap 策略明确禁止创建 RAM Role，且不包含资源组创建权限，因此脚本 fail-closed 要求管理员预先提供：

- `VISIONQA_RESOURCE_GROUP_ID`
- `VISIONQA_FC_ROLE_ARN`（必须以 `/role/visionqa-staging-runtime` 结尾）
- `VISIONQA_ZONE_ID`（必须属于 `cn-beijing-*`）

这三个值只在 Cloud Shell 当前会话设置，不进入项目文件或聊天。

## 后续验收

恢复后必须依次完成：

1. Describe/List 幂等检查；
2. 固定名称、标签和 `cn-beijing` 地域创建；
3. OSS Private + BPA + SSE-OSS + 14/1 生命周期；
4. SLS 30/90 天；
5. FC fixture、并发 1、最大实例 1、预留 0；
6. 脱敏 smoke、预算复核、回滚命令；
7. Bootstrap 权限替换为 Restricted 权限。
