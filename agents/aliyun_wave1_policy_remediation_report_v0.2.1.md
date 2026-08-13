# 阿里云 Wave1 RAM 标签权限修复报告 v0.2.1

日期：2026-07-29（Asia/Shanghai）

## 结果

已在 v0.2 最小权限策略上仅补充 OSS、FC、SLS 实际必需的标签读写 Action。云端修改、资源创建、订单、BSS 查询、模型调用均为 0。

## 官方名称核对

- OSS：`oss:PutBucketTagging`、`oss:GetBucketTagging`。
- FC：`fc:TagResources`、`fc:ListTaggedResources`；后者不能写成 `fc:ListTagResources`。
- SLS：`log:TagResources`、`log:ListTagResources`；官方 RAM 表确认 List 可绑定 Project ARN。

## 权限边界

- 未加入通用 `tag:*` 权限。
- 未加入 Untag/Delete 标签动作。
- 未改变 RDS/NAT/EIP/Qwen/AK/IAM 提权和 BSS 的显式拒绝。
- 预算门只接受管理员证据 SHA256 环境变量，不授予账单服务权限。

## 状态

策略补丁静态验证通过后可由管理员创建现有同名策略的新版本并设默认。Wave1 apply 仍须等待执行脚本独立 QA 的最终 GO。
