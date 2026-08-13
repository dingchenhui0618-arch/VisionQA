# 控制台最少更新步骤（v0.2.1）

由 RAM 管理员执行一次，Operator 不得自行改策略。

1. 打开 `bootstrap_policy_wave1_v0.2.1.json`。
2. 在本地将全部 `<ACCOUNT_ID>` 替换为账号 ID。
3. 将 `<EXACT_FC_RUNTIME_ROLE_ARN>` 替换为管理员预建的 FC Runtime Role 完整 ARN。
4. RAM 控制台 → 权限策略 → 自定义策略 → `VisionQAStagingOperatorBootstrapV01`。
5. 创建新版本，粘贴替换后的 v0.2.1 JSON。
6. 保存并将新版本设为默认版本。
7. 不解绑/重绑用户，不添加第二项策略，不创建 AccessKey。
8. 留存脱敏证据：策略名、默认版本号、Operator 绑定关系、AccessKey=0、MFA 已启用。

唯一云端人工变更仍是：**给现有同名策略创建新版本并设为默认**。

