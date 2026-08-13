# VisionQA Cloudflare 隔离 Staging Operator 报告 v0.1

> Agent：Cloudflare 隔离 Staging Operator  
> 日期：2026-07-29  
> 外审决定：`STAGING-D1R2-001 = APPROVE`  
> 最终状态：**BLOCKED_BY_CLOUDFLARE_AUTHENTICATION**  
> Production 状态：**未修改**

## 1. 角色契约

### 职责

使用 Wrangler / Cloudflare 官方 CLI，在已有安全登录会话和足够权限的前提下，创建与 production 完全隔离的 staging D1、私有 R2，执行 migrations `0000–0005`，并通过 remote dev 验证批次、评估、改判和审计闭环。不得使用 Cloudflare CLI 部署网站，不得修改 Sites production 部署。

### 输入

- `D:\VisionQA\handoffs\MVP_EXTERNAL_REVIEW_v0.1\external_review_decisions.csv`
- `D:\VisionQA\agents\staging_platform_devops_report_v0.1.md`
- `D:\VisionQA\agents\backend_platform_implementation_report_v0.1.md`
- `D:\VisionQA\web\.openai\hosting.json`
- `D:\VisionQA\web\drizzle\0000_workable_squirrel_girl.sql`
- `D:\VisionQA\web\drizzle\0001_round_thunderbolts.sql`
- `D:\VisionQA\web\drizzle\0002_familiar_sentinels.sql`
- `D:\VisionQA\web\drizzle\0003_yellow_electro.sql`
- `D:\VisionQA\web\drizzle\0004_massive_iron_patriot.sql`
- `D:\VisionQA\web\drizzle\0005_shocking_scarlet_witch.sql`

### 预期输出

- 独立 staging D1：`visionqa-staging-d1-20260729`
- 独立 staging R2：`visionqa-staging-assets-20260729`
- staging 专用 Wrangler 配置
- D1 migration、remote dev、私有 R2 与审计闭环证据
- 资源 ID 记录和销毁 runbook

### 验收标准

1. 先执行只读 `wrangler whoami`，不读取或输出 token。
2. 未登录或权限不足时停止所有远程写操作。
3. 不修改 production Sites、production URL 或 `.openai/hosting.json`。
4. 资源必须明确使用 `visionqa-staging-*` 命名。
5. 只做 remote dev/preview 验证，不部署网站。
6. 真实 D1 应完成 `0000–0005`，私有 R2 和审计 API 应有可复现证据。
7. 外部资源创建后记录真实 ID 和删除命令，但不自动删除。

## 2. 安全门检查

执行：

```powershell
.\node_modules\.bin\wrangler.cmd whoami
```

Wrangler 版本：

```text
4.92.0
```

官方 CLI 返回：

```text
You are not authenticated. Please run `wrangler login`.
```

结论：当前机器没有可供本 Agent 使用的有效 Cloudflare 登录会话。按照验收标准 2，已立即停止所有远程写操作。

本次没有：

- 启动交互式登录；
- 读取、显示或保存 API token；
- 创建 D1；
- 创建 R2；
- 执行远程 migration；
- 启动 remote dev；
- 上传任何图片或业务数据；
- 部署 Worker、Pages 或 Sites 网站。

## 3. Production 未修改证据

`D:\VisionQA\web\.openai\hosting.json` 仍为：

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

没有调用 Sites 保存版本、部署、环境变量或访问控制写操作，也没有使用 Wrangler 部署网站。

## 4. 已准备的 staging 配置模板

已创建：

`D:\VisionQA\web\wrangler.staging.example.jsonc`

该文件只包含 staging 命名、绑定名和显式占位符：

- D1 binding：`DB`
- D1 名称：`visionqa-staging-d1-20260729`
- R2 binding：`ASSETS`
- R2 名称：`visionqa-staging-assets-20260729`
- Provider 默认关闭：`VISIONQA_PROVIDER_ENABLED=false`

它不是可执行的已绑定配置。`REPLACE_WITH_REAL_STAGING_D1_ID` 必须由 Wrangler 创建命令的真实响应替换，绝不能猜测或手填虚构 ID。不得把该配置复制到 `.openai/hosting.json`。

## 5. 解阻后的安全执行顺序

由账户持有人在本机终端执行浏览器 OAuth 登录：

```powershell
cd D:\VisionQA\web
.\node_modules\.bin\wrangler.cmd login
```

不要把 token、浏览器回调参数或登录截图发到聊天、CSV、代码或报告。登录完成后重新调度本 Agent；Agent 首先再次执行：

```powershell
.\node_modules\.bin\wrangler.cmd whoami
```

只有 `whoami` 确认账户和权限边界后，才执行以下远程写操作：

```powershell
.\node_modules\.bin\wrangler.cmd d1 create visionqa-staging-d1-20260729 --location apac
.\node_modules\.bin\wrangler.cmd r2 bucket create visionqa-staging-assets-20260729 --location apac
```

从命令真实响应记录 D1 UUID；将 `wrangler.staging.example.jsonc` 复制为 `wrangler.staging.jsonc`，只替换真实 D1 ID。随后：

```powershell
.\node_modules\.bin\wrangler.cmd d1 migrations apply visionqa-staging-d1-20260729 --remote --config .\wrangler.staging.jsonc
```

Wrangler 文档说明每个 migration 失败时会回滚当前 migration，并保留此前成功 migration；执行输出必须保存到 staging run 记录中。

完成迁移后才允许使用：

```powershell
.\node_modules\.bin\wrangler.cmd dev --remote --config .\wrangler.staging.jsonc
```

该命令只用于 remote dev 验证，不允许改为 `wrangler deploy`。

## 6. 登录后必须补齐的验证证据

以下项目本轮均为 `NOT RUN`：

| 验证项 | 当前状态 | 完成证据要求 |
|---|---|---|
| D1 创建 | NOT RUN | CLI 返回的真实 database UUID 与名称 |
| R2 创建 | NOT RUN | CLI 返回的真实 bucket 名称、私有状态 |
| migrations 0000–0005 | NOT RUN | Wrangler migration 清单与应用结果 |
| schema 验证 | NOT RUN | 11 张业务表和关键唯一索引查询 |
| 批次写入 | NOT RUN | 真实 batch ID、幂等重放和冲突响应 |
| 评估写入 | NOT RUN | 真实 evaluation ID 和完整 v0.3 结果读取 |
| 人工改判 | NOT RUN | override、校准日志、audit event 同批追加 |
| D1 零半写 | NOT RUN | 故意制造中途失败后四表均无部分写入 |
| R2 私有性 | NOT RUN | 无公共 URL；仅 staging binding 可读取 |
| R2 生命周期 | NOT RUN | 测试对象上传、读取、删除和不存在验证 |
| production 隔离 | PASS | production hosting 文件与部署未修改 |

审计 API 闭环只有在真实 remote dev 返回 evaluation ID，并从 D1 查询到相应 override、commercial recalibration log 与 audit event 后，才能标记 `VERIFIED`。

## 7. 资源记录模板

资源创建后必须用真实 CLI 响应补齐：

| 资源 | 名称 | 真实 ID | 创建时间 | 账户边界 |
|---|---|---|---|---|
| D1 | `visionqa-staging-d1-20260729` | 待创建 | 待创建 | 待 whoami 确认 |
| R2 | `visionqa-staging-assets-20260729` | R2 以 bucket 名称标识；待创建 | 待创建 | 待 whoami 确认 |

不得把 Cloudflare token、secret access key、OAuth 回调参数或签名 URL 写入该表。

## 8. 销毁 runbook

销毁是破坏性操作，本 Agent本轮只记录命令，**没有执行**。

完成审计导出、停止 remote dev、禁用 Provider 和确认不再需要 staging 数据后，由账户持有人明确批准，再按顺序执行：

```powershell
cd D:\VisionQA\web
.\node_modules\.bin\wrangler.cmd r2 bucket delete visionqa-staging-assets-20260729
.\node_modules\.bin\wrangler.cmd d1 delete visionqa-staging-d1-20260729
```

执行前必须先：

1. 再次运行 `wrangler whoami` 核对账户；
2. 列出资源并逐字核对 `visionqa-staging-*` 名称；
3. 确认 bucket 已清空或接受对象删除；
4. 保存需要保留的 migration、审计和成本证据；
5. 获得明确的删除批准。

绝不允许对 production 名称、未知 ID、通配符或推导出的资源执行删除。

## 9. 最终结论

外审业务批准有效，但 Cloudflare 技术执行仍被安全登录状态阻断：

```text
APPROVED_BUT_BLOCKED_BY_CLOUDFLARE_AUTHENTICATION
```

不能写成：

```text
STAGING_READY
D1_CREATED
R2_CREATED
MIGRATIONS_APPLIED
AUDIT_CLOSED_LOOP_VERIFIED
```

用户唯一需要完成的解阻动作是在本机执行 Wrangler 浏览器登录；无需、也不得在聊天中提供任何 secret。登录完成后重新调度本 Agent，才能继续远程创建和验证。
