# VisionQA PostgreSQL 后端迁移报告 v0.1

> 角色：PostgreSQL 后端迁移 Agent  
> 日期：2026-07-29（Asia/Shanghai）  
> 状态：`CODE_READY / FC_PORT_READY / LOCAL_ACCEPTANCE_PASS / REAL_RDS_NOT_RUN`  
> 范围：PostgreSQL schema、baseline migration、repository、P0 改判版本锁、测试与双轨说明  

## 1. 职责、输入、输出和验收标准

### 职责

- 将当前 D1/SQLite 最终业务结构迁移为独立 PostgreSQL 基线；
- 保留历史 D1 schema、migration 和 repository，不以 PostgreSQL 改动覆盖历史实现；
- 为批次、评估、人工改判和审计提供显式 PostgreSQL 事务；
- 修复 P0：人工改判成功后 `result_version` 必须原子递增；
- 验证幂等重放、结果哈希、同版本并发冲突和事务故障零半写；
- 不修改 OSS 或 FC 文件，不创建云资源，不接触公网凭证。

### 输入

- `web/db/schema.ts`
- `web/drizzle/0000–0005`
- `web/lib/platform/repository.ts`
- `web/lib/platform/contracts.ts`
- `web/tests/platform-persistence.test.ts`
- `agents/aliyun_staging_architecture_v0.1.md`

### 输出

- `web/db/pg/schema.ts`
- `web/db/pg/index.ts`
- `web/drizzle-pg/0000_visionqa_baseline.sql`
- `web/lib/platform/postgres-repository.ts`
- `web/lib/platform/postgres-port-adapter.ts`
- `web/tests/postgres-persistence.test.ts`
- `web/package.json` / `package-lock.json` 中的 PostgreSQL 驱动和测试依赖

### 验收标准

- 空 PostgreSQL 兼容数据库可以一次执行 baseline；
- 11 张表、外键、唯一索引和查询索引存在；
- v0.2/v0.3 完整结果 JSON 无损保存，并写 SHA-256；
- 同键同内容重放不产生第二次写入；
- FC 可直接消费 `provider/persistEvaluation/recordJobState` 稳定端口；
- job state 同键重放不重复写，且只允许合法状态转换；
- 两个不同幂等键并发提交同一 `baseVersion` 时仅一项成功；
- 成功改判原子递增 `result_version`；
- 改判事务末端故障后 override、recalibration、版本和审计均不出现半写；
- D1 历史实现仍能通过原测试；
- test、lint、build 全部通过。

## 2. 数据结构迁移

PostgreSQL baseline 一次性建立当前最终态，不翻译或重写六个历史 SQLite migration。

共 11 张表：

1. `batches`
2. `assets`
3. `batch_assets`
4. `evaluation_runs`
5. `evaluation_jobs`
6. `asset_evaluations`
7. `human_overrides`
8. `commercial_templates`
9. `commercial_profiles`
10. `commercial_recalibration_logs`
11. `audit_events`

主要方言调整：

- 时间列改为 `timestamptz`；
- 审计自增键改为 PostgreSQL identity；
- 分数改为 `double precision`；
- `byte_size` 改为 `bigint`；
- D1 `r2_key` 的 PostgreSQL 新写语义改为：
  - `storage_provider='aliyun_oss'`
  - `object_key`
  - `storage_region='cn-beijing'`
- 完整评估仍以 `text` 保存 JSON，避免 MVP 阶段引入 JSONB 查询语义变化；
- `result_version` 增加 `>=1` 检查；
- `human_overrides` 新增 `resulting_evaluation_version`；
- 新增 `(asset_evaluation_id, base_evaluation_version)` 唯一索引，作为并发冲突的数据库兜底。
- `evaluation_jobs` 增加 `request_id/evaluation_id/state_version/last_state_key`，支持 FC 状态机幂等记录。

baseline 自带 `BEGIN/COMMIT`。任何 DDL 失败时不会留下部分结构。

`0001_normalize_storage_provider.sql` 将历史 PostgreSQL 值
`aliyun-oss` 收敛为 canonical ID `aliyun_oss` 并修改默认值。读取兼容函数
`normalizeStorageProvider()` 对新旧两种拼写统一返回 `aliyun_oss`；OSS 和
PostgreSQL 的 provider ID 现已一致。

## 3. PostgreSQL repository

`postgres-repository.ts` 提供：

- `createBatchPg`
- `persistEvaluationPg`
- `getEvaluationPg`
- `persistOverridePg`
- `recordJobStatePg`

`postgres-port-adapter.ts` 对 FC 暴露稳定、provider-neutral 的端口：

```text
provider = 'aliyun_postgresql'
persistEvaluation(input)
recordJobState(state)
```

Adapter 从已注册资产读取可信 SHA-256 和锁定属性，不接受 FC 请求自行声明
素材哈希；固定 prompt/taxonomy/score/threshold/gate 版本由 composition root
构造时注入。FC type contract 可直接消费该对象，不需要 import PostgreSQL
驱动细节。

### 3.1 事务

所有多表写操作均使用同一连接的：

```text
BEGIN
→ 业务读取/锁定
→ 多表写入
→ 审计写入
COMMIT
```

任一步失败执行 `ROLLBACK`，并始终释放连接。

### 3.2 幂等

- 批次：`tenant_id + idempotency_key`，同时比较规范化请求 SHA-256；
- 评估：`tenant_id + idempotency_key`，同时比较完整结果 SHA-256；
- 改判：`tenant_id + idempotency_key`，同时比较 evaluation、原结论、人工结论、原因、证据、reviewer 和 baseVersion；
- 唯一索引竞争返回 PostgreSQL `23505` 后，仅当已提交记录内容相同时才视为成功重放；内容不同返回稳定冲突。

### 3.3 完整结果和哈希

评估使用：

```text
result_json = JSON.stringify(canonical_result)
result_sha256 = SHA-256(result_json)
```

哈希同时进入 `asset_evaluations` 和审计 payload。读取时从完整 `result_json` 无损重建 v0.2/v0.3。

### 3.4 Job 状态机

状态转换被固定为：

```text
NEW -> RUNNING
RUNNING -> SUCCEEDED | RETRY_PENDING | FAILED
RETRY_PENDING -> RUNNING（attempt 必须 +1）
SUCCEEDED / FAILED -> terminal
```

- 完整状态内容形成 `last_state_key`；
- 相同状态、attempt、request、evaluation/error 重放返回
  `created=false`，不新增审计；
- 不同内容或非法转换返回稳定的 `JOB_STATE_CONFLICT/JOB_NOT_FOUND`；
- job 当前态更新和 `audit_events` 在同一事务；
- `SUCCEEDED` 必须带 `evaluationId`；
- `FAILED/RETRY_PENDING` 必须带 `errorCode`。

### 3.5 跨租户主键防护

`persistEvaluationPg` 不再信任全局 `asset_id/run_id` 的
`ON CONFLICT DO NOTHING`：

- 在事务内用 `FOR SHARE` 检查 asset 的 tenant 和 SHA-256；
- 检查 run 的 tenant；
- 并发注册竞争后重新读取并验证 ownership；
- 跨租户复用素材返回 `ASSET_OWNERSHIP_CONFLICT`；
- 跨租户复用 run 返回 `RUN_OWNERSHIP_CONFLICT`；
- 攻击负测确认不能创建跨租户 evaluation。

## 4. P0：人工改判版本递增

旧 D1 路径只追加改判记录，没有递增 `asset_evaluations.result_version`。PostgreSQL 新路径已修复：

1. 在事务内用 `SELECT ... FOR UPDATE` 锁定目标 evaluation；
2. 验证当前 `result_version === baseEvaluationVersion`；
3. 验证当前 `decision === originalDecision`；
4. 追加 override 和 recalibration；
5. 使用条件更新：

```sql
UPDATE asset_evaluations
SET decision = $humanDecision,
    result_version = result_version + 1
WHERE tenant_id = $tenant
  AND id = $evaluation
  AND result_version = $baseVersion
  AND decision = $originalDecision
RETURNING result_version;
```

6. 返回行必须恰好一行，且版本必须等于 `baseVersion + 1`；
7. 审计记录同时保存 base/resulting version；
8. 最后提交事务。

因此两个不同 idempotency key 同时使用版本 1：

```text
请求 A 获得行锁 → 提交版本 2
请求 B 随后获得行锁 → 看到版本 2 → EVALUATION_VERSION_CONFLICT
```

不会出现两个“成功的版本 1 改判”。

## 5. 测试证据

### PostgreSQL 专项

`tests/postgres-persistence.test.ts` 现覆盖 12 项 PostgreSQL 行为：

1. 空 PostgreSQL 兼容内存实例执行 baseline，逐表查询确认 11 表；
2. 完整评估无损保存、SHA-256 正确、同键重放只写一次；
3. 改判同键重放返回同一 override 和版本 2；
4. 两个不同键并发使用同一 baseVersion，仅一项成功；
5. 在事务最后的 audit insert 故意失败，确认版本、override 和 recalibration 全部回滚。
6. 跨租户 asset ID 攻击被拒绝；
7. 跨租户 run ID 攻击被拒绝；
8. provider ID canonical 化与 `aliyun-oss` 历史迁移；
9. FC provider-neutral port 形状及真实持久化；
10. job state 同内容幂等重放；
11. job 合法/非法状态转换和 retry attempt 递增；
12. job insert 后 audit 故意失败，确认 job 与审计原子回滚。

### 全量结果

2026-07-29 本地执行：

```text
npm run lint     PASS
npm test         PASS
build            PASS
all tests        52/52 PASS
FC verify        9/9 PASS + lint/build/smoke
git diff --check PASS
```

其中既包含 D1 历史 fixture 测试，也包含新 PostgreSQL 测试和同期 OSS 测试。

### 透明限制

- 本机 Docker CLI 存在，但 Docker Desktop engine 未运行，因此没有伪造容器验收；
- baseline 在全新 `pg-mem` PostgreSQL 兼容实例中真实执行并通过；
- RDS PostgreSQL Serverless 的 VPC/TLS、连接池、真实行锁和故障注入仍必须在真实 staging 资源创建后复验；
- 这份报告不能把 `REAL_RDS_NOT_RUN` 升级为 `ALIYUN_STAGING_READY`。

## 6. D1 / PostgreSQL 双轨与回滚

### 双轨原则

- 历史 D1 文件 `db/schema.ts`、`drizzle/0000–0005` 和 `lib/platform/repository.ts` 保留；
- D1 继续服务现有 fixture、回归和历史部署读取，不修改其 schema 或迁移历史；
- PostgreSQL 使用独立目录、独立驱动和独立 repository；
- 禁止 D1 与 PostgreSQL 双写。双写会制造分布式一致性问题；
- 环境必须一次只选择一个写后端：
  - 历史/fixture：D1；
  - 阿里云 staging：PostgreSQL；
- API/FC 接线应在下一部署波通过依赖注入选择 repository，不允许请求自行选择数据库。

### 上线前回滚

若 PostgreSQL staging 尚未接收业务写入：

1. 停止 FC staging；
2. 删除独立 staging 数据库或专用 schema；
3. 保持当前 D1/fixture 路径不变；
4. 不执行任何 production 变更。

### 已产生 staging 数据后的回滚

1. 先停止新写入和异步任务；
2. 导出 PostgreSQL 表、schema、行数、result hash 和审计；
3. 将 PostgreSQL 切为只读保留，不做破坏性 down migration；
4. UI/API 回到 fixture 或明确的只读状态，不能把 D1 冒充为 PostgreSQL 数据副本；
5. 修复后从同一 PostgreSQL 数据继续，不把数据无审计地复制回 D1。

## 7. 未做事项

- 未修改 OSS、FC 或前端文件；
- 未创建或修改任何阿里云资源；
- 未连接公网数据库；
- 未读取、生成或保存 RDS 密码、AccessKey、Qwen Key；
- 未将 PostgreSQL repository 接入现有 Cloudflare API route；
- 未声明 staging 或 production 可用。

## 8. 最终 Gate

```text
PG_SCHEMA = CODE_READY
PG_BASELINE_EMPTY_DB_COMPAT = PASS
PG_REPOSITORY = CODE_READY
PG_FC_PORT = READY
PG_JOB_STATE = PASS_LOCAL
PG_IDEMPOTENCY_AND_HASH = PASS_LOCAL
PG_OVERRIDE_VERSION_CAS = PASS_LOCAL
PG_CROSS_TENANT_OWNERSHIP = PASS_LOCAL
STORAGE_PROVIDER_CANONICAL = aliyun_oss
PG_ATOMIC_FAILURE = PASS_LOCAL
D1_HISTORY = PRESERVED
REAL_RDS = NOT_RUN
ALIYUN_STAGING = NOT_READY
PRODUCTION = NO_GO
```

下一步应由 FC/API 集成 Agent 将 repository 以依赖注入方式接入阿里云 staging，然后由真实 RDS 验收 Agent 在隔离的 `cn-beijing` RDS 中执行 baseline、TLS/VPC 连接、并发和故障注入。密钥只能由阿里云管理员注入受控环境，不得通过聊天或仓库传递。
