# VisionQA 阿里云 Operator Bootstrap v0.1

> 状态：`INSTRUCTIONS_ONLY / NO_RESOURCE_CREATED / NO_COST_INCURRED`  
> 操作身份：`visionqa-staging-operator`  
> 目标地域：仅华北 2（北京）`cn-beijing`  
> 目标环境：仅 `staging`  
> 禁止：生产资源、长期 AccessKey、账单/IAM 提权、公开 OSS、RDS 公网地址

## 结论

本包把已批准的 v0.2 授权转换成可执行的两阶段权限：

1. **Bootstrap 创建期**：临时绑定 `bootstrap_policy.json`，用 RAM 控制台登录、MFA 与 Cloud Shell 完成已批准的 staging 创建。
2. **Post-create 运行期**：验收后立即解绑 Bootstrap 策略，替换为填入真实资源 ID 的 `post_create_restricted_policy.json`，人员身份只保留只读审计和受控清理能力。

本包没有 AccessKey，也不要求你向项目组发送 AccessKey、密码、Token、API Key 或数据库口令。

## 一个必须诚实说明的 RAM 限制

阿里云并没有可通用于所有云产品的 `acs:RequestedRegion` 条件键。FC 3.0 的 `CreateFunction` 官方明确为 `Resource: *` 且没有服务条件键；RDS、VPC 等部分创建接口在资源尚不存在时也无法按资源 ARN 限制。因此：

- 已存在资源可在第二阶段用北京地域 ARN 和真实资源 ID 收紧；
- OSS/SLS 可在第一阶段按 `visionqa-staging-*` 名称约束；
- FC/RDS/VPC 的“创建时只准北京、只准 staging”不能仅靠单条 RAM Policy 完整证明；
- 创建期采用 **MFA + 临时窗口 + 固定命名 + 控制台订单复核 + 创建后立即按真实 ID 收紧**；
- 任何界面显示非 `cn-beijing`、非 `visionqa-staging` 名称或 production 字样，立即停止。

这不是降低标准，而是避免用不存在的条件键制造虚假的安全感。

## 第 0 步：账号管理员一次性前置

用阿里云账号管理员完成，之后退出主账号日常流程：

1. 确认 OSS、RDS PostgreSQL、Function Compute、SLS、VPC 已开通。
2. 首次 RDS PostgreSQL/FC 若提示创建服务关联角色，由账号管理员单独完成；Bootstrap 策略明确拒绝 `ram:CreateServiceLinkedRole`。
3. 创建资源组，显示名和标识统一为 `visionqa-staging`。
4. 创建 FC 运行角色 `visionqa-staging-runtime`，可信服务仅为 Function Compute。
5. 不创建或提供任何 AccessKey。
6. RDS 若在下单页要求 `AliyunBSSOrderAccess`，不要给 Operator 绑定该系统策略。由预算责任人在最终订单页人工复核金额、按量/Serverless、北京地域后完成下单。Bootstrap 策略显式拒绝所有 BSS/Billing 操作。

## 第 1 步：创建 RAM 用户

路径：访问控制 RAM → 身份管理 → 用户 → 创建用户。

填写：

- 登录名称：`visionqa-staging-operator`
- 显示名称：`VisionQA Staging Operator`
- 访问方式：只勾选“控制台访问”
- 不勾选 OpenAPI 调用访问
- 强制首次登录修改密码
- 强制绑定 MFA

创建后检查：

- AccessKey 数量为 0；
- 没有 `AdministratorAccess`；
- 没有 `AliyunRAMFullAccess`；
- 没有 `AliyunBSSOrderAccess`；
- 没有任何 production 资源组授权。

## 第 2 步：创建并绑定 Bootstrap 策略

路径：访问控制 RAM → 权限管理 → 权限策略 → 创建权限策略 → 脚本编辑。

1. 复制 `bootstrap_policy.json` 的完整内容。
2. 策略名称：`VisionQAStagingOperatorBootstrapV01`。
3. 备注：`Temporary cn-beijing staging bootstrap; remove immediately after evidence capture`。
4. 将策略绑定到 `visionqa-staging-operator`。
5. 不再绑定任何 FullAccess 系统策略。

该策略只允许：

- Cloud Shell 创建环境/会话，不含上传、下载或持久盘；
- `visionqa-staging-*` OSS/SLS；
- FC、RDS、VPC、NAT/EIP、安全组的必要创建与读取动作；
- 只把 `visionqa-staging-runtime` PassRole 给 `fc.aliyuncs.com`；
- 所有 Allow 都要求 `acs:MFAPresent=true`。

该策略明确拒绝：

- 创建/修改/删除 AccessKey；
- 创建用户、角色、策略和绑定策略；
- 创建服务关联角色；
- RDS 公网地址；
- OSS 网站、Bucket Policy、ACL 修改；
- FC 自定义域名；
- 账单、充值、订单权限。

## 第 3 步：用 RAM 用户登录并打开 Cloud Shell

1. 退出主账号。
2. 使用 RAM 登录地址进入 `visionqa-staging-operator`。
3. 完成 MFA。
4. 打开 Cloud Shell。
5. 不上传 AccessKey，不执行 `aliyun configure` 写入长期凭证。
6. 只记录脱敏 Caller Identity、当前地域和资源清单；不截图 Token 或命令行环境变量。

Cloud Shell 只被授予 `CreateEnvironment` 和 `CreateSession`，没有上传、下载、AttachStorage 权限。

## 第 4 步：创建时的硬边界

所有创建页面/命令必须同时满足：

- Region：`cn-beijing`
- 资源组：`visionqa-staging`
- 名称：`visionqa-staging-*`
- 标签：
  - `project=visionqa`
  - `environment=staging`
  - `owner=<预算责任人>`
- 计费：仅已批准的按量/Serverless；包年包月禁止
- production：不存在、不可见、不可修改

顺序：

1. VPC、vSwitch、安全组；
2. 私网 RDS PostgreSQL Serverless；
3. 私有 OSS，随后配置 `staging/visionqa/` 14 天删除与未完成分片 1 天清理；
4. SLS Project/Logstore，应用日志 30 天；
5. NAT/EIP/SNAT 固定出口；
6. FC 3.0 函数，绑定 VPC、SLS 与 `visionqa-staging-runtime`；
7. fixture 模式 smoke test；
8. 不在本阶段创建百炼 Key，不运行 Qwen Canary。

任一条件不满足，停止，不用“先创建再改”绕过。

## 第 5 步：创建后立即收紧

1. 复制 `post_create_restricted_policy.json`。
2. 必须替换三个占位符：
   - `REPLACE_WITH_ACTUAL_VISIONQA_STAGING_BUCKET`
   - `REPLACE_WITH_ACTUAL_RDS_INSTANCE_ID`
   - `REPLACE_WITH_ACTUAL_SLS_PROJECT`
3. 确认 RDS ARN 固定 `cn-beijing`。
4. 策略名称：`VisionQAStagingOperatorRestrictedV01`。
5. 绑定 Restricted 策略。
6. 解绑并删除对用户的 `VisionQAStagingOperatorBootstrapV01` 授权。
7. 用 `evidence_checklist.md` 复核。

Restricted 策略不允许创建或更新 FC/RDS/VPC/OSS/SLS，不允许 PassRole，只保留只读审计和 OSS 指定前缀的受控清理。

## 你完成后只回复

```text
阿里云 Operator + MFA + Cloud Shell 已就绪，未创建 AccessKey
```

不要附带 AK、Token、Cookie、账号密码、百炼 Key、RDS 密码、带签名的 OSS URL 或包含 Secret 的截图。

## 官方依据

- [Cloud Shell 最小 Action](https://help.aliyun.com/zh/cloud-shell/access-control-ram)
- [RAM 权限策略元素与 Action 格式](https://help.aliyun.com/zh/ram/policy-elements)
- [RAM MFA 条件键](https://help.aliyun.com/zh/ram/user-guide/conditional-operator)
- [OSS Action 与授权语法](https://help.aliyun.com/zh/oss/user-guide/authorization-syntax-and-elements)
- [RDS RAM 资源 ARN](https://help.aliyun.com/en/rds/use-ram-for-resource-authorization)
- [RDS API 列表](https://help.aliyun.com/zh/rds/list-of-operations-by-function)
- [FC 3.0 CreateFunction 授权边界](https://help.aliyun.com/zh/functioncompute/fc-3-0/developer-reference/api-fc-2023-03-30-createfunction/)
- [FC PassRole 的官方策略示例](https://help.aliyun.com/en/ram/developer-reference/aliyundevsfcservicesdeploypolicy)
- [SLS RAM Action](https://help.aliyun.com/en/sls/log-service-ram-access-control-permissions-configuration)
