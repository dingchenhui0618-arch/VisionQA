# VisionQA 阿里云迁移影响评估 v0.1

- 评估角色：阿里云迁移影响评估 Lead（只读审计）
- 评估时间：2026-07-29
- 审计范围：`web/db/schema.ts`、D1 migrations 0000–0005、平台 repository/API、Sites/Worker/Vite 配置、Qwen 私有图片 HMAC 信封及相关测试
- 本报告未修改业务代码、数据库或云端资源

## 1. CTO 结论

### 推荐决策

**生产目标应改为“完全移除 Cloudflare 后端依赖”，采用阿里云中国大陆地域的 OSS + RDS PostgreSQL（或 PolarDB PostgreSQL）+ Node.js 应用运行时；实施上分两步，先完成 OSS adapter，再完成数据库和运行时迁移。**

理由：

1. 用户位于中国大陆，R2 已被事实证明不可用；仅换 R2 会留下 D1、Cloudflare Worker/Sites API 和 Cloudflare 身份绑定，国内可用性风险没有闭环。
2. 当前 R2 并没有真正的上传实现，只有 `r2Key` 元数据、配置占位和测试 host，因此先切 OSS 的代码面不大，适合作为第一批可验证工作。
3. 当前 repository 使用大量 SQLite/D1 语义。若选择 PostgreSQL，`ON CONFLICT`、事务、唯一约束和行锁语义比 MySQL 更接近现状；选择 MySQL 会额外重写 upsert 为 `ON DUPLICATE KEY UPDATE`，不建议给当前 MVP 增加第二种变化。
4. “先 OSS、后 PostgreSQL/运行时”是实施顺序，不是最终保留 Cloudflare 的架构。中间态只允许 staging，不能作为国内生产完成态。

### 推荐目标拓扑

```text
中国大陆浏览器
   │
   ├── HTTPS ──> 阿里云 Node.js 应用（首选 SAE；备选 FC 自定义运行时）
   │                 ├── RDS PostgreSQL（MVP 首选）
   │                 ├── OSS 私有 Bucket
   │                 ├── RAM Role / STS
   │                 └── KMS / Secret 管理
   │
   └── 短期 OSS 预签名 URL ──> 百炼 Qwen3-VL（北京）
```

PolarDB PostgreSQL 可作为规模化后的平滑替代，但 MVP 没有足够负载证据要求其复杂度和成本。数据库与 OSS、百炼建议先放同一中国大陆地域，优先北京；具体地域仍需阿里云管理员核实所选产品和模型的可用区。

## 2. 两种方案比较

| 项目 | 方案 A：只换 R2 为 OSS | 方案 B：完全移除 Cloudflare 后端 |
|---|---|---|
| 修改范围 | 小 | 中等 |
| 首次 staging 速度 | 快 | 较慢 |
| 国内素材访问 | 解决 | 解决 |
| 国内 API/数据库可用性 | 未解决，仍依赖 Worker/D1/Sites | 解决 |
| 跨云调用 | Cloudflare API/D1 ↔ 阿里云 OSS/百炼 | 同云为主 |
| 数据治理边界 | 两套云账户和日志面 | 单一国内云边界 |
| D1 持久化 | 保留 | 改为 PostgreSQL |
| 当前 UI 复用 | 全部复用 | 页面与组件可复用；构建、认证、部署需改 |
| 生产推荐 | 否，只能短期 staging | 是 |
| 回滚 | 切回 fixture，OSS 对象保留 | 蓝绿回切旧只读原型；数据库禁止双主 |

### 方案 A 的准确边界

方案 A 并不是“改一个 bucket 名称”：

- `registry.ts` 的图片 host 白名单必须从 R2 host 改为经过审查的 OSS host。
- `STAGING_D1_R2_ACCEPTED` 必须改成 provider-neutral 的存储与数据库 gate，不能用旧 gate 冒充 OSS 已验收。
- `assets.r2_key` 和 API 字段需兼容迁移到 `storage_provider + object_key`。
- 需要真正实现 OSS 上传、Head 校验、短期 GET URL 签名与删除；当前项目没有 R2 上传实现可供直接替换。
- Cloudflare Worker 中的 `ASSETS` 是前端静态资源/图片优化 Fetcher，不等同于商业素材 R2 pipeline。不得把它误认为已存在的 R2 adapter。

方案 A 可作为 3–5 张 canary 的过渡，但必须标记：

`TEMPORARY_HYBRID_STAGING / NO_GO_PRODUCTION`

## 3. D1(SQLite) → RDS/PolarDB PostgreSQL 差异

### 3.1 可保持的业务语义

- 表和关系模型基本可保留：assets、batches、batch_assets、evaluation_runs/jobs、asset_evaluations、human_overrides、commercial_*、audit_events。
- 多租户复合唯一键可保留。
- `ON CONFLICT(id) DO NOTHING` 可在 PostgreSQL 保留。
- 结果完整快照 `result_json` 与 `result_sha256` 的设计可保留。
- idempotency key + request fingerprint 的冲突判定可保留。
- append-only override、recalibration log 和 audit event 同事务写入的目标可保留。
- API 请求/响应合同和稳定错误码大部分可保留。

### 3.2 必须改变的数据库实现

1. `db/schema.ts`
   - 从 `drizzle-orm/sqlite-core` 改为 `drizzle-orm/pg-core`。
   - `sqliteTable` 改 `pgTable`。
   - `audit_events.id integer autoincrement` 改为 `bigserial` 或 identity。
   - 当前所有时间均为 text，建议迁移为 `timestamp with time zone`；如果为降低首迁风险继续存 text，必须加 ISO-8601 检查并统一 UTC。
   - `real` 可继续用 real，但分数/费用更适合 `double precision` / `numeric`；费用不应长期用浮点。
   - JSON 文本可第一阶段保留；第二阶段再迁为 JSONB。不要在同一迁移同时改变数据库、结构和 JSON 语义。

2. `db/index.ts`
   - `cloudflare:workers`、D1 binding、`drizzle-orm/d1` 必须移除。
   - 改为 `drizzle-orm/node-postgres` + `pg.Pool`，连接串从 Secret Manager 注入。
   - 增加连接池上限、连接/查询超时、SSL 和健康检查。
   - 不要把 D1 的 `prepare().bind().first()/all()/batch()` 形状伪装成 PostgreSQL 长期接口；应定义业务 repository port 和真正 transaction callback。

3. migrations 0000–0005
   - **不能在 PostgreSQL 执行。** 它们包含 SQLite 反引号、`AUTOINCREMENT`、SQLite `ALTER TABLE ... ADD` 及 D1 journal。
   - 应从最终 v0.1 schema 生成一个 PostgreSQL baseline（例如 `pg/0000_baseline.sql`），在空 staging 库执行。
   - 当前线上 D1 没有实际绑定/生产数据，优先空库 baseline，不做虚假的 D1 数据迁移。
   - 若后来发现 D1 有数据，单独制作 export → checksum → import → row-count/hash reconciliation 流程，不能复用 schema migrations 当数据迁移。

4. raw SQL 参数和返回形状
   - repository 中的 `?` 绑定和 D1 `results` 包装不适用于 `pg`。
   - 建议用 Drizzle query builder 或 node-postgres `$1...$n`，不要做字符串替换。
   - `RETURNING` 应用于 insert/CAS，减少“先查后写”的竞态窗口。

### 3.3 为什么不优先 MySQL

当前 raw SQL 的 `ON CONFLICT` 与 PostgreSQL相容而与 MySQL 不同；MySQL 还会引入不同的 JSON、timestamp、auto increment、锁和错误码映射。RDS MySQL 并非不可用，但会扩大 MVP 重写面。除非阿里云账户强制只允许 MySQL，否则优先 RDS PostgreSQL。

## 4. 原子性、幂等、乐观锁和审计哈希

### 4.1 批次原子性

当前 `db.batch(writes)` 的意图是一次写入 batch、assets、batch_assets、audit。迁移后必须改为：

```text
BEGIN
  校验/占用 tenant + idempotency_key
  校验 asset ownership
  INSERT batch
  INSERT/复用 assets
  INSERT batch_assets
  INSERT audit event
COMMIT
```

- 使用 Drizzle/pg transaction，任何一步失败必须全部 rollback。
- 唯一约束是最终并发裁判；捕获 PostgreSQL unique violation `23505` 后重新读取同 key，并比较 request hash。
- transaction isolation MVP 可先 `READ COMMITTED`，关键行显式锁；并发压测若发现 write skew，再对特定流程升 `SERIALIZABLE`，不要全局盲目提高隔离级别。

### 4.2 幂等

保留现有：

- `batches(tenant_id, idempotency_key)` unique
- `asset_evaluations(tenant_id, idempotency_key)` unique
- `human_overrides(tenant_id, idempotency_key)` unique
- evaluation job unique
- 相同 key + 相同 fingerprint/hash 返回 replay
- 相同 key + 不同内容返回 `IDEMPOTENCY_KEY_REUSED`

补强：

- 将 request fingerprint 改为稳定 canonical JSON，而不是依赖对象构造顺序。
- idempotency key 记录增加 `request_sha256 / response_entity_id / created_at / expires_at` 的统一 ledger 更易维护；MVP 可先沿用分表 unique。
- PostgreSQL 错误需映射为现有稳定机器码，API 不泄露 SQL/连接信息。

### 4.3 乐观锁存在真实缺口

当前 `persistOverride()` 只读 `result_version` 和 `decision`，但成功追加 override 后**没有递增任何版本**。因此两个不同 idempotency key、同一 `baseEvaluationVersion=1` 的并发改判均可能成功。这不是完整的 optimistic lock。

迁移必须在同一事务中：

1. `SELECT ... FOR UPDATE` 锁定 evaluation；或直接执行 CAS：
   `UPDATE asset_evaluations SET result_version=result_version+1 WHERE id=? AND tenant_id=? AND result_version=? RETURNING result_version`
2. 影响 0 行即 `EVALUATION_VERSION_CONFLICT`。
3. 以返回的新版本写入 override/recalibration/audit。

若产品坚持“模型结果版本永不变”，则新增 `review_revision`，不要混淆 `result_version` 与人工审查流版本。

### 4.4 审计哈希

当前状态：

- evaluation 保存 `result_sha256`，这是好基础。
- audit event 只有 `payload_json`，没有 `event_hash` / `previous_hash`，不是防篡改链。
- `JSON.stringify` 对相同 JS 对象通常稳定，但不是跨语言 canonical JSON 标准。

迁移建议：

- 保留 result 原始 JSON 字节及 SHA-256。
- audit event 增加 `payload_sha256`、`previous_event_hash`、`event_hash`、`hash_version`。
- event hash 对 canonical JSON（明确字段序、UTC、UTF-8、无密钥/预签名查询串）计算。
- 每个 tenant 维护 audit head；事务内锁 head、写 event、更新 head。
- PostgreSQL 链只能“可发现篡改”，不是不可变存储。需要更强证明时，把每日 root hash 写入独立 OSS 审计 bucket；审计 bucket可启用版本控制/WORM，素材临时 bucket不要启用长期 WORM，以免违反删除 SLA。

## 5. R2 → OSS adapter 边界

### 5.1 建议接口

```ts
interface ObjectStorage {
  putPrivate(input): Promise<{ provider; bucket; objectKey; etag; versionId? }>;
  head(objectKey): Promise<{ byteSize; contentType; metadataSha256; etag }>;
  presignGet(objectKey, ttlSeconds): Promise<{ url; expiresAt }>;
  delete(objectKey, versionId?): Promise<void>;
}
```

实现要求：

- 私有 bucket，禁止 public-read。
- key 采用不可变命名：`tenant/{tenantId}/assets/{assetId}/{sha256}.{ext}`。
- 上传使用 RAM Role/STS 最小权限，不使用主账号永久 AccessKey。
- 使用 OSS `x-oss-forbid-overwrite=true`，避免同 key 静默覆盖。
- 上传后 Head 校验 byte size、MIME、SHA-256 metadata；ETag 不作为内容 SHA-256。
- `source_url` 不保存带签名 URL；只保存 `storage_provider/bucket/object_key/version_id`。URL按需临时生成。
- 素材 lifecycle 按删除 SLA 设置；multipart 残片另设清理规则。

### 5.2 schema/API 字段兼容

短期：

- 保留 `r2_key` 读取兼容，但新增 `storage_provider='aliyun_oss'`、`bucket_name`、`object_key`、`object_version_id`。
- API 新字段用 `objectKey`；旧 `r2Key` 只接受迁移期输入并写审计 warning。

冻结后：

- 移除 `r2Key` 对外合同及 R2 文案。
- 数据表中的旧列只在完成回滚窗口后删除。

## 6. OSS signed URL 与 nonce 一次性消费

### 6.1 当前实现的准确结论

`private-image-envelope.ts` 已绑定：

- issuer、nonce、角色、MIME、过期时间
- asset SHA-256、可信 byte size
- host、path hash、完整 URL hash
- HMAC-SHA256 签名

这部分是 provider-neutral 的，可复用；注释中的 “R2-derived” 需要改为 object-storage-derived。

但当前 verifier **只校验 nonce 格式和 HMAC，没有存储/消费 nonce**。同一有效 envelope 在有效期内可以重放。

### 6.2 正确落地

增加 `private_image_nonces`：

- `nonce_hash`（不存明文）
- `tenant_id / run_id / asset_id`
- `url_sha256 / expires_at`
- `status`：ISSUED / CONSUMED / EXPIRED
- `consumed_at / request_id`
- unique `(tenant_id, nonce_hash)`

流程：

1. 服务端为 OSS 私有对象生成最长 15 分钟、canary 建议 5 分钟的 GET URL。
2. 生成随机 128-bit 以上 nonce，写 ISSUED；同事务或可靠 outbox 绑定 run/asset。
3. HMAC envelope 继续绑定 URL、对象 hash/size、expiry。
4. Qwen 网络 dispatch 前执行 CAS：
   `UPDATE ... SET status='CONSUMED' WHERE status='ISSUED' AND expires_at>now() RETURNING ...`
5. CAS 失败则网络调用数必须为 0。
6. provider 的内部重试沿用同一次已批准 dispatch context，不再次消费业务 nonce；跨请求重放必须失败。

重要：阿里云 OSS 预签名 URL按官方语义可在过期前多次使用，不能把 OSS URL 本身声称为“一次性”。如果用下载代理强制单次 GET，百炼可能因 HEAD/重试/多次拉取而失败。这里的一次性消费应定义为“VisionQA 调度授权一次”，而不是“对象只能下载一个 HTTP 请求”。

### 6.3 host 白名单

- 将 `registry.ts` 的 R2 hostname 替换为实际 reviewed OSS hostname。
- 不允许环境变量任意追加 host。
- 若使用 OSS 自定义域名，也必须在审批 artifact 中固定。
- host 改动需重新计算/批准 canary manifest 与 artifact hash，不能沿用旧 R2 审批哈希。

## 7. 文件影响清单

### 7.1 可直接复用或小改

| 文件 | 处理 |
|---|---|
| `lib/visionqa/providers/qwen.ts` | Qwen endpoint/model与解析可复用；输入 URL由 OSS signer提供 |
| `lib/visionqa/providers/orchestrator.ts` | 评分、Gate、Repair Prompt 编排不依赖 Cloudflare |
| `lib/visionqa/providers/types.ts` | envelope结构可复用；issuer建议升级 v2 或保留兼容 |
| `lib/visionqa/providers/private-image-envelope.ts` | HMAC算法可复用；改 provider-neutral 注释并接 nonce store |
| `lib/visionqa/providers/image-preflight.ts` | TTL/MIME/host检查可复用；注入 nonce消费步骤 |
| `lib/platform/contracts.ts` | API合同、hash函数、错误码大部分可复用 |
| `app/api/**/route.ts` | 参数验证和响应结构可复用；DB获取及错误识别需改 |
| `app/workspace.tsx` / UI | 产品界面可复用；D1/R2文案改为服务端/OSS |
| `contracts/**`、`standards/**` | 与云无关，可复用 |

### 7.2 必须重写或新增

| 文件/模块 | 原因 |
|---|---|
| `db/index.ts` | Cloudflare binding 与 D1 driver |
| `db/schema.ts` | SQLite dialect → PostgreSQL dialect |
| `drizzle/0000–0005` | 仅 SQLite/D1 可执行；新增 PostgreSQL baseline |
| `lib/platform/repository.ts` | D1 shape、`?` binding、batch事务、真实乐观锁 |
| `lib/platform/api-context.ts` / `app/chatgpt-auth.ts` | 完全离开 Sites 后认证来源变化 |
| `lib/visionqa/providers/registry.ts` | R2 host 固定值与审批 artifact |
| `lib/visionqa/providers/governance.ts` | `STAGING_D1_R2_ACCEPTED` 必须替换 |
| `worker/index.ts` | Cloudflare Worker/Images/ASSETS 专有 |
| `vite.config.ts` | Cloudflare Vite plugin、hosting binding |
| `.openai/hosting.json`、`wrangler*.jsonc` | 不再是目标部署配置；保留仅作回滚证据 |
| `lib/storage/object-storage.ts` | 新增 provider-neutral port |
| `lib/storage/aliyun-oss.ts` | 新增 OSS 实现 |
| `lib/storage/private-url-service.ts` | 新增 presign + HMAC + nonce issuance |
| `private_image_nonces` migration/repository | 新增一次性调度授权 |
| 阿里云部署清单 | SAE/FC、RDS、OSS、RAM、Secrets、日志、域名 |

## 8. 测试矩阵

### Storage contract

- put/head/presign/delete happy path
- 私有 ACL，匿名 GET 必须 403
- URL expiry 5/15 分钟边界
- `x-oss-forbid-overwrite` 防覆盖
- SHA/size/MIME metadata mismatch 阻断
- tenant key 越权、路径穿越、跨 bucket 阻断
- lifecycle 删除与 multipart 残片清理验证
- 预签名 URL和 AccessKey 不进入应用日志/审计 payload

### HMAC/nonce

- 正确 OSS host/envelope 通过
- 改 host/path/query/expiry/hash/size/MIME/role 任一项失败
- expired nonce失败且 fetch=0
- 同 nonce 第二次业务 dispatch失败且 fetch=0
- 并发双消费只有一个成功
- provider 内部网络 retry 不重复消费、不突破 max request/cost
- signer secret轮换兼容窗口与旧版本拒绝策略

### PostgreSQL persistence

- PostgreSQL baseline 可在全新库一次应用
- 所有 FK、index、unique 与 schema snapshot 对齐
- batch多表写任一步失败全部 rollback
- evaluation多表写失败全部 rollback
- override + recalibration + audit + revision CAS 同事务
- 同 key同 payload replay；同 key异 payload 409
- 100 个并发相同 idempotency key仅一个实体
- 两个不同 key同 base revision仅一个 override成功
- tenant isolation、asset ownership conflict
- result JSON roundtrip和 SHA一致
- audit chain逐条和每日 root验证
- PostgreSQL重连、timeout、deadlock/serialization retry受控

### API/UI/E2E

- 现有稳定机器码不变
- D1/R2字样清除或仅在历史文档出现
- authenticated batch → OSS → Qwen → evaluation → override → audit 完整闭环
- 5 张 canary：预算≤¥20、请求≤15、并发=1
- 中国大陆网络实测：桌面与移动端首屏、上传、评估、证据详情
- 阿里云服务故障时 fixture/fail-closed 行为；不能误报已持久化

### Migration/rollback

- D1 零数据确认记录
- 如有数据：表行数、主键集合、result hash、audit hash reconciliation
- 蓝绿部署与 DNS/API 切换
- 旧系统切只读后禁止双写
- 回滚后新系统数据可导出，不丢失已完成评估

## 9. 迁移风险

| 风险 | 级别 | 控制 |
|---|---:|---|
| 把 OSS presigned URL误称一次性 URL | P0 | nonce定义为调度授权一次；不承诺 HTTP 单次读取 |
| 当前 optimistic lock 可被并发绕过 | P0 | PostgreSQL事务内 CAS revision |
| 沿用旧 `STAGING_D1_R2_ACCEPTED`/artifact hash 激活 Qwen | P0 | 新阿里云审批 artifact、重新 hash、旧 gate 永久失效 |
| 静态 AccessKey 泄露 | P0 | RAM Role/STS + Secret Manager；日志脱敏 |
| SQLite migrations 误跑 PostgreSQL | P0 | 独立 migrations 目录和 CI dialect guard |
| 仅换 OSS 后误判国内生产已就绪 | P1 | hybrid staging 标签 + production hard gate |
| Qwen无法访问内网 OSS endpoint | P1 | 私有 bucket + 公网 HTTPS presigned GET canary |
| URL写入 DB/日志导致素材泄露 | P1 | 仅存 object key；query string redaction 测试 |
| lifecycle/WORM冲突删除 SLA | P1 | 素材与审计分 bucket；素材不锁长期 WORM |
| Node serverless 连接数耗尽 RDS | P1 | pg Pool上限；必要时 RDS代理；压测 |
| 认证仍依赖 ChatGPT Sites | P1 | 完全迁移时替换 auth，保持 tenant/actor contract |
| `r2_key` 字段语义污染 | P2 | 双读迁移后改 `object_key` |

## 10. 回滚路径

### 阶段 1：OSS canary

- 默认 provider 继续 fixture，Qwen hard gate 默认 false。
- OSS adapter以 feature flag启用，仅 5 张授权素材。
- 失败时关闭 OSS/Qwen gate；不删除 canary对象，先保留到排障/审计窗口后按 lifecycle 清理。
- 不回切 R2，因为 R2 未启用且不可用；回滚是回到本地/fixture，不是恢复不存在的服务。

### 阶段 2：PostgreSQL/阿里云运行时

- 蓝绿部署：旧 Cloudflare 原型保持只读，阿里云 staging 独立 DB。
- 切流前冻结旧写入，做最终 reconciliation，再切 API/DNS。
- 禁止 D1 与 PostgreSQL 双主写；若必须短期镜像，只允许 PostgreSQL 主写 + 异步只读校验。
- 回滚时切回旧只读 UI/fixture，保留 PostgreSQL为事实记录并导出未同步事件；不能把新数据丢弃后声称成功回滚。
- `.openai/hosting.json`、wrangler配置和旧部署版本在回滚窗口内保留，不继续写。

## 11. 下一批 Agent 定义

### A. Backend Persistence Agent

**职责**

- 把 D1 repository port迁移到 PostgreSQL。
- 修复 override revision CAS。
- 实现事务、幂等、错误映射、审计 hash chain。

**输入**

- 本报告
- `web/db/schema.ts`
- migrations 0000–0005
- `lib/platform/repository.ts`
- API contracts和 persistence tests
- 阿里云 RDS PostgreSQL连接方式（不含明文密钥）

**输出**

- PostgreSQL Drizzle schema和独立 baseline migration
- pg repository与连接池
- nonce表、audit hash字段
- migration/runbook和自动化测试

**验收标准**

- 空库 baseline成功
- 原 persistence tests语义全部保留并在真实 PostgreSQL integration test通过
- 多表失败 100% rollback
- 并发 idempotency测试只生成一个实体
- 并发同 base revision只允许一个 override
- hash chain可验证
- 日志无连接串/凭据/预签名 URL

### B. OSS Storage Agent

**职责**

- 建立 provider-neutral storage port和 Aliyun OSS adapter。
- 完成私有上传、Head校验、presigned GET、删除/lifecycle对接。
- 将 R2命名迁移为 object storage命名。

**输入**

- 本报告
- OSS bucket/region/endpoint
- RAM Role ARN或部署角色说明
- retention/delete SLA
- 5 张 canary manifest

**输出**

- `ObjectStorage` port和 OSS实现
- storage metadata migration
- upload/presign/delete service
- OSS integration tests和运维说明

**验收标准**

- bucket匿名访问失败
- 只能访问 tenant限定 prefix
- overwrite默认拒绝
- 上传后 SHA/size/MIME验证
- signed URL ≤15分钟且过期后失败
- URL/密钥不落日志/DB
- 删除与 lifecycle按 SLA验证

### C. Private URL & Nonce Security Agent

**职责**

- 把 HMAC envelope升级为 OSS/provider-neutral。
- 实现 nonce issuance、原子消费和重放阻断。
- 更新 Qwen host allowlist与安全负测。

**输入**

- `private-image-envelope.ts`
- `image-preflight.ts`
- Qwen registry/governance
- nonce表
- 已审查 OSS hostname

**输出**

- envelope v2或兼容升级
- nonce repository/service
- 更新后的 approval binding
- 攻击性测试报告

**验收标准**

- 任何 envelope字段篡改均 fetch=0
- 并发重放仅一次 dispatch
- URL过期/nonce过期均 fetch=0
- provider retry不重复占用授权
- 旧 R2 host和旧审批 artifact无法激活

### D. Aliyun Runtime/DevOps Agent

**职责**

- 将 Worker/vinext Cloudflare运行时迁到阿里云 Node.js运行时。
- 建立 VPC、RDS、OSS、RAM、Secrets、日志和蓝绿部署。

**输入**

- 本报告
- 阿里云账户授权与目标地域
- 域名/备案现状
- build/test命令
- rollback要求

**输出**

- SAE（首选）或 FC部署清单
- native Next/Node构建入口
- Secret/RAM最小权限策略
- staging URL、健康检查、监控和回滚 runbook

**验收标准**

- 中国大陆网络完成端到端测试
- Cloudflare binding不是运行前置
- 应用仅通过内网/VPC访问 RDS
- OSS/RDS/百炼权限最小化
- 蓝绿切换和回滚演练成功
- 生产 gate仍为关闭，直到外部审查签字

### E. Independent Migration QA Agent

**职责**

- 独立验证迁移，没有实现权限。
- 对事务、重放、租户越权、凭据泄露、国内网络和回滚做攻击性验收。

**输入**

- A–D Agent产物
- 测试矩阵
- staging只读/测试凭据

**输出**

- P0/P1缺陷清单
- 证据截图/命令结果（脱敏）
- `GO_STAGING / NO_GO` 决定

**验收标准**

- 测试矩阵逐项有证据
- 任何 P0 未关闭即 NO-GO
- 不以 mock测试替代真实 PostgreSQL/OSS canary
- 不接触或输出长期 AccessKey

## 12. 需要账户所有者提供的授权（不在聊天中发送密钥）

后续执行 Agent 至少需要：

1. 一个隔离的阿里云 staging 资源组/项目和中国大陆地域确认。
2. OSS 私有 bucket创建/配置授权，或由管理员预创建后提供 bucket名、region、endpoint。
3. 应用运行时 RAM Role，最小权限限定该 bucket prefix；不要提供主账号 AccessKey。
4. RDS PostgreSQL实例/数据库和应用账号；连接 secret通过阿里云 Secret Manager/运行时注入。
5. 百炼北京地域开通、Qwen模型访问和 canary ¥20预算批准。
6. 数据留存、删除、训练使用、内容审核/人工访问的管理员书面确认。
7. 如采用自有公网域名，需提供域名和备案/ICP现状；staging可先用云产品测试域名但不得误作生产。

## 13. 参考依据

- 阿里云 OSS Node.js 预签名 URL：URL在过期前可多次使用  
  https://help.aliyun.com/en/oss/developer-reference/download-objects-using-a-presigned-url-generated-with-oss-sdk-for-node-js
- 阿里云 OSS Node.js 上传：私有 ACL、`x-oss-forbid-overwrite`、RAM权限  
  https://help.aliyun.com/en/oss/developer-reference/upload-a-local-file
- 阿里云 OSS lifecycle  
  https://help.aliyun.com/en/oss/user-guide/overview-54/
- 阿里云 OSS WORM  
  https://help.aliyun.com/en/oss/user-guide/oss-retention-policies
- 阿里云 RDS PostgreSQL transaction-level pooling  
  https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/configure-a-transaction-scoped-connection-pool
- Drizzle PostgreSQL driver  
  https://orm.drizzle.team/docs/get-started-postgresql
- Drizzle transactions  
  https://orm.drizzle.team/docs/transactions

