# VisionQA 阿里云认证能力只读检查报告 v0.1

> 角色：阿里云认证能力只读检查 Agent  
> 日期：2026-07-29  
> 检查边界：只读；未创建、修改或删除任何云资源；未产生费用；未读取、打印或记录任何 AccessKey、Secret、Token、密码或签名 URL。

## 1. 职责、输入、输出与验收

### 职责

- 检查本机 Alibaba Cloud CLI、Profile、Region 和凭证链是否可用；
- 在不读取 Cookie、Local Storage、密码或 Token 的前提下，检查浏览器控制台与 Cloud Shell 是否存在可复用认证会话；
- 只报告凭证信号的 `present/absent`，身份仅允许报告脱敏账号或 ARN；
- 给出后续最安全、无需在聊天传递 Secret 的认证方式。

### 输入

- `D:\VisionQA\handoffs\ALIYUN_AUTHORIZATION_v0.2\README.md`
- `D:\VisionQA\handoffs\ALIYUN_AUTHORIZATION_v0.2\authorization_decisions.csv`
- `D:\VisionQA\agents\aliyun_staging_architecture_v0.1.md`
- `D:\VisionQA\agents\aliyun_authorization_governance_v0.2.md`

### 输出

- 本报告。

### 验收

- PASS：没有输出或持久化任何 Secret；
- PASS：没有创建资源、调用付费服务或修改认证配置；
- PASS：CLI、配置文件、环境变量和浏览器会话均完成只读检查；
- PASS：明确了可执行的无长期 AccessKey 认证路径。

## 2. 授权文件接入结果

`authorization_decisions.csv` 共 12 行：

- `APPROVE`：11 行；
- 计算路线：1 行选择 `FUNCTION_COMPUTE`；
- 授权意图已经明确，但授权不等于账号认证，也不等于资源已创建。

仍待云端实际配置后补齐的证据包括：RAM 运维用户、运行角色策略、OSS 生命周期、RDS 私网/白名单、FC VPC/固定出口、百炼独立空间、百炼 Key 约束、预算告警、SLS 保留和撤销核验。百炼数据保留/删除 SLA/人工审核边界的服务协议或工单引用仍为显式 `PENDING`。

## 3. 本机 CLI 与凭证链

| 检查项 | 结果 |
|---|---|
| `aliyun` / Alibaba Cloud CLI | `ABSENT` |
| CLI 版本 | 不适用 |
| `~/.aliyun/config.json` 等常见 Profile | `ABSENT` |
| 当前 Profile | 不存在 |
| 默认 Region | 不存在 |
| 本地可调用账号身份 / ARN | 不可获得 |
| Alibaba Cloud AK 环境变量信号 | 全部 `ABSENT` |
| STS Token 环境变量信号 | `ABSENT` |
| Credentials URI / Role ARN / OIDC 信号 | 全部 `ABSENT` |

结论：当前机器没有可用的 Alibaba Cloud CLI 认证链，无法安全执行 `GetCallerIdentity`；因此没有账号 ID 或 ARN 可供脱敏报告。没有发现本机凭证并不是错误，反而符合项目“默认不保存长期 AccessKey”的治理要求。

## 4. 浏览器与 Cloud Shell

- Chrome 中能看到此前打开过的阿里云控制台/Workbench 标签页元数据；
- 这些旧标签页已被另一浏览器任务占用，不能作为本 Agent 可复用认证能力的证据；
- 本 Agent 新开阿里云控制台主页时被重定向至官方登录页；
- 未发现已打开的 Cloud Shell 标签页；
- 因此当前状态为：

```text
ALIYUN_BROWSER_SESSION_FOR_AGENT = NOT_AUTHENTICATED
ALIYUN_CLOUDSHELL_SESSION = ABSENT
ALIYUN_CALLER_IDENTITY = UNAVAILABLE
```

未检查 Cookie、Local Storage、密码、验证码或浏览器凭证存储。

## 5. 最安全的后续认证方式

### 首选：RAM 控制台登录 + MFA + Cloud Shell 临时凭证

1. 账号管理员只做一次性治理操作：确认或创建 `visionqa-staging-operator` RAM 用户；
2. 该用户只启用控制台访问，强制 MFA 和首次登录改密，不创建 AccessKey；
3. 给该用户授予经审批的 staging 部署最小权限，并额外授予 Cloud Shell 所需的最小自定义权限；
4. 使用该 RAM 用户登录阿里云控制台并打开 Cloud Shell；
5. 后续部署和只读验证在 Cloud Shell 中进行。阿里云会根据当前控制台身份自动配置临时凭证，无需向 Codex、聊天、CSV、Git 或本机配置文件提供 AccessKey；
6. 部署结束后移除部署写权限，只保留审计所需的只读权限。

不要直接给 `AliyunCloudShellFullAccess`，优先使用只允许创建 Cloud Shell 环境/会话的自定义策略；上传、下载和持久存储动作若当前部署不需要，应排除。

### 运行时

- FC 绑定 `visionqa-staging-runtime` RAM 角色；
- 运行时通过服务角色自动取得 STS 临时凭证；
- OSS、KMS 和 SLS 权限严格限定资源与前缀；
- RDS 使用 VPC、白名单和独立数据库账号，不把数据库访问混入 RAM 控制面权限；
- 百炼 Key 只由管理员写入 Secret，不经过 Codex 或聊天。

### 本地 CLI 备选

若后续确实必须使用本地 CLI，应安装官方 CLI 并使用浏览器 OAuth Profile，或使用 `RamRoleArn`/STS。不要创建主账号或 RAM 用户的长期 AK。官方 CLI 文档当前将 OAuth、RAM Role 和 STS 列为推荐凭证方式，将永久 AK 标为不推荐。

## 6. 用户当前最小动作

当前无需提供任何 Key。只需：

1. 在 Chrome 登录阿里云控制台；
2. 若 `visionqa-staging-operator` 尚未创建，由账号管理员创建：控制台访问开启、MFA 必须、OpenAPI/AccessKey 不开启；
3. 为该 RAM 用户授予 Cloud Shell 最小权限并打开一个 Cloud Shell 标签页；
4. 保持该页面打开，回复项目组：`阿里云 RAM + MFA 已登录，Cloud Shell 已打开`。

上述动作完成后，实施 Agent 才能先执行只读身份核验（CallerIdentity、Region、资源清单和预算状态），随后另行列出精确资源规格及预计费用。任何资源创建或付费动作仍需遵循项目既有二次确认门禁。

## 7. 官方依据

- RAM 用户控制台登录与 MFA：  
  https://help.aliyun.com/en/ram/user-guide/manage-console-logon-settings-for-a-ram-user
- Alibaba Cloud CLI 凭证方式；Cloud Shell 自动使用临时凭证：  
  https://help.aliyun.com/en/cli/configure-credentials/
- RAM 用户使用 Cloud Shell 所需授权：  
  https://help.aliyun.com/en/cloud-shell/access-control-ram

## 8. Gate

```text
ALIYUN_AUTHORIZATION_DECISIONS = RECEIVED
LOCAL_ALIYUN_CLI = ABSENT
LOCAL_CREDENTIAL_CHAIN = ABSENT
REUSABLE_BROWSER_AUTH = ABSENT
CLOUDSHELL = ABSENT
RESOURCE_CREATION = NOT_RUN
COST_INCURRED = 0
NEXT_GATE = USER_RAM_MFA_LOGIN_AND_OPEN_CLOUDSHELL
```
