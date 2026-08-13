# v0.2 → v0.2.1 标签权限补丁

v0.2.1 仅补充 Wave1 全资源统一标签所需的官方 Action，其他 Allow、显式 Deny 和资源范围不变。

## 新增

| 服务 | Action | 资源范围 | 官方核对结论 |
|---|---|---|---|
| OSS | `oss:PutBucketTagging` | `visionqa-staging-*-cn-beijing` Bucket ARN | PutBucketTags API 的 RAM Action |
| OSS | `oss:GetBucketTagging` | 同一 Bucket ARN | GetBucketTags API 的 RAM Action |
| FC | `fc:TagResources` | 北京区两个固定 Function ARN | 官方 FC 标签写 Action |
| FC | `fc:ListTaggedResources` | 北京区 Function ARN/枚举 ARN | 官方名称不是 `fc:ListTagResources` |
| SLS | `log:ListTagResources` | `visionqa-staging-sls` Project ARN | 官方 RAM 表确认支持 Project 资源级授权 |

SLS 原有 `log:TagResources` 保持不变。未增加 `tag:*` 通用标签服务权限，未增加 Untag/Delete 标签权限。

## 未改变

- RDS create/order、NAT/EIP、Qwen/DashScope、BSS、AK 和 IAM/RAM 提权 Deny 全部保持。
- 不增加 BSS 权限。预算门继续由管理员生成的预算告警证据文件 SHA256 注入环境变量，并由 preflight 与审批清单比对。
- VPC/ECS 标签权限未扩大。
- `ram:PassRole` 仍必须是精确 FC Runtime Role ARN。

## 脚本审计替代

- FC 列标签必须调用 `ListTaggedResources`，不得调用不存在的 `ListTagResources`。
- SLS 标签读取应传精确 `resourceType=project` 和 `resourceId=visionqa-staging-sls`。
- OSS 写标签后必须立即用 GetBucketTags/GetBucketTagging 回读四个固定标签。
- 任一标签写入或回读失败，apply 必须 fail-closed；rollback 只依赖 ledger 中 `created_by_this_run=true` 的资源 ID。

