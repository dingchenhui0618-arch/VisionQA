# VisionQA 阿里云国内 Staging 架构与迁移方案 v0.1

> 角色：阿里云全栈 Staging 架构 Lead  
> 核验日期：2026-07-29（Asia/Shanghai）  
> 状态：`ARCHITECTURE_READY / NO_RESOURCE_CREATED / NO_SECRET_REQUESTED`  
> 范围：以阿里云替代 Cloudflare D1/R2 staging，不修改现有 production，不创建云资源，不激活真实模型调用

## 1. 职责、输入、输出与验收标准

### 职责

- 读取现有 D1 schema、迁移、持久化 API、Cloudflare 阻断报告与 Qwen 治理边界；
- 只使用阿里云官方文档核验中国内地可用能力、地域、访问与计费约束；
- 设计可在中国大陆交付的最小 staging；
- 在 RDS PostgreSQL/MySQL、PolarDB、Tablestore 之间给出明确选型；
- 定义 OSS 私有图片、15 分钟签名 URL、FC API/异步任务、RAM/secret、日志、预算与迁移路径；
- 明确用户需要的阿里云授权，但不索取或记录任何密钥。

### 输入

- `agents/technical_architecture_lead_mvp_plan_v0.1.md`
- `agents/backend_platform_implementation_report_v0.1.md`
- `agents/staging_platform_devops_report_v0.1.md`
- `agents/cloudflare_staging_authorized_run_report_v0.1.md`
- `agents/domestic_provider_change_control_v0.1.md`
- `agents/domestic_adapter_architecture_v0.1.md`
- `agents/qwen_adapter_implementation_report_v0.1.md`
- `web/db/schema.ts`
- `web/drizzle/0000–0005`
- `web/lib/platform/repository.ts`
- `web/lib/visionqa/providers/*`

### 输出

- 本推荐架构、备选方案和迁移波次；
- 中国大陆地域、备案、网络、费用与安全约束；
- 阿里云授权/账户管理员最小操作清单；
- staging Definition of Done。

### 验收标准

- 资源名称、ID、Endpoint 只能来自以后真实阿里云响应，本文不虚构；
- OSS 对象保持私有，GET URL 固定 15 分钟；
- 数据库支持跨表原子写，且尽量复用当前表语义、契约和幂等设计；
- staging 与 production 资源、账号/资源组、数据库、Bucket、日志和预算隔离；
- Qwen 保持北京固定地域、固定模型、5 张/15 请求/20 元/并发 1 的 canary 门；
- 未获得审批和真实 staging DoD 前，模型网络调用必须为 0。

## 2. 结论先行

### 推荐架构

```text
[现有私有 Web 原型 / 本地 Staging UI]
                  |
          HTTPS + staging auth
                  |
       [FC 3.0 Web Function / API]
       Node.js 20 Custom Runtime
          |          |          |
          |          |          +--> [SLS 应用日志]
          |          |
          |          +--> [OSS 私有 Bucket, cn-beijing]
          |                 |- 预签名 PUT
          |                 |- 15 分钟预签名 GET
          |                 |- Block Public Access
          |                 |- SSE-OSS AES256
          |                 `- 14 天生命周期
          |
          +--> [RDS PostgreSQL Serverless, cn-beijing]
          |       |- 同 VPC 私网地址
          |       |- PostgreSQL transaction
          |       `- 完整 result_json + 追加式审计
          |
          `--> 提交任务
                 |
          [FC 3.0 Task Function]
          并发 1 / 异步任务 / 可查状态
                 |
                 +--> OSS 15 分钟签名 GET
                 +--> 百炼北京固定 Qwen 快照
                 `--> RDS 事务写结果与审计
```

### 服务映射

| Cloudflare 原设计 | 阿里云推荐 | 迁移原则 |
|---|---|---|
| R2 私有对象 | OSS 标准存储，华北 2（北京） | 保留对象键、哈希、留存和签名 URL 语义 |
| D1 / SQLite | RDS PostgreSQL Serverless 基础系列 | 保留 11 表业务语义；重写 SQL 方言和 D1 adapter |
| Worker / Sites API | FC 3.0 Web Function | API 与 UI 解耦，先迁后端 |
| 长任务/轮询 | FC Task Function 异步任务 | 入队即返回，任务状态可查询、可停止、可重试 |
| Cloudflare env/secrets | FC Function Role + staging 环境变量；KMS 为升级项 | OSS 不用长期 AK；Qwen key 不进代码、日志或聊天 |
| Cloudflare 日志 | SLS + ActionTrail | 应用日志与云资源操作审计分开 |

### CTO 决策

1. **Cloudflare R2/D1 路线停止，不再要求用户开通 R2。**
2. **阿里云 staging 统一使用 `cn-beijing`**，与已冻结的百炼北京 Provider 路线一致。
3. **数据库选 RDS PostgreSQL Serverless**；不选 Tablestore，不在 MVP 上 PolarDB。
4. **前端暂不强制迁移**。第一波只交付真实 OSS/RDS/FC 后端闭环；前端国内托管在真实可访问性或备案成为阻断时再迁移。
5. **production 继续 No-Go**。所有阿里云资源都应位于独立 staging 资源组，名称带 `visionqa-stg`，不得复用未来 production。

## 3. 现有实现迁移影响

### 3.1 可直接保留

- API 契约与稳定错误信封；
- `Idempotency-Key`、请求指纹和乐观锁；
- `evaluation-result v0.2/v0.3` 的完整 JSON 保存；
- 11 张表的业务边界；
- `PASS/REVIEW/REJECT`、四层 Skill、商业模板与 repair Prompt 的确定性规则；
- Qwen Adapter 的模型/地域/预算/审批组合门；
- 资产键建议：`tenant/{tenant_id}/assets/{asset_id}/{sha256}.{ext}`。

### 3.2 必须重写

当前实现直接依赖：

- `cloudflare:workers`
- `D1DatabaseLike.prepare()`
- `D1PreparedStatementLike.bind()`
- `D1DatabaseLike.batch()`
- `drizzle-orm/sqlite-core`

所以不能只把 `DATABASE_URL` 指向 RDS。迁移需要：

1. 新建 PostgreSQL 数据层接口；
2. 使用 `pg`/PostgreSQL driver 和 `drizzle-orm/pg-core`；
3. 将 D1 `batch()` 改为显式 `BEGIN / COMMIT / ROLLBACK`；
4. 将 `?` 占位符和 SQLite 方言改为 PostgreSQL 参数；
5. 将 `INTEGER AUTOINCREMENT` 改为 identity/bigserial；
6. 将时间字段从字符串逐步收敛为 `timestamptz`；
7. JSON 先保持 `text` 以降低变更量，稳定后再选择性升级 `jsonb`。

### 3.3 迁移最小化策略

- 不修改历史 D1 migrations `0000–0005`；它们作为 Cloudflare 历史基线保留。
- 为 PostgreSQL 单独建立 `db/pg/schema.ts` 与 `drizzle-pg/0000_visionqa_baseline.sql`。
- PostgreSQL baseline 一次性建立当前最终态，不逐条翻译六个 SQLite migration。
- 第一版保留物理列名 `r2_key` 也可以运行，但推荐 baseline 直接使用通用列：
  - `storage_provider = 'aliyun-oss'`
  - `object_key`
  - `storage_region = 'cn-beijing'`
- TypeScript 对外统一暴露 `objectKey`；旧 `r2Key` 只在 D1 compatibility adapter 中保留。

## 4. 数据库选型

| 方案 | 事务/审计适配 | 现有迁移代价 | Staging 成本/运维 | 结论 |
|---|---|---:|---|---|
| **RDS PostgreSQL Serverless** | 标准跨表 ACID 事务；`TEXT` 主键、唯一索引和完整 JSON 适配良好 | 中 | 可按 RCU 弹性；开发环境可 0.5 RCU 并自动启停 | **推荐** |
| RDS MySQL Serverless | 支持事务与自动启停 | 中偏高；现有大量 `TEXT` 主键/唯一索引需改长度，JSON/布尔/时间方言也需处理 | 与 PG 同类 | 备选 |
| PolarDB PostgreSQL/MySQL Serverless | 能满足事务、高可用和扩展 | 中到高；需引入集群/PCU 运维概念 | 对当前 5–50 张 canary 明显过度 | HOLD，业务增长后再评估 |
| Tablestore | 仅同一分区键内本地事务；Read Committed，60 秒，4 MB | **极高**；11 表关系、外键、跨实体原子改判需重建数据模型 | Serverless 但开发风险高 | **拒绝用于主审计库** |

### 为什么是 PostgreSQL

- 当前关键写入是 evaluation、override、recalibration log、audit event 多表追加，需要真正的跨表事务；
- Tablestore 官方本地事务要求所有写请求使用同一个分区键，无法自然覆盖当前跨表关系；
- PostgreSQL 允许 `TEXT` 主键和唯一约束，较 MySQL 更接近当前 schema 的语义；
- 完整评估结果未来可平滑使用 `jsonb` 查询，但 MVP 可以先用 `text` 保持无损和低迁移风险；
- RDS PostgreSQL Serverless 官方支持 0.5 RCU、开发环境自动启停，适合低频 staging。

## 5. OSS 私有图片设计

### 5.1 Bucket

- 地域：`cn-beijing`
- ACL：Private
- 启用 Bucket 级 Block Public Access
- 默认加密：SSE-OSS AES256
- 关闭公共读、公共写和永久 URL
- 关闭版本控制，或明确清理 current/noncurrent versions；MVP 为降低误留存，建议先不启用版本控制
- 标签：`project=visionqa`、`env=staging`、`data=authorized-commercial-seed`

### 5.2 对象键

```text
tenant/{tenant_id}/assets/{asset_id}/{sha256}.{ext}
```

数据库只保存 Bucket 逻辑名、region、object key、sha256、MIME、字节数、保留时间和软删除时间，不保存签名 URL。

### 5.3 上传

1. 客户端调用 `POST /api/assets/upload-intents`；
2. API 校验文件名、MIME、声明大小、租户和用途；
3. API 使用 FC Function Role 的临时 STS 凭证生成短期预签名 PUT；
4. 客户端直接上传 OSS；
5. 客户端调用 `POST /api/assets/{id}/complete`；
6. API/任务函数使用 OSS 内网 Endpoint 做 HEAD、读取并重新计算 SHA-256；
7. MIME、大小、哈希不一致则删除隔离对象并写失败审计；
8. 校验成功后才把资产标记为 `READY`。

浏览器直传需要配置**精确 origin** 的 OSS CORS，只允许 `PUT/HEAD` 和必要 headers，禁止 `*`。

### 5.4 读取

- UI 证据页和 Qwen 输入均由服务端按资产归属现场生成签名 GET；
- TTL 固定 `900s`（15 分钟），不可由客户端覆盖；
- 供应商调用结束后 URL 自动失效；
- API 不记录完整 query string；日志只记录 `asset_id/object_key/url_expiry`；
- FC 自身访问 OSS 使用同地域内网 Endpoint；
- Qwen 取图使用可访问的外网签名 URL，仍是对私有对象的限时授权，不等于公共读。

### 5.5 留存

- staging 默认 14 天；
- OSS Lifecycle 对 `tenant/*/assets/*` 当前对象 14 天后永久删除；
- 未完成上传/分片 1 天清理；
- 用户主动删除时，先追加审计和不可逆哈希，再删除对象；
- 删除 DoD 必须同时验证 OSS `404/NoSuchKey` 与数据库 `deleted_at`；
- 不启用版本控制时避免“删除标记存在但数据版本仍留存”的误判。

## 6. FC API 与异步执行

### 6.1 API Function

- FC 3.0 Web Function；
- Node.js 20 Custom Runtime（官方 Debian 12 环境提供 Node.js 20）；
- 将现有 Next API 业务逻辑提取为独立 service，避免把整个 Cloudflare/vinext runtime 原样搬迁；
- 同一 VPC 访问 RDS 私网地址和 OSS 内网 Endpoint；
- 不开放 RDS 公网地址；
- 设置请求超时、最大 body、并发、CORS 和稳定 request_id。

### 6.2 Task Function

- 使用 FC Task Function 和异步任务模式；
- API 创建 `evaluation_jobs` 后提交任务并立即返回 `202 + run_id`；
- 并发固定 1；
- 任务状态映射到现有 `QUEUED/RUNNING/SUCCEEDED/FAILED/RETRYING`；
- 仅网络错误、429、明确 5xx 自动重试；
- schema/gate/预算/审批失败不重试；
- 失败事件进入死信处理或人工重试队列；
- 每次调用写 provider request id、model snapshot、adapter/prompt/policy version、latency、cost。

FC 官方异步任务提供入队、运行、成功、失败、停止、过期和重试状态，以及状态查询、停止和重试能力，适合替代浏览器长连接。

### 6.3 Staging 认证

- 第一波后端验证不要求公开 Web：由受控 operator/CI 调用真实 staging API。
- 对浏览器开放前，FC HTTP Trigger 必须启用 JWT 鉴权，使用公钥 JWKS 验证，并把 `sub/role/tenant` claims 传入函数。
- 不允许把共享 Bearer token 硬编码进浏览器 bundle。
- 如果现有 Sites 身份无法签发或传递 JWT，则在“真实 UI 闭环”前必须选定一个授权服务；该项不阻塞数据库/OSS/模型 canary 的 CLI 闭环，但阻塞对外浏览器 staging。
- 上传者、评审者、管理员、只读审计员至少四个角色；人工改判需要 reviewer/admin。

## 7. RAM、密钥与数据安全

### 7.1 运行时凭证

- FC 配置独立 Function Role；
- OSS 访问使用 FC 自动注入的临时 STS 凭证，不创建主账号 AK，不在代码中保存 AK/SK；
- Function Role 只允许 staging Bucket 指定前缀的 `GetObject/PutObject/DeleteObject/HeadObject`；
- 资源创建/迁移由单独部署角色执行，运行时角色无 RDS/FC/OSS 资源创建删除权限；
- 人员使用 RAM 用户或 RAM 角色，开启 MFA，禁止主账号日常使用。

### 7.2 RDS 密码

- RDS 应用账号只拥有 `visionqa_staging` schema 的 DML 和必要 sequence 权限；
- 迁移账号与运行账号分离；
- 数据库只开放 VPC 私网，白名单仅放 FC vSwitch 网段，启用 SSL/TLS；
- 不把连接密码写入 Git、文档、聊天、CSV、构建日志或前端；
- staging 可由管理员在 FC 控制台安全注入并在 canary 后轮换。

### 7.3 Qwen API Key

真实调用仍需阿里云百炼北京 API Key。用户**需要提供阿里云授权，但不需要把 Key 发给项目组聊天**：

1. 阿里云管理员在北京地域开通百炼并确认业务空间；
2. 创建 staging 专用 API Key；
3. 权限选择 Custom，只允许固定 Qwen 模型；如采用固定 NAT 出口，再限制 FC 出口 IP；
4. 由管理员直接在 FC staging 配置中注入 `DASHSCOPE_API_KEY`；
5. 首次 canary 后重置/轮换；
6. 日志和错误处理必须对 `sk-* / sk-ws-* / st-*` 脱敏。

百炼官方建议将 API Key 配为环境变量而非硬编码，并支持模型/IP 范围限制。临时 API Key 仍需要永久 API Key 生成，因此不能消除服务端永久 Key 的安全存放问题。

### 7.4 KMS 决策

- **不建议为当前 staging 单独购买 KMS Secrets Manager**：阿里云官方当前中国内地软件 KMS 实例标价 2,499 元/月，远高于本 canary 预算。
- OSS 静态数据先用免费/低复杂度的 SSE-OSS AES256；
- 当进入真实客户 pilot、需要自动轮换或已有共享 KMS 实例时，再迁移 Qwen Key 和 RDS 凭据到 KMS Secrets Manager；
- 若公司已有 KMS 实例，则应直接复用隔离 secret，而不是继续使用环境变量。

## 8. 日志、审计与预算

### 8.1 应用日志

SLS 分为：

- `visionqa-stg-app`：API/Task 结构化日志；
- `visionqa-stg-security`：拒绝、鉴权失败、预算门和 Provider 降级；
- 数据库中的 `audit_events`：业务不可变事件。

日志字段：

```text
request_id, tenant_id, actor_id, batch_id, run_id, evaluation_id,
asset_id, provider_id, model_snapshot, status, error_code,
latency_ms, retry_count, input_bytes, cost_amount, cost_currency
```

禁止记录：

- API Key、Authorization header；
- OSS 签名 URL query；
- 原始图片内容；
- 完整 Provider 原始响应；
- RDS 连接串和密码。

### 8.2 云资源操作审计

- ActionTrail 默认可查询最近 90 天管控事件；
- staging 至少启用 FC、OSS、RDS、RAM 管控事件；
- OSS 数据事件需显式开启，若费用允许，只跟踪 staging Bucket；
- 需要长期审计时投递到独立 SLS Logstore，并设置留存。

### 8.3 预算

建议在资源创建前建立：

- 独立资源组/标签 `visionqa-staging`；
- 月度阿里云 staging 预算：初始建议 300 元，50%/80%/100% 告警；
- 百炼 canary 应用层硬门：20 元、5 张、15 请求、并发 1；
- FC 最大实例数 1，Task 并发 1；
- OSS 生命周期 14 天；
- RDS Serverless 0.5–2 RCU，启用自动启停；
- SLS 最短满足调试/审计的留存和索引范围。

注意：阿里云 Budget Management 的告警**不会自动停止资源**，而且预算/账单告警有 T+1/T+2 延迟，所以 20 元 Provider 门必须在应用代码和数据库原子计数器中实现，不能依赖账单告警。

### 8.4 粗略成本判断

- FC 按实际 CU 与公网出流量收费，低频 staging 通常不是主要成本；
- OSS 按存储、请求和公网下行计费，14 天小样本通常较低；
- SLS 按写入/存储/查询计费；
- RDS Serverless 是固定基线的主要来源：官方 PostgreSQL 示例给出 RCU 与至少 100 GB 存储的计费方式，实际北京售价必须以创建页为准；
- 按官方示例存储单价估算，100 GB 持续存储约为百元级/月，加上活跃 RCU；
- KMS Secrets Manager 2,499 元/月，不适合本阶段。

任何数字都不是采购报价；创建前必须由预算责任人在阿里云控制台确认实时价格。

## 9. 前端托管是否迁移

### Wave 1：不迁

先保留当前私有原型或本地 UI，原因：

- R2 不可用不等于现有 UI 必须立即搬迁；
- 当前真正阻断是资产、数据库和真实执行闭环；
- 当前前端由 vinext/Cloudflare runtime 构建，直接搬到 FC 不是零成本；
- 后端拆分后，UI 只需改 API base URL 和认证即可。

### 何时必须迁

出现任一条件时迁移：

- 中国大陆用户无法稳定访问现有站点；
- 需要公开客户测试；
- 跨云身份或 CORS 无法可靠闭环；
- 需要所有客户数据和日志都留在阿里云中国站。

### 推荐迁法

1. 先把 API routes 从 UI 中抽离；
2. UI 可静态化时：OSS 静态托管 + CDN；
3. 仍需 SSR 时：FC Web Function / Custom Runtime；
4. 中国内地正式绑定自定义域名时完成 ICP 备案；
5. FC 官方说明：中国内地 custom domain 必须完成并接入阿里云备案；中国香港或境外地域不需要备案，但本项目为了北京数据路径不建议改去香港规避。

Staging 可以先使用 FC 默认 Endpoint 做受控 API 验证；该默认域名不应冒充正式生产网站。

## 10. 数据流

### 10.1 上传

```text
用户选择图片
→ API 创建 asset=PENDING_UPLOAD
→ 生成预签名 PUT
→ 浏览器直传私有 OSS
→ complete API
→ FC 内网读取并重算 sha256/MIME/size
→ PostgreSQL 事务更新 READY + audit
```

### 10.2 评估

```text
POST /batches/{id}/runs + Idempotency-Key
→ PostgreSQL 事务冻结 provider/model/prompt/policy/template
→ FC Task 入队
→ worker 检查审批/预算/素材授权
→ 生成 15 分钟 OSS GET
→ 调用北京 Qwen 固定模型
→ Schema validator
→ deterministic Gate/score/repair Prompt
→ PostgreSQL 事务写 evaluation/result/audit/cost
→ UI 轮询 run/evaluation
```

### 10.3 人工改判

```text
Reviewer JWT
→ original decision + base version + Idempotency-Key
→ PostgreSQL SELECT ... FOR UPDATE
→ 同一事务追加 override + recalibration + audit
→ 不覆盖模型原始结果
```

## 11. 迁移波次

### Wave 0：账户与审批（不创建资源）

- 阿里云主账号/企业账号归属确认；
- 管理员、预算责任人、技术审查者身份确认；
- `cn-beijing` 数据路径与授权素材确认；
- 资源命名、资源组、月度预算和删除责任人批准；
- Qwen Custom 模型范围与 20 元 canary 批准。

### Wave 1：IaC 与双适配器

- 建立 `deploy/aliyun-staging` IaC，不包含 secret；
- 新增 PostgreSQL schema/baseline；
- 新增 `PersistenceRepository` 接口；
- 保留 `D1Repository` 做历史测试，新建 `PostgresRepository`；
- 新增 `ObjectStore` 接口与 `AliyunOssStore`；
- 将 `r2Key` 外部语义改为 `objectKey`；
- 本地 PostgreSQL/OSS mock 回归。

### Wave 2：隔离资源

- 创建 staging Resource Group、VPC/vSwitch/security group；
- 创建私有 OSS Bucket、BPA、AES256、CORS、Lifecycle；
- 创建 RDS PostgreSQL Serverless 基础系列；
- 创建 FC API 与 Task Function、Function Role、SLS；
- 只创建 staging，不接 production。

### Wave 3：真实持久化验收

- 空库应用 PostgreSQL baseline；
- seed 1 个模板、1 个批次、1 个资产；
- 验证幂等重放、同键异内容 409、事务故障零半写；
- 验证私有 OSS 未签名 403、签名 URL 有效和 15 分钟后失效；
- 验证删除和审计。

### Wave 4：Qwen canary

- 管理员直接注入 Key，项目文档和聊天不接触明文；
- 组合门齐全后只跑 5 张；
- 并发 1、最多 15 请求、20 元硬停；
- 产出真实 evaluation IDs、延迟、费用、结构合法率和人工复核；
- canary 结束后轮换 Key。

### Wave 5：UI 闭环

- 接入真实 API base URL；
- 配置 JWT；
- 修复硬编码演示数据、固定 Inspector 和本地 audit fallback；
- 桌面/移动上传→评估→证据→改判 E2E；
- 决定是否迁移前端到阿里云及是否启动备案。

## 12. 用户/阿里云管理员需要提供什么

### 现在需要的不是 Key，而是授权结果

用户只需确认或让阿里云管理员执行：

1. **账号**：确定使用哪个阿里云中国站账号及账单主体；
2. **地域**：同意全部 staging 资源放华北 2（北京）；
3. **费用**：允许创建按量/Serverless 资源，并批准月度 staging 预算；
4. **RAM**：创建部署角色和 FC 运行角色；不得提供主账号 AK；
5. **产品开通**：OSS、RDS PostgreSQL、FC、SLS、百炼、ActionTrail；
6. **百炼**：北京业务空间、固定 Qwen 模型、staging 专用 Custom API Key；
7. **Secret 注入**：管理员在 FC 控制台/受控流水线中注入，绝不发到聊天或 CSV；
8. **域名**：仅在需要中国内地正式域名时提供已备案域名；第一波不需要。

### 不需要提供

- 阿里云主账号密码；
- AccessKey ID/Secret；
- Qwen API Key 明文；
- RDS 密码；
- OSS 签名 URL；
- production 资源权限。

## 13. Staging Definition of Done

只有全部满足才能写 `ALIYUN_STAGING_READY`：

### 隔离与配置

- [ ] 所有资源 ID 来自真实阿里云响应；
- [ ] 独立 `visionqa-staging` 资源组、标签、VPC 和预算；
- [ ] production 资源未创建、未修改、不可写；
- [ ] FC、OSS、RDS、SLS、百炼均为 `cn-beijing`，特殊例外有书面证据。

### OSS

- [ ] Bucket private + Block Public Access；
- [ ] SSE-OSS AES256；
- [ ] 未签名 GET 返回 403；
- [ ] 签名 GET TTL 恰为 900 秒；
- [ ] 到期后读取失败；
- [ ] PUT 完成后服务端重算 hash/MIME/size；
- [ ] 14 天 lifecycle 与 1 天未完成分片清理；
- [ ] 删除后对象不可读且审计仍可追溯。

### PostgreSQL

- [ ] 空库 baseline 一次成功；
- [ ] 11 表、外键、唯一索引和必要查询索引存在；
- [ ] 完整 v0.2/v0.3 JSON 无损往返；
- [ ] batch/evaluation/override 同键同内容重放；
- [ ] 同键异内容 409；
- [ ] 故意制造事务中途失败后零半写；
- [ ] override/recalibration/audit 同事务追加；
- [ ] 公网 Endpoint 关闭，FC 仅通过 VPC + TLS 访问。

### FC/Provider

- [ ] API 同步返回 run_id，Task 异步可查状态；
- [ ] 并发 1，最多 15 请求，20 元硬停；
- [ ] 任一审批、数据、地域、模型或预算门缺失时 Provider fetch=0；
- [ ] 5 张授权 canary 有真实 evaluation ID；
- [ ] 固定北京 endpoint 和固定模型快照；
- [ ] Provider 输出通过 schema，Gate/score/prompt 由服务端确定性生成；
- [ ] API Key、签名 URL 和数据库密码未出现在 SLS、DB、构建或前端。

### 审计与 UI

- [ ] SLS 可用 request_id/run_id/evaluation_id 串联一次完整调用；
- [ ] ActionTrail 能查到资源创建/变更事件；
- [ ] 人工改判保留原始结果与 reviewer；
- [ ] 浏览器开放前完成 JWT，不把共享 secret 放入 bundle；
- [ ] UI 不再把本地 localStorage 冒充正式审计；
- [ ] 外部 QA 和审查角色签署 `GO_STAGING / NO_GO_PRODUCTION`。

## 14. 备选方案

### 备选 A：RDS MySQL Serverless

仅在组织已有 MySQL 运维标准、连接池或成本合同明显更优时使用。需要重新设计所有文本主键长度、唯一索引和 JSON/时间字段，不是当前最小迁移。

### 备选 B：PolarDB PostgreSQL Serverless

当真实 pilot 出现更高并发、读副本、高可用、快速扩缩或长期数据库规模时再评估。当前 5 张 canary 不足以证明需要集群数据库。

### 备选 C：ECS/容器服务

若 Next SSR/长连接或后台 worker 超出 FC 适配边界，可迁移到 SAE/ACK/ECS 容器。但会增加常驻成本和运维面，不作为最小 staging 首选。

### 明确拒绝：Tablestore 作为主审计库

Tablestore 适合大规模键值/宽表，但其本地事务受同一分区键限制。把现有 11 表和多表原子审计改造成单分区模型，会显著增加代码、验证和数据治理风险。

## 15. 官方核验依据

以下均为阿里云官方文档，核验日期 2026-07-29：

### OSS

- [OSS 预签名 URL，默认 15 分钟、范围 1 秒至 1 周](https://help.aliyun.com/zh/oss/developer-reference/presign-generate-presigned-url)
- [私有 Object 使用限时签名 URL](https://help.aliyun.com/en/oss/use-a-fixed-file-url-to-access-a-file)
- [OSS Block Public Access](https://help.aliyun.com/en/oss/user-guide/block-public-access)
- [OSS SSE-OSS AES256 / SSE-KMS](https://help.aliyun.com/en/oss/user-guide/data-encryption/)
- [OSS 北京地域公网与内网 Endpoint](https://help.aliyun.com/en/oss/user-guide/regions-and-endpoints)
- [预签名 URL 上传与 CORS](https://help.aliyun.com/en/oss/user-guide/upload-files-using-presigned-urls)
- [OSS 生命周期与版本清理](https://help.aliyun.com/zh/oss/user-guide/configure-lifecycle-rules-to-manage-object-versions)

### 数据库

- [RDS PostgreSQL Serverless：0.5 RCU、自动启停、开发环境建议](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/create-a-serverless-apsaradb-rds-for-postgresql-instance)
- [RDS PostgreSQL Serverless 计费](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/pricing-of-serverless-apsaradb-rds-for-sql-server-instances)
- [FC 访问 RDS PostgreSQL，同地域/VPC/vSwitch](https://help.aliyun.com/zh/functioncompute/access-the-rds-postgresql-database)
- [RDS PostgreSQL 私网、白名单与 SSL/TLS](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/connections-and-networks/)
- [RDS MySQL Serverless 自动伸缩/启停](https://help.aliyun.com/zh/rds/apsaradb-rds-for-mysql/rds-mysql-serverless)
- [PolarDB 产品与 Serverless 能力](https://help.aliyun.com/zh/polardb/)
- [Tablestore Node.js 本地事务限制](https://help.aliyun.com/en/tablestore/developer-reference/configure-local-transaction-by-nodejs-sdk)

### FC、身份与日志

- [FC Node.js 20 Custom Runtime](https://help.aliyun.com/en/functioncompute/fc/custom-runtime/)
- [FC 异步任务状态与查询](https://help.aliyun.com/zh/functioncompute/fc/asynchronous-task)
- [FC Task Function](https://help.aliyun.com/zh/functioncompute/fc/user-guide/creating-a-task-function/)
- [FC Function Role 与临时 STS 访问 OSS](https://help.aliyun.com/en/functioncompute/grant-function-compute-permissions-to-access-other-alibaba-cloud-services)
- [FC HTTP Trigger JWT](https://help.aliyun.com/zh/functioncompute/fc/user-guide/configure-jwt-authentication-for-an-http-trigger)
- [FC 与 SLS 日志集成](https://help.aliyun.com/zh/functioncompute/configure-the-logging-feature/)
- [RAM 最小权限与避免主账号 AK](https://help.aliyun.com/en/ram/use-cases/ensure-security-of-alibaba-cloud-resources)
- [ActionTrail 默认 90 天和投递 SLS/OSS](https://help.aliyun.com/zh/actiontrail/product-overview/what-is-actiontrail/)

### 百炼、KMS、费用与备案

- [百炼地域、北京接入和地域隔离](https://help.aliyun.com/zh/model-studio/regions/)
- [百炼 API Key、Custom 模型/IP 范围与环境变量](https://help.aliyun.com/zh/model-studio/get-api-key)
- [百炼临时 API Key 仍依赖永久 Key](https://help.aliyun.com/zh/model-studio/application-obtain-temporary-authentication-token)
- [KMS Secrets Manager 与密钥轮换](https://help.aliyun.com/en/kms/key-management-service/user-guide/secret-management-overview)
- [KMS 当前中国内地软件实例计费](https://help.aliyun.com/zh/kms/key-management-service/product-overview/kms-billing)
- [阿里云预算告警不自动停止资源](https://help.aliyun.com/zh/user-center/user-guide/budget-management-1)
- [FC 中国内地自定义域名 ICP 备案要求](https://help.aliyun.com/en/functioncompute/fc/configure-custom-domain-names)

## 16. 最终 Gate

```text
CLOUDFLARE_R2_PATH = SUPERSEDED_BY_ALIYUN
ALIYUN_ARCHITECTURE = READY
ALIYUN_RESOURCE_CREATION = NOT_RUN
ALIYUN_STAGING = NOT_READY
QWEN_LIVE_CALLS = 0
PRODUCTION = NO_GO
```

下一步应由 CTO 先收集“账号/地域/预算/RAM/产品开通”的授权结果，再调度阿里云 Staging 实施 Agent。任何 Agent 都不得要求用户在聊天中粘贴 AccessKey、API Key 或数据库密码。
