# VisionQA 阿里云 Staging 最小授权手册 v0.2

> 状态：`AUTHORIZATION_ONLY / NO_RESOURCE_CREATED / NO_COST_INCURRED`  
> 地域：华北 2（北京）`cn-beijing`  
> 环境：仅 `staging`，不授权 `production`  
> 目标：用阿里云替代 Cloudflare D1/R2，并为百炼 Qwen Canary 建立安全、可撤销的授权路径。
> 生命周期冻结：所有 `staging/visionqa/*` 当前对象 14 天永久删除；未完成 Multipart Upload 1 天清理。  
> 替代版本：本包替代 v0.1；v0.1 仅保留审计，不得继续用于授权。

## 先说结论

需要你提供的是**阿里云控制台授权结果**，不是 AccessKey。

推荐的 MVP 路线：

1. 人员操作使用独立 RAM 用户、控制台登录和 MFA，不创建 AccessKey；
2. 应用运行使用函数计算或容器绑定的 RAM 角色，自动取得 STS 临时凭证；
3. 图片放入北京地域私有 OSS，只授权 `staging/visionqa/` 前缀；
4. 数据库使用北京地域 RDS PostgreSQL，VPC 内网连接，不开公网；
5. 百炼建立独立 staging 业务空间，API Key 只允许固定 Qwen 模型和计算出口 IP；
6. 百炼 API Key、数据库口令如需保存，只进入阿里云 Secret Manager/KMS 或运行平台 Secret，不在聊天、CSV、代码仓库或截图中展示；
7. 首轮 Canary 的业务硬限制仍为 **¥20、5 张、15 次请求、并发 1、禁止自动续跑**。

不要授予 `AdministratorAccess`、`AliyunRDSFullAccess`、`AliyunOSSFullAccess` 或 `AliyunBailianFullAccess` 给应用运行身份。

## 一、你在控制台需要完成的步骤

### 0. 账号前置检查

由阿里云账号所有者完成：

- 确认账号已实名认证、可正常使用中国内地云产品；
- 确认费用联系人手机号和邮箱有效；
- 所有资源固定选择 **华北 2（北京）**；
- 新建资源组 `visionqa-staging`，后续资源统一加入此资源组并打标签：
  - `project=visionqa`
  - `environment=staging`
  - `owner=<预算责任人>`
- 不要在此阶段购买包年包月资源；任何付费创建都等待技术 Agent 给出最终资源规格后再二次确认。

勾选结果填写到 `authorization_decisions.csv`。

### 1. 建立人员 RAM 用户

路径：访问控制 RAM → 身份管理 → 用户 → 创建用户。

建议名称：`visionqa-staging-operator`

配置：

- 仅开启控制台访问；
- 强制首次登录修改密码；
- 开启 MFA；
- **不要勾选 OpenAPI 调用访问**，因此不会产生 AccessKey；
- 不授予 `AdministratorAccess`；
- 初次只授予查看权限；资源创建前再按 `ram_permission_matrix.csv` 中的“部署者”权限临时授权；
- 部署完成后移除写权限，降为只读审计。

### 2. 建立运行 RAM 角色

路径：访问控制 RAM → 身份管理 → 角色 → 创建角色。

建议名称：`visionqa-staging-runtime`

可信实体只能是实际承载 API 的阿里云计算服务：

- 优先：函数计算 Function Compute；
- 若技术 Agent 最终选择容器：只能是对应的阿里云容器运行服务；
- 不允许“阿里云账号”或任意外部账号作为宽泛可信实体。

给该角色绑定一个自定义策略，只允许：

- 私有 OSS Bucket 下 `staging/visionqa/*` 对象的必要读写；
- 精确 KMS Secret 的读取；
- 精确 SLS Project/Logstore 的写日志；
- 不含 OSS Bucket 管理、RDS 控制面、RAM、费用、百炼 API Key 管理权限。

运行时通过服务角色取得 STS，不需要 AccessKey。

### 3. 预留 OSS 安全配置

资源创建阶段必须满足：

- 地域：华北 2（北京）；
- Bucket ACL：私有；
- 禁止公共读和公共读写；
- 禁止静态网站托管；
- 访问路径仅 `staging/visionqa/`；
- 应用与 OSS 同地域时使用内网 Endpoint；
- 前端不得拿永久 OSS URL，只能通过后端生成短期签名 URL；
- 签名 URL TTL：默认 300 秒，最大 300 秒；
- 生命周期是唯一冻结值，不允许操作者自行选择或延长：
  - `staging/visionqa/*` 下全部当前对象：14 天后永久删除；
  - 未完成 Multipart Upload：1 天后中止并清理；
  - 不为 `uploads/`、`derived/` 或 `evidence/` 设置不同保留天数；
- 不开启版本控制；如果后续开启，必须同时设置历史版本删除规则；
- 删除请求与生命周期删除均进入审计记录。

OSS 生命周期规则并非秒级执行；官方说明规则加载及定期扫描存在时间窗口，因此“用户主动删除”仍需由应用立即调用删除并写审计，生命周期只作兜底。

### 4. 预留 RDS PostgreSQL 安全配置

资源创建阶段必须满足：

- 地域：华北 2（北京）；
- 加入 `visionqa-staging` 资源组和专用 VPC；
- 仅内网地址，不申请公网地址；
- 白名单仅包含计算运行时所在 vSwitch/CIDR 或固定私网出口；
- 禁止 `0.0.0.0/0`；
- 数据库账号采用最小数据库权限：
  - migration 账号：只在部署窗口使用，结束后禁用；
  - runtime 账号：仅应用 schema 的 SELECT/INSERT/UPDATE，以及确需的 DELETE；
- 数据库密码进入 Secret Manager/KMS 或运行平台 Secret；
- staging 业务记录默认 30 天删除；
- 审计记录默认 90 天删除；需要更久必须重新获得数据责任人批准；
- 备份保留、日志保留和回收站窗口在创建前由管理员截图确认。

注意：RAM 管的是 RDS 控制台/API；应用连接数据库使用的是数据库账号和 VPC 网络控制，两者不能混为一谈。

### 5. 选择计算运行时

MVP 首选函数计算：

- 只部署 staging 服务；
- 绑定 `visionqa-staging-runtime` 角色；
- 放入与 RDS 相同的 VPC/vSwitch；
- 公网访问仅保留调用百炼所需的固定出口方案；
- 设置单实例或严格并发限制；
- 环境变量只放非敏感配置；
- Secret 通过 KMS/运行平台 Secret 注入；
- SLS 中禁止记录图片二进制、签名 URL 查询参数、Prompt 全文、百炼响应全文、API Key、数据库口令；
- 仅记录 request ID、asset ID、模型 ID、耗时、token 数、费用估算、decision 和脱敏错误码。

如果容器方案不能提供稳定出口 IP，百炼 API Key 的 IP 白名单无法收紧，Canary 保持 `fetch=0`。

### 6. 建立百炼 staging 业务空间

路径：阿里云百炼控制台 → 右上角选择华北 2（北京）→ 业务空间管理。

配置：

- 新建独立空间：`visionqa-staging`；
- 不使用默认业务空间；
- 只授权项目固定的视觉模型；创建前在控制台确认该精确模型 ID 实际可用；
- API Key 选择“自定义”：
  - 可访问模型：只勾选已批准的 Qwen 视觉模型；
  - IP 白名单：只填计算运行时固定出口 IP/CIDR；
  - 删除默认 `0.0.0.0/0`；
- 描述：`VisionQA staging canary only; max 5 assets; revoke after run`；
- Key 只由阿里云管理员在控制台创建并直接写入 Secret Manager/运行平台 Secret；
- **不要通过聊天、CSV、README、Git、工单正文或截图传递 Key**；
- Canary 完成后立即禁用或重置 Key；若不再使用则删除；
- 不开通模型调优、知识库、数据处理、Prompt 工程或长期记忆权限。

官方公开说明确认“数据不会用于模型训练”，同时也明确“依法会存储模型与应用调用产生的数据”，但公开页面没有给出本项目所需的精确保留天数、删除 SLA、备份淘汰和人工审核边界。因此在管理员提供服务协议/工单证据前：

```text
BAILIAN_DATA_GOVERNANCE_EVIDENCE = PENDING
QWEN_FETCH = DISABLED
```

### 7. 费用控制

路径：费用与成本 → 预算管理 / 成本监控。

必须配置：

- 财务单元或资源标签范围：`project=visionqa, environment=staging`；
- Canary 项目预算：¥20；
- 实际值告警：¥10、¥16、¥20；
- 预测值告警：¥16、¥20；
- 高额消费预警覆盖百炼、OSS、RDS、函数计算/容器和 SLS；
- 接收人：预算责任人和 CTO；
- 代码侧继续保留 5 张、15 请求、并发 1 和 ¥20 预扣硬停。

重要：阿里云预算告警只通知，**不会自动停止资源或扣费**。因此 ¥20 不能仅靠控制台预算保证，必须同时依靠代码硬停和 Canary 后禁用 API Key。

### 8. 日志、保留和删除

- ActionTrail：用于云资源控制面审计；开启投递至专用 SLS Project；
- 应用日志：专用 SLS Logstore，默认保存 30 天；
- 安全/授权审计：默认保存 90 天；
- 不记录敏感正文；
- 删除记录至少包括请求人、asset ID、对象前缀、时间、结果与 request ID；
- KMS Secret 访问开启审计；
- Canary 完成后：
  1. 禁用百炼 API Key；
  2. 删除 OSS Canary 对象；
  3. 清除应用临时记录；
  4. 核验生命周期和日志保留设置；
  5. 移除部署者写权限；
  6. 将完成证据写回决策表，不上传敏感值。

## 二、凭证方式比较

| 方式 | 适用 | 风险/限制 | 本项目决定 |
|---|---|---|---|
| 主账号 | 一次性实名认证、服务开通、RAM/财务治理 | 权限不可收窄，误操作面最大 | 只做一次性治理，不做日常开发 |
| RAM 用户 + 控制台 + MFA | 人员部署、查看和审计 | 权限需定期回收 | 推荐；不创建 AccessKey |
| RAM 角色 + STS | 函数/容器访问 OSS、KMS、SLS | 需锁定可信实体和最小策略 | 运行时首选 |
| CloudShell/CLI | 短时人工部署或验证 | 容易复制长期 AK；本地留痕风险 | 仅使用控制台会话/临时凭证；不是必需 |
| RAM 用户永久 AccessKey | 本地 SDK 无法使用角色时 | 长期泄露风险 | 默认禁止；确实需要时才例外 |
| 百炼 API Key | 调用模型 | 独立于 RAM 控制台权限，可能产生费用 | 仅 staging 自定义模型/IP范围，存 Secret，Canary 后撤销 |
| 百炼临时 API Key | 短时第三方访问 | 官方有效期仅 60 秒，不适合常驻后端 | 可用于一次性人工测试，不用于服务运行 |

若本地开发最终不得不使用 AccessKey：

1. 只能为 `visionqa-staging-local-bootstrap` 单独创建 RAM 用户；
2. 仅允许 `sts:AssumeRole` 到 `visionqa-staging-deployer`；
3. 不直接授予 OSS/RDS/KMS/百炼权限；
4. 值只进入本机系统 Secret Manager 或受控环境变量；
5. 不展示给 Codex，不写 `.env` 入库，不发聊天；
6. 当天完成后删除 AccessKey，并在 RAM 治理检测中确认无闲置 Key。

## 三、你需要返回什么

只返回以下非敏感信息：

1. 填好的 `authorization_decisions.csv`；
2. 阿里云账号管理员、预算责任人、数据责任人的姓名或角色声明；
3. 控制台资源配置的脱敏证据引用（截图路径或工单编号），不得含 Secret；
4. 百炼服务协议/支持工单中关于保留、删除、备份和人工审核的条款引用；
5. 计算固定出口 IP 已配置的“是/否”，不要在公开文档中写 IP 明文。

不要返回：

- AccessKey ID / AccessKey Secret；
- 百炼 API Key；
- STS Token；
- KMS Secret 值；
- 数据库密码；
- 带签名参数的 OSS URL。

## 四、撤销方案

任一阶段可按以下顺序撤销：

1. 禁用/删除百炼 staging API Key；
2. 从计算服务解除 `visionqa-staging-runtime` 角色；
3. 撤销人员 RAM 用户的写权限并禁用控制台登录；
4. 删除或计划删除 KMS Secret；
5. 清理 OSS `staging/visionqa/` 对象并确认生命周期；
6. 停止计算服务和 RDS；
7. 保留必要审计证据后删除 staging 资源；
8. 在费用与成本中确认无继续产生的按量费用。

## 五、官方依据

- [RAM 身份与访问控制最佳实践](https://help.aliyun.com/zh/ram/product-overview/best-practices-for-identity-and-access-control)
- [RAM 用户授权与临时角色建议](https://help.aliyun.com/zh/ram/user-guide/grant-permissions-to-the-ram-user)
- [STS 与 RAM 角色](https://help.aliyun.com/zh/ram/user-guide/what-is-sts)
- [OSS 权限控制概述](https://help.aliyun.com/zh/oss/user-guide/overview-75/)
- [OSS 前缀级 RAM 授权](https://help.aliyun.com/en/oss/user-guide/access-control-base-on-ram-policy)
- [OSS 生命周期](https://help.aliyun.com/zh/oss/user-guide/overview-54/)
- [RDS PostgreSQL 身份管理](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/security-and-compliance/)
- [RDS PostgreSQL 网络隔离](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/network-isolation)
- [RDS PostgreSQL 白名单](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/configure-an-ip-address-whitelist-for-an-apsaradb-rds-for-postgresql-instance-1)
- [百炼权限管理与环境隔离](https://help.aliyun.com/zh/model-studio/permission-management-overview)
- [百炼 API Key 自定义模型与 IP 范围](https://help.aliyun.com/zh/model-studio/get-api-key/)
- [百炼隐私说明](https://help.aliyun.com/zh/model-studio/privacy-notice)
- [阿里云预算管理](https://help.aliyun.com/zh/user-center/user-guide/budget-management-1)
- [KMS RAM 凭据管理](https://help.aliyun.com/zh/kms/key-management-service/user-guide/manage-and-use-ram-secrets)
