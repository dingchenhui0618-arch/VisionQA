# 控制台最少更新步骤（v0.2.3）

由 RAM 管理员执行一次：

1. 打开 `bootstrap_policy_wave1_v0.2.3.json`。
2. 在本地替换全部 `<ACCOUNT_ID>` 与 `<EXACT_FC_RUNTIME_ROLE_ARN>`。
3. RAM 控制台 → 自定义策略 → 现有 `VisionQAStagingOperatorBootstrapV01`。
4. 创建新版本，粘贴替换后的 JSON，保存并设为默认。
5. 不解绑/重绑用户，不增加其他策略，不创建 AccessKey。
6. 脱敏留证：默认版本、Operator 绑定关系、MFA、AccessKey=0。

唯一云端人工动作是：**为现有同名策略创建新版本并设为默认**。在 Wave1 v0.5 独立 QA 给出 GO 前不得执行 apply。

