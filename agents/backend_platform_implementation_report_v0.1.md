# VisionQA MVP 后端数据平台实现报告 v0.1

> Agent：后端数据平台实现 Agent  
> 日期：2026-07-29  
> 结论：代码实现与本地验证完成；生产 D1/R2 未创建、未绑定，仍需外部审查和 staging 集成验证

## 1. 职责、输入、输出、验收

### 职责

实现可供模型执行链和前端工作台共用的最小资产、批次、评估、人工改判和审计持久化闭环；保证完整结果可恢复、写入幂等、失败不误报成功。

### 输入

- `agents/technical_architecture_lead_mvp_plan_v0.1.md`
- `agents/product_program_lead_mvp_charter_v0.1.md`
- `contracts/evaluation-result-v0.2.schema.json`
- `contracts/evaluation-result-v0.3.schema.json`
- `contracts/commercial-template-v0.2.schema.json`
- 现有 `web/app/api/overrides`
- 现有 `web/db/schema.ts` 与 Drizzle migrations
- 当前 `.openai/hosting.json`

### 输出

- 追加式 D1 schema/migrations；
- 批次、完整评估、评估读取、追加式人工改判 API；
- D1 原子批处理数据访问层；
- v0.3 运行时校验接入与历史 v0.2 兼容；
- 幂等重放、乐观锁、租户边界和稳定错误响应；
- 持久化单测、migration 空库验证；
- 部署、授权、保留、删除和审计边界文档。

### 验收标准状态

| 验收项 | 状态 | 证据 |
|---|---|---|
| 完整评估结果可无损保存 | 通过（代码/单测） | `result_json` + `result_sha256`；v0.2/v0.3 深度相等测试 |
| override 有幂等键且避免半写 | 通过（代码/单测） | 唯一索引、版本锁、单次 D1 `batch()` 写四表 |
| D1 未绑定不误报生产成功 | 通过 | `503 AUDIT_DB_UNAVAILABLE`；旧原型接口 `persisted: none` |
| 授权/删除/审计边界文档化 | 通过 | `docs/11_MVP后端持久化与治理边界_v0.1.md` |
| npm test/lint/build | 通过 | test 31 项总计通过；lint/build 通过 |
| 不创建/绑定外部生产数据库 | 通过 | `.openai/hosting.json` 仍为 `d1: null`、`r2: null` |

## 2. 实现范围

### 2.1 数据结构与 migration

新增或补齐：

- `batches`
- `batch_assets`
- `evaluation_jobs`
- `assets` 的 tenant/hash/MIME/size/R2/保留/删除字段
- `evaluation_runs` 的 batch/provider/adapter/taxonomy/threshold/status/request/idempotency/时间字段
- `asset_evaluations` 的完整 `result_json`、哈希、schema/version、模板、模型/Gate、延迟/成本字段
- `human_overrides` 的 tenant/request/idempotency/base evaluation version
- `audit_events` 的 request/tenant 与查询索引
- 批次、评估、job、override 幂等唯一索引
- `batches.request_sha256`，用于验证同一幂等键对应同一规范化请求

追加 migration：

- `web/drizzle/0002_familiar_sentinels.sql`
- `web/drizzle/0003_yellow_electro.sql`
- `web/drizzle/0004_massive_iron_patriot.sql`
- `web/drizzle/0005_shocking_scarlet_witch.sql`

没有修改已发布的 `0000/0001`。

### 2.2 API

| 路径 | 行为 |
|---|---|
| `POST /api/batches` | 认证、幂等、资产租户/哈希检查；原子写批次、资产关联和审计 |
| `POST /api/evaluations` | 校验 v0.3（兼容 v0.2）；无损保存完整结果和执行快照 |
| `GET /api/evaluations/{id}` | 按租户读取完整结果、版本和按时间追加的人工改判 |
| `POST /api/evaluations/{id}/overrides` | 幂等、原结论检查、乐观锁；原子写 override、校准日志和审计 |
| `POST /api/overrides` | 旧原型接口不再伪装生产审计，明确返回不持久化 |

所有正式写 API 强制 `Idempotency-Key`，错误响应为稳定机器码、可读信息、`request_id` 和 `retryable`。

### 2.3 数据访问一致性

`lib/platform/repository.ts` 使用 D1 `batch()` 把一个业务操作的多表写入一次提交。写入前检查幂等重放；并发竞争由唯一索引兜底，失败后只在找到相同记录时返回重放成功。

人工改判是追加事件，不更新或覆盖模型原始评估。`baseEvaluationVersion` 与 `originalDecision` 不一致时返回冲突。

### 2.4 Cloudflare 运行时隔离

初次集成时发现 `cloudflare:workers` 被静态带入 Node SSR，导致 `ERR_UNSUPPORTED_ESM_URL_SCHEME`。现已把 Cloudflare 环境改为仅在 API 实际访问数据库时动态加载。修复后：

- 页面 Node SSR 测试恢复；
- API route 仍可在 Cloudflare 运行时取得 `DB`；
- D1 未绑定时仍返回明确 503。

## 3. 契约兼容

契约 Agent 已将 MVP 新执行链路升级为 `evaluation-result v0.3`。本实现没有修改其契约文件，而是：

- v0.3 `result_json` 原样无损保存；
- v0.3 通过独立 `execution` 信封携带 run、模型快照、策略版本、资产哈希、锁定项、延迟与成本；
- 历史 v0.2 仍可从其内嵌 `run/input/performance` 自动提取执行元数据；
- 不允许通过只修改 `schema_version` 假装迁移。

外部审查需要确认“评估决策契约 + 独立执行元数据”是否作为正式 Adapter → 平台传输边界。

## 4. 验证结果

### 4.1 migration

使用 Node SQLite 内存空库依序执行 `0000`–`0005`：

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

Wrangler 本地 D1 验证未执行，因为项目没有 D1 binding 配置；Agent 没有为通过测试而虚构资源 ID。

### 4.2 自动化

最终验证：

- `npm test`：通过
  - 页面/原型回归：5/5
  - JSON Schema 示例：2/2
  - 规则/契约测试：6/6
  - 模型 Adapter 测试：5/5
  - 平台持久化测试：11/11
  - UI Adapter 测试：2/2
- `npm run lint`：通过
- `npm run build`：通过

平台持久化测试覆盖：

- 不完整评估拒绝；
- v0.2 完整 JSON 无损保存；
- 评估幂等重放不产生第二批写入；
- v0.3 + 独立 execution 元数据通过；
- override、校准日志、审计以一个批次追加。
- batch 同键同内容可重放、同键不同内容冲突；
- batch 并发唯一键竞争后仍比较请求指纹；
- override 同键同内容可重放、同键不同内容冲突；
- override 并发唯一键竞争后仍复核完整内容。

### 4.3 QA P1 修复记录

QA 指出的两项问题均已修复：

1. `createBatch` 不再只凭 `(tenant_id, idempotency_key)` 静默重放，而是保存并比较规范化请求的 SHA-256。首次查询和并发冲突后的 raced 查询使用同一比较逻辑。
2. `persistOverride` 将内容相等判断抽为同一函数；首次查询和 D1 batch 竞争失败后的 raced 查询都会比较 evaluation、原/人工结论、原因、证据、actor 与 base version。

不同内容复用同一键始终抛出 `IDEMPOTENCY_KEY_REUSED`，由 API 映射为 HTTP 409。

## 5. 没有实施的事项

- 没有创建或绑定 staging/pilot/production D1。
- 没有创建或绑定 R2。
- 没有读取、索取或写入任何模型/Cloudflare 密钥。
- 没有实现公共上传 URL 或直传 R2。
- 没有实现生产删除/导出入口。
- 没有把正式 API 接入现有演示 UI。
- 没有声明数据库闭环已经在线部署。

## 6. 需要 CTO 或外部审查确认的风险

### Blocker / 必须在 staging Gate 前确认

1. **真实 D1 原子性尚未集成验证**  
   单测证明代码只发一个 `batch()`，空库 migration 已验证，但尚未在真实 staging D1 故意制造中途失败并确认零半写。

2. **D1/R2 仍未绑定**  
   当前线上环境只能明确失败或原型本地降级，不具备跨浏览器生产审计。

3. **正式 v0.3 execution 信封需要接口评审**  
   契约 v0.3 不包含 run/input/performance。本实现用独立 execution 保存这些可追溯字段，需 AI Lead、契约 Lead 和测试 Lead 共同冻结字段。

4. **认证只有单租户身份，没有角色授权**  
   当前固定内部租户可以阻止请求体伪造 tenant，但不能区分上传者、评审员、管理员和只读审计员。

5. **R2 生命周期未实现**  
   schema 已预留键、保留期和软删除，但没有真实私有对象写入、签名读取、删除和供应商缓存清理。

### High / 真实素材进入前关闭

6. **v0.3 运行时 validator 不是完整 JSON Schema 编译器**  
   当前复用契约 Agent 的确定性 runtime validator，覆盖权重、分档、Blocker 和 Prompt 来源，但完整结构仍由 JSON Schema 测试验证。生产入口建议使用同一 schema 编译出的 validator。

7. **批次资产注册仍是元数据入口**  
   没有服务端重算 SHA-256；真实上传完成前不能信任客户端哈希。

8. **遗留 `assets.batch_id` 与 `batch_assets` 双轨**  
   为兼容旧库保留。正式迁移后应选择唯一关系来源并提供显式数据迁移，不能长期双写。

9. **旧原型改判只保存在浏览器**  
   这是明确的演示行为。前端 Agent 必须改接正式 evaluation ID、result version 和幂等键后，才能展示“服务端审计成功”。

10. **删除与导出缺少双人复核执行器**  
    当前只文档化边界，刻意未暴露破坏性 API。外部安全审查批准后再实现。

## 7. 建议下一次外部审查

CTO 可向外部审查提供：

1. 本报告；
2. `docs/11_MVP后端持久化与治理边界_v0.1.md`；
3. migration `0002`–`0005`；
4. `lib/platform/repository.ts`；
5. `tests/platform-persistence.test.ts`；
6. staging D1 创建后的一次空库 migration、幂等重放、版本冲突和故意批处理失败证据。

外部审查通过前，本实现状态应标记为“代码候选完成，在线持久化未启用”，不能标记为生产完成。
