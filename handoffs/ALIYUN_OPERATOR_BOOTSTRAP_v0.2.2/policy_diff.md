# v0.2.1 → v0.2.2 只减权限差异

## 删除的 Allow

- OSS：`PutObject`、`GetObject`、`DeleteObject`、`AbortMultipartUpload`、`ListParts`，并删除对应对象前缀 Allow Statement。
- SLS：`UpdateLogStore`、`CreateIndex`、`GetIndex`、`UpdateIndex`。
- FC：`UpdateFunction`。

## 保留原因

- `oss:ListObjects`、`oss:ListMultipartUploads` 仍由 rollback 在删除 Bucket 前执行空桶/无未完成分片检查。
- `oss:DeleteBucket`、SLS/FC/VPC/ECS Delete 仍用于 `created_by_this_run=true` 的精确回滚。
- FC Concurrency/Provision Config 的 Put/Get/Delete 用于创建配置、验证最大实例/预留实例和回滚。
- 标签写入与读取用于所有 Wave1 资源的 ownership 验证。

## 不变

- 所有 Deny 字节级动作集合不变。
- 不增加任何新 Allow。
- 不增加 BSS 权限；预算告警采用管理员证据 SHA256。
- 仍作为现有 `VisionQAStagingOperatorBootstrapV01` 的新版本发布并设为默认，不能叠加。

