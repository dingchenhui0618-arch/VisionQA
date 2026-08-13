# v0.2 策略证据清单

- [ ] JSON 中不再存在未替换的 `<ACCOUNT_ID>`。
- [ ] JSON 中不再存在未替换的 `<EXACT_FC_RUNTIME_ROLE_ARN>`。
- [ ] 控制台显示策略名仍为 `VisionQAStagingOperatorBootstrapV01`。
- [ ] 控制台显示新版本为默认版本。
- [ ] Operator 用户只直接绑定此一项项目自定义策略。
- [ ] Operator AccessKey 数量仍为 0。
- [ ] MFA 仍启用。
- [ ] 策略全文搜索 `rds:Create` 只命中 Deny。
- [ ] 策略全文搜索 `CreateNatGateway`、`AllocateEipAddress`、`dashscope:*` 只命中 Deny。
- [ ] `ram:PassRole` 只包含单一、精确的 FC Runtime Role ARN。
- [ ] 保留脱敏截图：策略名、默认版本号、绑定关系、AccessKey=0、MFA 状态。
- [ ] 不在截图、聊天、shell history 中暴露账号 ID 或完整 Role ARN。
- [ ] Wave1 v0.2 执行脚本 QA 通过前不执行 apply。

