# v0.2.1 证据清单

- [ ] 无 `<ACCOUNT_ID>` 或 `<EXACT_FC_RUNTIME_ROLE_ARN>` 未替换占位符。
- [ ] `VisionQAStagingOperatorBootstrapV01` 的 v0.2.1 对应版本是默认版本。
- [ ] Operator 只绑定本项目自定义策略，AccessKey=0，MFA 已启用。
- [ ] OSS 标签 Action 仅 `PutBucketTagging`、`GetBucketTagging`。
- [ ] FC 标签 Action 仅 `TagResources`、`ListTaggedResources`。
- [ ] SLS 标签读取为 `log:ListTagResources`，资源仅固定 Project ARN。
- [ ] 不存在 `fc:ListTagResources`。
- [ ] 不存在新增 `tag:*`、BSS Allow、Untag/Delete 标签 Allow。
- [ ] RDS/NAT/EIP/Qwen/AK/RAM 提权 Deny 与 v0.2 一致。
- [ ] 预算告警证据文件由管理员提供；只记录 SHA256，不授予 BSS。
- [ ] Wave1 v0.2 执行包独立 QA 通过前不执行 apply。

