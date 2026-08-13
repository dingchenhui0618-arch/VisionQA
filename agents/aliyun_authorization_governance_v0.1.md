# VisionQA 阿里云授权与数据治理报告 v0.1

> 角色：阿里云授权与数据治理 Lead  
> 日期：2026-07-29  
> 状态：`DESIGN_COMPLETE / USER_AUTHORIZATION_PENDING / NO_RESOURCE_CREATED / NO_COST_INCURRED`

## 1. 职责、输入、输出和验收

### 职责

- 将 Cloudflare R2/D1 不适用于中国大陆用户的问题转换为阿里云 OSS/RDS PostgreSQL/计算运行时方案的授权要求；
- 设计人员身份、部署身份和运行身份分离的最小权限路径；
- 规定百炼、费用、日志、KMS、保留和撤销门禁；
- 不索要、读取、记录或创建任何 AccessKey、API Key、Token 或数据库口令；
- 不创建云资源，不产生费用。

### 输入

- 用户明确要求将 Cloudflare R2 替换为阿里云；
- `D:\VisionQA\agents\domestic_model_selection_report_v0.1.md`
- `D:\VisionQA\agents\domestic_model_data_governance_v0.1.md`
- `D:\VisionQA\agents\domestic_provider_decision_intake_report_v0.1.md`
- `D:\VisionQA\handoffs\DOMESTIC_PROVIDER_REVIEW_v0.1\provider_activation_decisions.csv`
- 阿里云 RAM、OSS、RDS PostgreSQL、百炼、费用与成本、KMS 官方文档。

### 输出

- `D:\VisionQA\handoffs\ALIYUN_AUTHORIZATION_v0.1\README.md`
- `D:\VisionQA\handoffs\ALIYUN_AUTHORIZATION_v0.1\authorization_decisions.csv`
- `D:\VisionQA\handoffs\ALIYUN_AUTHORIZATION_v0.1\ram_permission_matrix.csv`
- 本报告。

### 验收

- PASS：只使用阿里云官方文档作为外部依据；
- PASS：权限按 `staging`、北京地域、资源组和 OSS 前缀缩小；
- PASS：明确禁止 `AdministratorAccess` 与应用身份的产品级 FullAccess；
- PASS：优先服务角色 + STS，不要求用户在聊天提供 AccessKey；
- PASS：列出控制台点击顺序、预算、OSS 生命周期、RDS VPC/白名单、计算、百炼、日志和 KMS；
- PASS：明确预算告警不是费用硬上限；
- PASS：明确公开百炼隐私页没有提供精确保留/删除 SLA，证据不足则 `fetch=0`；
- PASS：包含撤销流程；
- PASS：未创建资源，未产生费用。

## 2. 关键架构决定

### 2.1 身份分层

```text
阿里云主账号
  └─ 只做实名认证、RAM、服务开通和财务治理

visionqa-staging-operator（人员 RAM 用户）
  └─ 控制台 + MFA，无 AccessKey；部署后降为只读

visionqa-staging-deployer（短时 RAM 角色）
  └─ 仅批准窗口内创建/更新 staging 资源

visionqa-staging-runtime（计算服务 RAM 角色）
  ├─ OSS staging/visionqa/* 必要对象操作
  ├─ 精确 KMS Secret 读取
  └─ 精确 SLS Logstore 写入
```

应用访问 RDS 不依赖 RAM 控制面授权，而依赖同 VPC、最窄白名单和数据库最小账号。应用调用百炼使用业务空间 API Key；该 Key 只通过 Secret 注入，调用范围由业务空间、模型范围和 IP 白名单约束。

### 2.2 凭证选择

- 人：控制台 + MFA；
- 阿里云运行时：服务角色 + STS；
- 本地：优先控制台/临时会话；永久 AK 仅作书面批准的例外；
- 百炼：独立 staging API Key，自定义固定模型和固定出口 IP，Canary 后禁用；
- 数据库：分离 migration/runtime 账号，密码存 Secret。

此方案符合 RAM 官方关于“避免主账号日常使用、程序优先临时凭证、永久 AccessKey 不得硬编码”的建议。

## 3. 阿里云替代 Cloudflare 的治理边界

| Cloudflare 组件 | 阿里云替代 | 治理重点 |
|---|---|---|
| R2 | OSS 北京私有 Bucket | 私有 ACL、前缀权限、300 秒签名 URL、生命周期 |
| D1 | RDS PostgreSQL 北京 | VPC 内网、无公网、最窄白名单、账号分离 |
| Worker/Pages API | 函数计算或容器 | 服务角色、固定出口、并发限制、Secret 注入 |
| Worker Secret | KMS/Secret Manager 或运行平台 Secret | 精确 Secret 授权、访问审计、轮换 |
| Logs | SLS + ActionTrail | 正文脱敏、30/90 天保留、控制面审计 |

迁移方向是可行的，但授权完成并不等于资源已部署。技术架构 Agent 仍需决定具体计算产品、RDS规格、网络拓扑和代码迁移量。

## 4. 百炼治理判断

官方文档支持以下事实：

- 百炼可按地域建立业务空间，官方建议按开发/测试/生产划分空间；
- 北京地域 API Key 可配置 IP 白名单和模型范围；
- API Key 默认可能允许 `0.0.0.0/0`，本项目必须删除；
- 百炼公开隐私说明称数据不会用于模型训练；
- 同一公开说明同时表示依法会存储模型与应用调用产生的数据。

公开材料不足以证明：

- 精确保留天数；
- 用户删除后完成删除的 SLA；
- 备份/容灾副本淘汰周期；
- 人工审核角色、触发条件与关闭能力；
- 请求和响应是否进入额外的产品日志或质量改进通道。

因此数据责任人必须以当前服务协议、合同条款或阿里云支持工单补证。补证前只完成代码和基础设施准备，不发送图片：

```text
NETWORK_REQUEST_COUNT = 0
QWEN_FETCH = DISABLED
```

## 5. 预算判断

费用与成本官方文档明确，预算可以通知，但不会限制实际资源使用。故使用双层控制：

1. 控制台：¥10 / ¥16 / ¥20 实际值告警，¥16 / ¥20 预测值告警；
2. 应用：5 张、15 请求、并发 1、¥20 预扣硬停；
3. 运营：Canary 完成后禁用百炼 API Key并停止计算资源。

这里的 ¥20 只覆盖模型 Canary 业务授权，不代表 OSS、RDS、计算、KMS、SLS 的总费用已经被批准。资源创建前必须单独给出预计日成本和预计月成本，由预算责任人二次确认。

## 6. 当前真正需要用户提供的授权

用户不需要把任何密钥发给项目。只需：

1. 确认自己是否为阿里云账号管理员、预算责任人和数据责任人；可以是一人兼任，但要明确声明；
2. 填写 `authorization_decisions.csv`；
3. 在控制台创建人员 RAM 用户和运行 RAM 角色，或授权其管理员完成；
4. 获取百炼保留/删除/备份/人工审核的非敏感证据引用；
5. 等技术 Agent 给出资源规格后，在控制台逐项点击创建并配置；
6. API Key 由管理员直接注入 Secret，项目代码和 Codex 只读取 Secret 名称，不接触值。

## 7. Go / No-Go

| 门 | 状态 |
|---|---|
| 阿里云替代方案治理设计 | PASS |
| 用户阿里云角色声明 | PENDING |
| RAM 最小权限授权 | PENDING |
| OSS/RDS/计算实际资源 | NOT_CREATED |
| 百炼独立空间和固定模型 | PENDING |
| 百炼数据保留/删除证据 | PENDING |
| ¥20 模型 Canary 批准 | 原决策为产品代理批准，仍需预算责任人明确身份 |
| 真实 Qwen 调用 | NO-GO |
| Production | NO-GO |

结论：**可以进入阿里云 staging 资源规格设计和控制台授权阶段；在管理员证明、预算和数据治理证据完整前，不得调用真实模型。**

## 8. 官方参考

- https://help.aliyun.com/zh/ram/product-overview/best-practices-for-identity-and-access-control
- https://help.aliyun.com/zh/ram/user-guide/grant-permissions-to-the-ram-user
- https://help.aliyun.com/zh/ram/user-guide/what-is-sts
- https://help.aliyun.com/zh/oss/user-guide/overview-75/
- https://help.aliyun.com/en/oss/user-guide/access-control-base-on-ram-policy
- https://help.aliyun.com/zh/oss/user-guide/overview-54/
- https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/security-and-compliance/
- https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/network-isolation
- https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/configure-an-ip-address-whitelist-for-an-apsaradb-rds-for-postgresql-instance-1
- https://help.aliyun.com/zh/model-studio/permission-management-overview
- https://help.aliyun.com/zh/model-studio/get-api-key/
- https://help.aliyun.com/zh/model-studio/privacy-notice
- https://help.aliyun.com/zh/user-center/user-guide/budget-management-1
- https://help.aliyun.com/zh/kms/key-management-service/user-guide/manage-and-use-ram-secrets

