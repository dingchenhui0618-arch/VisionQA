# v0.2.2 → v0.2.3 最小权限差异

## 删除

- `oss:GetBucketLocation`：Wave1 v0.4/v0.5 inventory 不调用；地域通过 `GetBucketInfo` 返回值验证。
- `resourcemanager:ListResourceGroups`：脚本只读取管理员预先提供的精确 Resource Group ID。

## FC 资源范围收紧

原 v0.2.2 将 FC 全部动作放在同一 Statement，资源中包含 `functions/*`，导致变更和删除权限覆盖北京区所有函数。

v0.2.3 拆成：

1. `fc:ListFunctions`：保留官方要求的 `acs:fc:cn-beijing:<ACCOUNT_ID>:functions/*` 枚举资源。
2. 其余 Create/Get/Delete、Concurrency、Provision、Tag 动作：仅允许：
   - `acs:fc:cn-beijing:<ACCOUNT_ID>:functions/visionqa-staging-api`
   - `acs:fc:cn-beijing:<ACCOUNT_ID>:functions/visionqa-staging-evaluation-task`

阿里云 FC 官方自定义策略表明确支持以上 Function ARN 格式，并将 CreateFunction、DeleteFunction、PutConcurrencyConfig 等动作绑定到单个 Function ARN。

## 不变

- 新增 Allow：0。
- Action 集合除上述两个删除项外不变。
- RDS、NAT/EIP、Qwen、BSS、AK、RAM 提权等全部 Deny 原样保留。
- 精确 Role `ram:PassRole` 不变。

