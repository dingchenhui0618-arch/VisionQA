# 阿里云 Wave1 RAM 资源范围收紧报告 v0.2.3

日期：2026-07-29（Asia/Shanghai）

## 完成

- 删除未使用的 `oss:GetBucketLocation`、`resourcemanager:ListResourceGroups`。
- FC `ListFunctions` 单独保留通配枚举资源。
- FC 所有创建、配置、打标和删除动作仅绑定两个固定 fixture Function ARN。
- 未新增权限，全部显式 Deny 保持不变。

## 验证目标

- JSON 语法通过。
- Allow Action 只减不增。
- FC mutating Statement 不包含 `functions/*`。
- Deny Action 集合与 v0.2.2 完全一致。
- 云端操作、资源创建、订单和模型调用均为 0。

## 状态

策略完成不代表执行解禁。必须等待 Wave1 v0.5 修复 rollback 终态并由独立 QA 给出 `GO_FOR_MANUAL_CLOUDSHELL`。
