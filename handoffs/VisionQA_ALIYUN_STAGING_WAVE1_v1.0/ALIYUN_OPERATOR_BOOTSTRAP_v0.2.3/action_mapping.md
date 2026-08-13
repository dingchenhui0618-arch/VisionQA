# Wave1 v0.4/v0.5 Action 映射

来源：`ALIYUN_STAGING_WAVE1_v0.4/ACTION_INVENTORY.txt`。v0.5 必须保持同一云 API inventory；若新增 Action，需先回审。

## FC 特别映射

| Action | Resource |
|---|---|
| `fc:ListFunctions` | `acs:fc:cn-beijing:<ACCOUNT_ID>:functions/*` |
| `fc:CreateFunction` | 两个固定 Function ARN |
| `fc:GetFunction` | 两个固定 Function ARN |
| `fc:DeleteFunction` | 两个固定 Function ARN |
| `fc:Put/Get/DeleteConcurrencyConfig` | 两个固定 Function ARN |
| `fc:Put/Get/DeleteProvisionConfig` | 两个固定 Function ARN |
| `fc:TagResources`、`fc:ListTaggedResources` | 两个固定 Function ARN |

固定函数仅为 `visionqa-staging-api` 与 `visionqa-staging-evaluation-task`。任何 FC mutating Action 均不得使用 `functions/*`。

## 其他服务

- VPC/ECS：创建、描述、标签、标签回读、精确回滚；安全组规则写操作保持 Deny。
- OSS：Bucket 创建、BPA、SSE、生命周期、Bucket 标签、配置回读、回滚前空桶检查、精确删除。
- SLS：Project/Logstore 创建和读取、Project 标签写入/读取、精确回滚。
- Resource Manager：仅 `GetResourceGroup`。
- RAM：仅精确 FC Runtime Role 的 `PassRole`。
- CloudShell：CreateEnvironment/CreateSession 属于会话基础能力，不属于 Wave1 资源操作。

明确不授权 `oss:GetBucketLocation` 与 `resourcemanager:ListResourceGroups`。

