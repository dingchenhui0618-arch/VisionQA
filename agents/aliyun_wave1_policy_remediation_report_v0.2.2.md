# 阿里云 Wave1 RAM 未使用写权限清理报告 v0.2.2

日期：2026-07-29（Asia/Shanghai）

## 结果

以 Wave1 v0.3 四脚本及其 Action inventory 为准完成只减权限修复。未新增 Allow；显式 Deny 保持不变；云端修改、资源创建、订单、模型调用均为 0。

## 删除

- OSS 对象数据面 5 项权限。
- SLS 已存在 Logstore 更新与索引管理 4 项权限。
- FC UpdateFunction。

## 保留

仅保留资源创建、安全配置、标签、只读验证、并发/预留配置以及 ledger 精确回滚所需 Action。完整映射见 `action_mapping.md`。

## 执行约束

v0.4 脚本不得超出该 Action inventory；若需要新增 Action，必须重新经过策略审查。策略更新后仍需脚本独立 QA 给出 GO 才能执行 apply。
