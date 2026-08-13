# VisionQA 阿里云迁移独立 QA 报告 v0.1

> 角色：阿里云迁移独立 QA Lead  
> 最终复验：2026-07-29（Asia/Shanghai）  
> 约束：未联网、未创建云资源、未读取或使用任何真实 Key、未修改业务实现  
> 结论：`CODE_GO / REAL_ALIYUN_STAGING_NO_GO / PRODUCTION_NO_GO`

## 1. 职责、输入、输出与验收标准

### 职责

- 独立检查 OSS、PostgreSQL、FC 和 Qwen 的阿里云迁移边界；
- 亲自复跑专项、全量测试、Lint、Build 和攻击性负测；
- 验证错误地域、公网 OSS、跨租户、TTL、静态 AK、URL 泄露；
- 验证 PostgreSQL 幂等、并发版本锁、事务回滚和跨租户 ownership；
- 验证 FC 缺治理证据、Secret、私网路径或 live composition 时失败关闭；
- 区分代码可合并与真实阿里云 staging 可运行。

### 输入

- `agents/aliyun_oss_implementation_report_v0.1.md`
- `agents/postgres_backend_migration_report_v0.1.md`
- `agents/aliyun_fc_runtime_implementation_report_v0.1.md`
- `agents/aliyun_staging_architecture_v0.1.md`
- `agents/aliyun_authorization_governance_v0.1.md`
- `agents/qwen_adapter_qa_report_v0.1.md`
- `web/lib/storage/**`
- `web/lib/platform/postgres-*.ts`
- `web/db/pg/**`、`web/drizzle-pg/**`
- `web/aliyun-fc/**`
- `handoffs/ALIYUN_AUTHORIZATION_v0.2/**`

### 输出

- 本报告；
- 独立 PostgreSQL 攻击负测：
  `runs/aliyun_migration_qa_v0.1/pg-adversarial.test.ts`。

### 验收标准

- OSS 专项 9/9；
- PostgreSQL/D1/独立攻击组合 28/28；
- FC verify 11/11，并通过 Lint、Build、Smoke；
- 主仓库全量 52/52，Lint、Build 通过；
- P0/P1 为 0 个未关闭；
- 不以本地 Mock 或 pg-mem 冒充真实 OSS/RDS/FC/Qwen staging。

## 2. 最终自动化证据

### 2.1 OSS

命令：

```powershell
cd D:\VisionQA\web
node --experimental-strip-types --test tests/object-storage.test.ts
```

结果：`9/9 PASS`。

亲自确认：

- 错误地域、公网 Bucket、错误 Endpoint、非 Role 模式、静态 AK 均在
  Client 调用前拒绝；
- live class/config 不导出，唯一 factory 固定北京、私有、Role/STS、
  14 天对象和 1 天未完成 Multipart；
- 999 天生命周期覆盖失败；
- tenant-b pathname、编码路径和路由型 query 不能替换 tenant-a object key；
- TTL 301 秒、路径穿越和跨租户 object key 失败；
- HMAC 信封绑定可信 HEAD SHA-256、byte size 和 MIME；
- 审计不包含签名 URL 或凭据。

额外攻击命令确认：

```text
OSS_CONSTRUCTOR_EXPORTED=false
错误地域=REJECT CONFIGURATION
公网配置=REJECT CONFIGURATION
静态AK=REJECT CONFIGURATION
NETWORK_CALLS=0
```

### 2.2 PostgreSQL

命令：

```powershell
cd D:\VisionQA\web
node --experimental-strip-types --test `
  tests/platform-persistence.test.ts `
  tests/postgres-persistence.test.ts `
  D:\VisionQA\runs\aliyun_migration_qa_v0.1\pg-adversarial.test.ts
```

结果：`28/28 PASS`。

覆盖：

- 空库 baseline 与 11 张表；
- v0.2/v0.3 无损结果和 SHA-256；
- 同键同内容重放、同键异内容冲突；
- 不同幂等键竞争同一 baseVersion，仅一个成功；
- 成功改判 `result_version` 原子递增；
- audit 末端故障时 override、recalibration、版本、job state 全部回滚；
- asset ID 和 run ID 跨租户复用均失败；
- tenant 范围外 evaluation 不可读；
- `aliyun-oss` 历史值迁移为 canonical `aliyun_oss`；
- FC repository port 同时提供 `persistEvaluation` 和 `recordJobState`；
- job 状态重放、非法转换、retry attempt 和审计原子性。

独立攻击负测曾在修复前成功复现跨租户 asset 引用；修复后同一用例返回
`ASSET_OWNERSHIP_CONFLICT`，相同 run ID 的跨租户攻击返回
`RUN_OWNERSHIP_CONFLICT`。

### 2.3 FC

命令：

```powershell
cd D:\VisionQA\web\aliyun-fc
npm run verify
```

结果：

```text
FC tests   11/11 PASS
FC lint    PASS
FC build   PASS
FC smoke   PASS
network providers = 0
```

攻击性复验：

- `cn-shanghai`：`CONFIGURATION`；
- 任意阿里云静态 AK/STS 环境变量，即使 fixture：
  `STATIC_ACCESS_KEY_FORBIDDEN`；
- 缺任一治理证据：`GOVERNANCE_EVIDENCE_MISSING`；
- private URL、嵌套 URL 和混合大小写 URL key：整值 `[REDACTED]`，
  bucket、tenant、object path 和 query 均不保留；
- PostgreSQL provider-neutral adapter 可通过 FC readiness；
- 即使六项治理门和测试 Secret 全部伪置为真，默认 `web.mjs` 仍以
  exit code 1 拒绝 live，错误明确为 live composition root 尚未提供；
- fixture smoke 未调用 OSS、RDS、Qwen 或任何付费网络。

### 2.4 主仓库

```powershell
cd D:\VisionQA\web
npm test
npm run lint
npm run build
```

结果：

```text
full tests 52/52 PASS
lint       PASS
build      PASS
```

凭证形态静态扫描未发现真实 AK、Qwen Key 或已提交签名 URL。命中的
`X-DashScope-Request-Id` 是请求 ID header，不是凭证。

## 3. 缺陷分级与关闭状态

### P0

无未关闭 P0。

PostgreSQL 改判版本 CAS 已通过并发及事务故障复验，不再出现两个成功的
同 baseVersion 改判或半写。

### P1

无未关闭 P1。下列问题均在本轮发现、退回并重新独立复验关闭：

| ID | 问题 | 最终状态 |
|---|---|---|
| P1-OSS-01 | exported constructor 可接受 999 天生命周期 | CLOSED：构造器关闭，factory 固定 14/1 |
| P1-OSS-02 | signer 同 host 跨租户 pathname 可被接受 | CLOSED：canonical pathname 精确绑定 object key |
| P1-PG-01 | `aliyun-oss` / `aliyun_oss` provider ID 分裂 | CLOSED：新写及默认统一 `aliyun_oss`，提供 forward migration |
| P1-PG-02 | FC 缺 `recordJobState` PostgreSQL port | CLOSED：provider-neutral adapter 与状态机已提供 |
| P1-PG-03 | asset/run 全局 PK 可形成跨租户引用 | CLOSED：ownership 锁定与稳定冲突码 |
| P1-FC-01 | live 配置曾要求阿里云静态 AK | CLOSED：任一静态 AK/STS 环境变量全模式拒绝 |
| P1-FC-02 | 日志只遮 signature，仍泄露 OSS path | CLOSED：URL/URI 与检测到的私有 URL 整值脱敏 |
| P1-GOV-01 | OSS 生命周期授权曾为“7 天或 30 天” | CLOSED：v0.2 唯一 14 天对象 + 1 天 Multipart；v0.1 标记 SUPERSEDED |

### P2 / 外部未完成项

这些不是本地代码缺陷，但都阻塞真实 staging：

1. 未接入正式 OSS Node SDK transport，未验证真实 Bucket、匿名访问 403、
   STS、签名 URL 过期和云端 lifecycle；
2. PostgreSQL 只在 pg-mem 验收，未验证真实北京 RDS 的 VPC/TLS、连接池、
   行锁、备份和故障注入；
3. FC live composition root 故意缺席；目前只有 fixture composition 和
   PostgreSQL source-level readiness；
4. 未创建 FC、OSS、RDS、VPC、SLS、RAM Role、Secret Manager 或百炼空间；
5. Qwen 治理 artifact、账户地域、模型可用性、数据保留/删除/人工审核和
   预算责任人证据仍未完成 owner 授权；
6. 未产生真实 evaluation ID、provider request ID、usage、账单或审计闭环；
7. 未执行 5 张、15 请求、并发 1、20 元硬停 canary；
8. Production 从未被本迁移授权。

## 4. 三端组合判断

```text
OSS ObjectStorage port
        |
        v
FC runtime service
        |
        +--> PostgreSQL provider-neutral port
        |
        +--> governed Qwen port
```

- 接口形状：**可组合**；
- OSS 安全 port：**本地通过**；
- PostgreSQL FC port：**本地通过**；
- Qwen governed adapter：**本地 fail-closed 通过**；
- 完整 live composition root：**不存在，故不能启动真实 staging**；
- 默认 live 启动：**正确失败关闭**。

因此“接口可组合”不等于“阿里云 staging 已就绪”。

## 5. 授权包核对

当前唯一有效包：

`D:\VisionQA\handoffs\ALIYUN_AUTHORIZATION_v0.2`

核验结果：

- 12 行决定；
- `ALIYUN-OSS-001` 唯一固定当前对象 14 天永久删除；
- 未完成 Multipart Upload 唯一固定 1 天清理；
- 不允许选择其他保留期；
- v0.1 有 `SUPERSEDED.md` 和
  `authorization_decisions.csv.SUPERSEDED`；
- v0.2 的 12 项 `owner_decision` 当前均为空，状态均为 `PENDING`。

用户/授权责任人下一步不能发送任何 Key，只需：

1. 明确阿里云账号管理员、预算责任人、数据责任人、安全责任人和技术负责人
   分别是谁；一人可兼任，但必须实名填入；
2. 填写 v0.2 `authorization_decisions.csv` 的
   `owner_decision/owner_name/decision_date/evidence_reference`；
3. Compute 项选择 `FUNCTION_COMPUTE`；
4. OSS 项只批准北京私有 Bucket、`staging/visionqa/*`、14 天对象、
   1 天 Multipart、Block Public Access、SSE-OSS；
5. RDS 项只批准北京 VPC 内网 PostgreSQL、无公网、无
   `0.0.0.0/0`；
6. 百炼、预算、数据和日志项必须有非敏感控制台/合同/工单证据引用；
7. API Key、RDS 密码、HMAC Secret 只能由管理员以后写入受控
   Secret Manager，不能写入 CSV、聊天、仓库或截图。

## 6. 最终 Go / No-Go

| 范围 | 结论 | 原因 |
|---|---|---|
| 本地 fixture 开发 | **GO** | 默认零网络，52/52 |
| 合并阿里云迁移代码 | **GO** | P0/P1 均关闭，攻击负测通过 |
| 创建资源前的授权与规格确认 | **GO** | v0.2 授权包可用 |
| 真实阿里云 staging 激活 | **NO-GO** | 12 项 owner 授权、资源、SDK transport、live composition 和云端 smoke 均未完成 |
| 真实 Qwen canary | **NO-GO** | staging、数据、预算、账户证据与真实审计闭环未完成 |
| Production | **NO-GO** | 未授权且无真实端到端证据 |

最终结论：

```text
CODE = GO
LOCAL_FIXTURE = GO
ALIYUN_AUTHORIZATION_PREPARATION = GO
REAL_ALIYUN_STAGING = NO-GO
QWEN_LIVE_CANARY = NO-GO
PRODUCTION = NO-GO
```

