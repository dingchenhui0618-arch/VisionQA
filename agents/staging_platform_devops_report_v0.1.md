# VisionQA Staging Platform / DevOps 实施报告 v0.1

> Agent：Staging Platform / DevOps Agent  
> 日期：2026-07-29  
> 外审决定：`STAGING-D1R2-001 = APPROVE`  
> 最终状态：**安全阻断（BLOCKED_BY_HOSTING_CAPABILITY）**  
> 生产状态：**未修改**

## 1. 职责、输入、输出和验收标准

### 职责

在不触碰现有 production 部署和数据的前提下，建立真正隔离的 staging D1/R2，应用 migrations `0000–0005`，验证批次、评估、人工改判与审计闭环，并给出回滚边界。

### 输入

- `D:\VisionQA\handoffs\MVP_EXTERNAL_REVIEW_v0.1\external_review_decisions.csv`
- `D:\VisionQA\web\.openai\hosting.json`
- `D:\VisionQA\agents\backend_platform_implementation_report_v0.1.md`
- `D:\VisionQA\web\drizzle\0000_workable_squirrel_girl.sql`
- `D:\VisionQA\web\drizzle\0001_round_thunderbolts.sql`
- `D:\VisionQA\web\drizzle\0002_familiar_sentinels.sql`
- `D:\VisionQA\web\drizzle\0003_yellow_electro.sql`
- `D:\VisionQA\web\drizzle\0004_massive_iron_patriot.sql`
- `D:\VisionQA\web\drizzle\0005_shocking_scarlet_witch.sql`
- Sites `sites-building`、`sites-hosting` 与 persistence/storage 规则

### 输出

- Sites 能力与现有 production 状态核对证据
- `0000–0005` 离线空库迁移结果
- 平台持久化契约/负测结果
- 未执行项、阻断原因、回滚说明和下一步所需权限

### 验收标准结果

| 验收项 | 结果 | 说明 |
|---|---|---|
| 不修改 production 部署或生产数据 | **PASS** | 未保存版本、未部署、未更新环境变量、未更新访问策略、未写 D1/R2 |
| D1/R2 ID 必须来自真实工具响应 | **PASS** | 工具没有返回 D1/R2 资源 ID，因此报告中不虚构任何 ID |
| Sites 只支持 production 时停止 | **PASS** | 发现当前可用部署工具明确规定所有部署 URL 均为 production，已停止 |
| 资产私有、短期 URL/生命周期明确 | **NOT RUN** | 没有隔离 R2，未上传任何资产；不得用 production bucket 验证 |
| secret 不进入代码或文档 | **PASS** | 未读取、写入或记录模型/API secret |
| staging 成功前不激活真实模型 | **PASS** | 未配置 Provider，未执行任何真实模型调用 |

## 2. Sites 能力核对

### 2.1 现有站点

读取 `.openai/hosting.json` 后复用了其中真实 `project_id`，没有调用 `create_site`。

Sites `get_site` 返回的安全相关状态：

- 站点状态：`active`
- 当前线上地址：现有 production URL 保持不变
- `current_preview_url = null`
- 访问模式：`custom`
- allowlist：仅当前所有者，无群组
- 最新已保存版本：`5`

Sites `list_site_versions` 返回：

- 最新版本号：`5`
- 最新版本 source commit：`8ab868fd3cbf31e2436d3d57be1972e58cd9ebbc`
- 本次执行没有新增版本

报告不记录 Sites 返回的任何访问令牌或短期凭据。

### 2.2 隔离 staging 能力结论

本次会话可用的 Sites 正式工具覆盖：

- 读取站点与访问配置
- 读取/更新 production 环境变量
- 保存站点版本
- 部署已保存版本
- 查询 production 部署状态

没有发现可用于以下操作的正式工具：

- 创建独立 staging/preview 环境
- 为 staging 单独创建或绑定 D1
- 为 staging 单独创建或绑定 R2
- 在不部署 production 的情况下应用 staging D1 migration
- 为 staging R2 配置私有 bucket 生命周期

Sites 工具说明还明确规定：**每一个 Sites deployment URL 都是 production URL**。因此，下列替代方案均被拒绝：

1. 把现有 production 项目更新 D1/R2 后称作 staging；
2. 部署一个名为 “staging” 的 Sites 站点，然后曲解为非生产 preview；
3. 为了通过验收手工填写或推导 Cloudflare D1/R2 ID；
4. 使用本地或浏览器存储伪装在线持久化闭环。

这符合外审条件“若 Sites 只支持 production 或权限不足，立即停止，不得曲解为 staging”。

## 3. Production 未修改证据

执行前后均未调用以下写操作：

- `save_site_version`
- `deploy_private_site_version`
- `deploy_site_version`
- `update_environment_variables`
- 任何访问策略写操作

本地 production hosting 声明保持：

```json
{
  "project_id": "appgprj_6a6846e0169881918b04225a2e22e3b3",
  "d1": null,
  "r2": null
}
```

该文件 SHA-256：

```text
EBF24F54F6A190C8DEAF99E50AD787A8B6AC8529D24F71978723E32D6E810104
```

本次没有修改 `.openai/hosting.json`，没有向现有线上环境增加 D1/R2 绑定。

## 4. 可完成的安全验证

### 4.1 migrations `0000–0005` 离线空库验证

使用 Node 内存 SQLite，按文件顺序逐条执行全部 migration：

```text
APPLIED 0000_workable_squirrel_girl.sql
APPLIED 0001_round_thunderbolts.sql
APPLIED 0002_familiar_sentinels.sql
APPLIED 0003_yellow_electro.sql
APPLIED 0004_massive_iron_patriot.sql
APPLIED 0005_shocking_scarlet_witch.sql
TABLES 11
IDEMPOTENCY_INDEXES 4
BATCH_REQUEST_SHA256 PRESENT
```

生成的 11 张业务表：

```text
asset_evaluations
assets
audit_events
batch_assets
batches
commercial_profiles
commercial_recalibration_logs
commercial_templates
evaluation_jobs
evaluation_runs
human_overrides
```

结论：迁移在 SQLite 兼容空库中可顺序执行，但这不等于真实 D1 staging migration 已通过。

### 4.2 持久化契约与负测

执行 `npm run test:contracts`：

- JSON Schema 示例：2/2 通过
- 契约规则与平台持久化：17/17 通过
- 总计：19/19 通过

覆盖：

- 不完整评估拒绝
- v0.2 结果无损保存
- v0.3 结果与 execution 元数据保存
- 批次同键同内容幂等重放
- 批次同键不同内容冲突
- 并发竞争后重新比较 request fingerprint
- 改判、校准日志和审计同批追加
- 改判同键同内容重放
- 改判同键不同内容冲突
- 并发竞争后重新比较完整改判内容

这些是内存 D1 mock/契约证据，不能替代真实 D1 原子性故障注入。

## 5. 未执行的 staging 验收

由于没有真正隔离的 staging D1/R2，以下项目被安全阻断：

- 在真实 D1 上应用 `0000–0005`
- 真实 D1 中途失败/零半写故障注入
- 真实 evaluation ID 的批次→评估→改判→审计闭环
- 私有 R2 上传、签名短期读取、过期和删除
- R2 生命周期/缓存清理验证
- staging API 鉴权负测
- staging 回滚演练
- OpenAI Provider 激活

这些项目不得在现有 production 项目上补做。

## 6. 回滚说明

### 本次回滚

本次没有创建云资源、没有修改 production、没有保存或部署新版本，因此**无需云端回滚**。

### 将来获得隔离能力后的回滚顺序

1. 禁用 staging 写入口和 Provider 调用；
2. 保存 D1/R2 资源 ID、migration 版本和审计导出；
3. 删除 staging 短期 R2 对象并验证对象不存在；
4. 回滚应用绑定到上一份 staging 版本；
5. D1 schema 采用前向修复 migration，不对含数据数据库执行破坏性 down migration；
6. 确认 production project、版本、环境 revision 和访问策略全程未变化；
7. 最后才释放隔离 staging 资源。

## 7. 解阻条件

CTO 需要提供以下任一条真实路径，之后再重新调度本 Agent：

### 路径 A：Sites 提供正式 preview/staging 资源能力

必须能从工具真实返回：

- 隔离 staging project/environment ID
- staging D1 ID
- staging R2 ID
- staging migration 执行状态
- 非 production 的 preview/staging URL 或等价隔离证明

### 路径 B：授权使用独立 Cloudflare staging 账户/项目

需要通过 secret 管理提供非 production Cloudflare 凭据，并明确：

- account/project 边界
- staging D1/R2 命名和区域
- R2 私有访问及生命周期策略
- 预算和删除权限
- production 资源不可见或不可写的最小权限

不得在聊天、CSV、代码或本报告中粘贴 token。

## 8. 最终结论

`STAGING-D1R2-001` 的业务批准已经有效，但**技术执行尚未完成**。当前正式状态应为：

```text
APPROVED_BUT_BLOCKED_BY_HOSTING_CAPABILITY
```

不能写成：

```text
STAGING_READY
D1_BOUND
R2_BOUND
AUDIT_CLOSED_LOOP_VERIFIED
```

在获得真正隔离的 staging 资源能力之前，生产继续保持原状，真实模型 Provider 必须继续关闭。
