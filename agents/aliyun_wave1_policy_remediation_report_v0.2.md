# 阿里云 Wave1 RAM 最小权限修复报告 v0.2

日期：2026-07-29（Asia/Shanghai）

## 交付结果

已生成现有同名策略 `VisionQAStagingOperatorBootstrapV01` 的 v0.2 策略文档和控制台更新说明。未执行任何云端修改、资源创建、订单或模型调用。

## 修复结论

- RDS create/order、NAT/EIP、Qwen、AK/RAM 提权均被移出 Allow 并显式 Deny。
- Wave1 仅保留 VPC/vSwitch/SG、私有 OSS、安全基线、SLS、fixture FC 和精确回滚所需动作。
- OSS BPA Action 已按 Bucket 级官方名称修正为 `Put/GetBucketPublicAccessBlock`。
- Bucket ACL 采用“创建时默认 private + 禁止后续 ACL 修改”；因此 Wave1 脚本必须删除 `PutBucketAcl`。
- 安全组规则写动作全部 Deny，Operator 无法开放公网入站。
- PassRole 必须替换为管理员预建角色的精确 ARN。

## 静态验证

- JSON 语法：PASS。
- HOLD 权限 Allow 扫描：PASS。
- AK/IAM 提权 Allow 扫描：PASS。
- `Resource:"*"`：仅保留 CloudShell、VPC/ECS 创建/枚举、Resource Manager 只读及显式 Deny；原因记录在 diff。
- 云端动作：0。

## 未解除的 NO-GO

本策略修复本身不解除 Wave1 `NO_GO`。执行前仍需：

1. Wave1 v0.2 脚本删除 `PutBucketAcl`，改用 Bucket 创建时 private 并验证 ACL。
2. 脚本实现北京区、固定命名/CIDR/标签/资源组、ownership ledger 的 fail-closed 检查。
3. FC 写入并验证 instanceConcurrency=1、最大实例数=1、预留实例=0。
4. 修订脚本完成独立安全 QA。

## 用户唯一操作

管理员按 `console_update_steps.md` 在现有策略中创建新版本并设为默认；无需解绑/重绑。
