# VisionQA Cloud Shell 无 Token 身份机制补充独立审查

> 日期：2026-07-30（Asia/Shanghai）  
> 审查性质：只读 QA/治理裁决  
> 云端写入：0；资源创建：0；费用：0；密钥读取/创建：0  
> **裁决：`B / NO_GO_FOR_NO_TOKEN_WAVE1`**

## 1. 新证据

在正确的 `visionqa-staging-operator` Cloud Shell 会话中，脱敏证据为：

- `IdentityType=RAMUser`；
- `approved_operator_match=true`；
- Operator 已绑定 MFA；
- RAM 用户 AccessKey 数量为 0，已独立验证；
- modern：ID/Secret 为 `PRESENT_NONEMPTY`，SecurityToken 为 `ABSENT`；
- legacy：ID/Secret 为 `PRESENT_NONEMPTY`，SecurityToken 为 `ABSENT`；
- 两套 ID/Secret 为镜像；
- 无 Credentials URI、Role/OIDC 环境链。

该状态是 `PARTIAL + PARTIAL`。按 v0.9 审查矩阵必须拒绝，因为不存在一套完整的 ID + Secret + SecurityToken。

## 2. 官方机制核对

阿里云官方材料可以支持以下结论：

- Cloud Shell 支持以 RAM 用户或 RAM 角色登录，并按该 RAM 身份的权限访问资源；
- 官方建议不要使用主账号访问 Cloud Shell，应使用最小权限 RAM 用户或 RAM 角色；
- 阿里云 CLI 将 `ALIBABA_CLOUD_SECURITY_TOKEN` 定义为 STS 临时安全令牌，需与 ID/Secret 配合；
- 阿里云 RAM 官方建议短期授权使用 RAM Role + STS 临时凭证，临时凭证会自动过期；
- RAM Role 本身没有永久 AccessKey，必须被可信主体 Assume 后使用。

官方依据：

- https://www.alibabacloud.com/help/en/cloud-shell/identity-management-cloudshell
- https://www.alibabacloud.com/help/en/cloud-shell/faq-1
- https://www.alibabacloud.com/help/en/cli/environment-variables
- https://www.alibabacloud.com/help/en/ram/user-guide/grant-permissions-to-the-ram-user
- https://www.alibabacloud.com/help/en/ram/user-guide/assume-a-ram-role

现有官方材料没有证明 Cloud Shell 注入的“无 SecurityToken 的 ID + Secret”具有可查询的短期到期时间、可验证的会话绑定或等价于标准 STS 三元组。

## 3. 对方案 A 的裁决

### 不能据现有证据放行

以下条件都是真实且有价值的防护：

- 当前身份是批准的 Operator；
- MFA 已绑定；
- RAM 用户持久 AccessKey 数量为 0；
- 双链 ID/Secret 完全一致；
- `IGNORE_PROFILE=TRUE`；
- 新 VM、短时会话、禁止外传。

但它们仍不能加密学地证明当前无 Token ID/Secret 的：

- 签发来源；
- 到期时间；
- 是否只绑定当前 Cloud Shell 会话；
- 撤销语义；
- 与长期 AK 不同的可验证凭证类型。

`GetCallerIdentity` 只能证明“这组当前可用凭证对应批准身份”，不能证明凭证一定短期或带会话约束。RAM 用户 AccessKey 数量为 0 可以排除该用户名下的持久 AK，却不能单独证明 Cloud Shell 注入凭证的生命周期和签发机制。

因此，允许该无 Token 链执行 Wave1 mutating Action 会把“身份正确”误当成“凭证类型与生命周期已证明”。这不满足本项目禁止长期静态 AK、要求临时可过期凭证的威胁模型。

**方案 A：NO-GO。**

## 4. 方案 B：无需用户提供 AK 的安全替代入口

采用专用 RAM Role + STS `AssumeRole`：

1. 管理员创建专用执行角色，例如 `visionqa-staging-wave1-executor`。
2. 角色信任策略只允许 `visionqa-staging-operator` Assume。
3. 角色只绑定已审定的 Wave1 最小权限；禁止 RDS、NAT/EIP、Qwen、BSS、IAM 提权和 AccessKey。
4. Operator 本身不再持有 Wave1 mutating 权限，只保留：
   - Cloud Shell 会话权限；
   - 对这个唯一角色 ARN 的 `sts:AssumeRole`；
   - 必需的只读身份探针。
5. 新版 wrapper 在内存中调用 `AssumeRole`，要求显式短时 Duration 和唯一 SessionName。
6. 直接把返回的临时 ID、Secret、SecurityToken 注入子 Shell 环境；不得显示、写盘、进入历史、日志或聊天。
7. 设置 `ALIBABA_CLOUD_IGNORE_PROFILE=TRUE`，清除 legacy/profile/metadata/OIDC 等其他链。
8. 使用新 STS 三元组再次执行 `GetCallerIdentity`，必须得到固定执行角色的 `AssumedRoleUser` ARN。
9. 只有角色身份、会话名、账号、到期时间和剩余有效期全部通过后，才运行 preflight/apply/verify。
10. 子 Shell 退出后立即 unset 临时三元组；到期后自动失效。

该方案使用官方标准的临时身份机制，不要求用户创建、查看或发送 AccessKey。

## 5. 用户唯一动作

用户只需让阿里云管理员完成一次控制台授权：

> 创建并授权专用 RAM Role `visionqa-staging-wave1-executor`，只允许 `visionqa-staging-operator` Assume，角色绑定审定的 Wave1 最小权限，并把 Operator 的资源变更权限收敛为仅可 Assume 该角色；不要创建 AccessKey。

完成后，用户只需回复：

> 专用 Wave1 执行角色已创建并授权，未创建 AccessKey。

账号 ID、Role ARN、策略 JSON、临时凭证和 Token 均不得发到聊天中。管理员应在控制台私下配置并保存脱敏证据。

## 6. 新入口验收标准

### 管理员与权限

1. Operator AccessKey 数量仍为 0。
2. Operator 只能 Assume 唯一固定执行角色，不得 Assume 通配角色。
3. 执行角色信任主体只包含批准 Operator。
4. 执行角色权限与审定 Wave1 Action/资源边界一致或更窄。
5. Operator 直接调用任一 Wave1 mutating Action必须 `AccessDenied`。
6. 执行角色继续显式 Deny RDS、NAT/EIP、Qwen、BSS、RAM/IAM 提权、AccessKey 和公共入口。

### 临时会话

7. `AssumeRole` 返回完整非空 ID + Secret + SecurityToken。
8. 返回包含可解析到期时间，且会话时长不超过审定短时上限。
9. SessionName 固定前缀并带单次随机 run ID，可在 ActionTrail 审计。
10. 临时三元组只存在于子 Shell 内存，不写盘、不输出、不进入命令历史。
11. `ALIBABA_CLOUD_IGNORE_PROFILE=TRUE`，其他凭证链全部 unset。
12. 二次 `GetCallerIdentity` 必须为固定角色的 `AssumedRoleUser`，账号与角色 ARN 私下固定匹配。
13. 假/过期 Token、错误角色、错误账号、错误 SessionName、过长 Duration、缺 Token 全部 fail-closed。

### 执行与发布

14. 新 wrapper/凭证门必须发布不可覆盖的新版本和新 ZIP。
15. 独立 QA 复算 SHA，并执行凭证、泄露、状态、I/O、攻击、禁止项和 RAM 边界全套测试。
16. 新 QA 给出 `GO_FOR_MANUAL_CLOUDSHELL` 前不得运行 Wave1。
17. 任一云端 preflight 失败立即停止，apply 不得启动。

## 7. 最终结论

```text
CURRENT_CLOUDSHELL_NO_TOKEN_CHAIN=NO_GO
STANDARD_RAM_ROLE_STS_ENTRY=RECOMMENDED
USER_ACCESS_KEY_REQUIRED=NO
CLOUD_WRITE_AUTHORIZED=NO
```

在阿里云官方未提供可验证证据证明 Cloud Shell 无 Token ID/Secret 是具备明确到期和会话绑定的临时凭证前，本项目不得把该链等同于标准 STS。
