# 控制台最少更新步骤

> 由 RAM 管理员执行一次；Operator 不得自行更新策略。

1. 在本机打开 `bootstrap_policy_wave1_v0.2.json`。
2. 将所有 `<ACCOUNT_ID>` 替换为阿里云账号 ID；不要把账号 ID 发到聊天或截图中。
3. 将 `<EXACT_FC_RUNTIME_ROLE_ARN>` 替换为管理员预创建的 `visionqa-staging-runtime` 角色详情页显示的完整 ARN。
4. 登录 RAM 控制台 → 权限管理 → 权限策略 → 自定义策略。
5. 打开现有 `VisionQAStagingOperatorBootstrapV01`。
6. 选择“创建新版本”，脚本编辑粘贴替换后的 JSON。
7. 保存后将该新版本设为默认版本。
8. 确认该策略仍直接绑定 `visionqa-staging-operator`；不要再绑定任何补充策略或系统管理员策略。
9. 保留上一版本用于审计，但不要设为默认；待 Wave1 完成并验收后按撤权 runbook 收紧。

最少人工动作是：**在现有同名策略中创建一个新版本并设为默认**。不需要解绑/重绑用户。

