# Wave1 v0.3/v0.4 命令 → RAM Action 映射

本表以 `ALIYUN_STAGING_WAVE1_v0.3` 四个脚本和 preflight Action inventory 为基准。v0.4 若新增命令，必须先重新审查策略；本策略不会预授权未来动作。

## VPC / ECS

| 脚本操作 | RAM Action | 用途 |
|---|---|---|
| DescribeVpcs / DescribeVpcAttribute | `vpc:DescribeVpcs`, `vpc:DescribeVpcAttribute` | preflight、复用、验证、回滚归属 |
| CreateVpc | `vpc:CreateVpc` | 创建固定北京 staging VPC |
| DescribeVSwitches / DescribeVSwitchAttributes | `vpc:DescribeVSwitches`, `vpc:DescribeVSwitchAttributes` | preflight、复用、验证 |
| CreateVSwitch | `vpc:CreateVSwitch` | 创建固定 vSwitch |
| TagResources / ListTagResources | `vpc:TagResources`, `vpc:ListTagResources` | 写入并验证 ownership 标签 |
| DeleteVSwitch / DeleteVpc | 同名 `vpc:` Action | 仅 ledger 标记本轮创建资源的精确回滚 |
| DescribeSecurityGroups / DescribeSecurityGroupAttribute | 同名 `ecs:` Action | 验证 SG 与零入站 |
| CreateSecurityGroup | `ecs:CreateSecurityGroup` | 创建不含规则的 SG |
| TagResources / ListTagResources | 同名 `ecs:` Action | ownership 标签 |
| DeleteSecurityGroup | `ecs:DeleteSecurityGroup` | 精确回滚 |

安全组 Authorize/Modify 动作不在 Allow，并继续显式 Deny。

## OSS

| 脚本操作 | RAM Action |
|---|---|
| PutBucket / GetBucketInfo / GetBucketAcl | `oss:PutBucket`, `oss:GetBucketInfo`, `oss:GetBucketAcl` |
| Put/GetBucketPublicAccessBlock | 同名 `oss:` Action |
| Put/GetBucketEncryption | 同名 `oss:` Action |
| Put/GetBucketLifecycle | 同名 `oss:` Action |
| Put/GetBucketTagging | 同名 `oss:` Action |
| ListObjects / ListMultipartUploads | 同名 `oss:` Action；仅回滚前空桶检查 |
| DeleteBucket | `oss:DeleteBucket`；仅精确回滚 |

以下对象数据面动作在 Wave1 配置脚本中未调用，已删除：`PutObject`、`GetObject`、`DeleteObject`、`AbortMultipartUpload`、`ListParts`。

## SLS

| 脚本操作 | RAM Action |
|---|---|
| Get/CreateProject | `log:GetProject`, `log:CreateProject` |
| Get/CreateLogStore | `log:GetLogStore`, `log:CreateLogStore` |
| TagResources / ListTagResources | `log:TagResources`, `log:ListTagResources` |
| DeleteLogStore / DeleteProject | 同名 `log:` Action；仅精确回滚 |

脚本不更新已有 Logstore，也不创建/更新索引，因此删除 `UpdateLogStore`、`CreateIndex`、`GetIndex`、`UpdateIndex`。

## FC

| 脚本操作 | RAM Action |
|---|---|
| List/Get/CreateFunction | 同名 `fc:` Action |
| Put/Get/DeleteConcurrencyConfig | 同名 `fc:` Action |
| Put/Get/DeleteProvisionConfig | 同名 `fc:` Action |
| TagResources / ListTaggedResources | 同名 `fc:` Action |
| DeleteFunction | `fc:DeleteFunction`；仅精确回滚 |
| 传递管理员预建 Runtime Role | `ram:PassRole`；仅精确 ARN |

脚本对已存在函数只做漂移验证，不修改函数，因此删除 `fc:UpdateFunction`。

## 治理门

- BSS/订单 API 不在 inventory；预算告警仅核验管理员证据文件 SHA256。
- RDS、NAT/EIP、Qwen、AK/RAM 提权不在 inventory，并维持 v0.2.1 的显式 Deny。

