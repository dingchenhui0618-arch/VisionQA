# VisionQAStagingOperatorBootstrapV01 v0.1 → v0.2

## 结论

v0.2 必须作为**现有同名策略的新版本**发布并设为默认，不能与 v0.1 叠加。它不授权 RDS 下单、NAT/EIP、Qwen、AK 或 RAM 提权。

## 收紧

- 删除全部 RDS 创建/配置权限；显式拒绝数据库创建、账号、库、安全 IP、公网连接和订单动作。
- 删除 NAT、EIP、SNAT 权限并显式拒绝。
- 显式拒绝 DashScope/百炼模型调用、账单/订单、AK 和 RAM 提权。
- 显式拒绝安全组入站/出站授权和规则修改，因此 Operator 无法创建 `0.0.0.0/0` 入站。
- 显式拒绝 Bucket/Object ACL、Bucket Policy、Website；Bucket 创建必须依赖 OSS 默认 private，执行脚本必须删除 `PutBucketAcl` 调用。
- FC 仅限北京区两个固定函数及枚举 ARN；移除 Trigger/Alias/Version/VPC Binding/Custom Domain。
- Resource Group 和 FC Runtime Role 仅由管理员预创建；Operator 只有资源组只读和精确 `PassRole`。

## 补齐

- OSS Bucket BPA：`Put/GetBucketPublicAccessBlock`。
- OSS SSE-OSS：`Put/GetBucketEncryption`。
- OSS 生命周期 14 天、未完成分片 1 天：`Put/GetBucketLifecycle`。
- Wave1 精确回滚：VPC/vSwitch/SG、OSS Bucket、SLS Project/Logstore、FC Function 删除动作。
- FC 并发与实例上限所需 Concurrency/Provision Config 动作。

## 重要限制

1. `<ACCOUNT_ID>` 与 `<EXACT_FC_RUNTIME_ROLE_ARN>` 必须由管理员在本地/控制台替换后才能保存。
2. VPC、vSwitch、SG 的 Create API 需要 `Resource:"*"`；RAM 无法用资源 ARN 在“资源尚未创建”时锁定名称。`cn-beijing`、固定名称/CIDR/标签、资源组与 ownership 必须由 Wave1 v0.2 preflight/apply/verify fail-closed 强制。
3. v0.1 脚本仍调用 `PutBucketAcl`，而 v0.2 策略显式拒绝该动作。执行包修订前保持 `NO_GO`。
4. FC 的最大实例数 1、实例并发 1、预留实例 0 必须由修订脚本写入并由 verify 读取验证；仅授权动作不等于已配置。

## 官方 Action 核验

- OSS BPA 的 Bucket 级 Action 是 `oss:PutBucketPublicAccessBlock` / `oss:GetBucketPublicAccessBlock`，不是旧报告中的账号级 `PutPublicAccessBlock`。
- OSS SSE 使用 `oss:PutBucketEncryption` / `oss:GetBucketEncryption`。
- FC 官方策略表列出 Create/Get/Update/DeleteFunction、Put/Get/DeleteConcurrencyConfig，FC API 表列出 Put/Get/DeleteProvisionConfig。
- SLS RAM 表列出 Create/Delete/Get Project/LogStore 等动作。
- VPC/ECS 创建与回滚动作采用官方最小权限示例中的 Action 名称。

