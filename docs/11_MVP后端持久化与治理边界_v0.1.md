# VisionQA MVP 后端持久化与治理边界 v0.1

> 状态：实现候选，等待 CTO、测试 Lead 与外部安全审查  
> 范围：内部单租户、人工辅助 MVP；不包含自动发布  
> 日期：2026-07-29

## 1. 已实现的数据闭环

正式写入路径：

```text
POST /api/batches
  -> batches + assets + batch_assets + audit_events（单次 D1 batch）

POST /api/evaluations
  -> assets + evaluation_runs + asset_evaluations + audit_events（单次 D1 batch）

GET /api/evaluations/{id}
  -> 完整 result_json + result_version + 追加式 overrides

POST /api/evaluations/{id}/overrides
  -> commercial_templates + human_overrides
     + commercial_recalibration_logs + audit_events（单次 D1 batch）
```

`asset_evaluations.result_json` 保存完整 `evaluation-result v0.3`（并兼容历史 v0.2），拆列字段只用于查询和索引。v0.3 的运行、资产哈希、成本与延迟通过独立 `execution` 信封传入，避免污染评估决策契约。`result_sha256` 用于判断同一幂等键是否被不同内容复用。人工改判不覆盖模型原始结果，只追加新事件。

旧的 `POST /api/overrides` 属于原型接口，缺少完整评估快照、幂等键和乐观锁版本，因此不再进行服务端写入。它明确返回 `LEGACY_OVERRIDE_ENDPOINT` 和 `persisted: none`，原型页面可继续使用本地演示降级，但不得把浏览器记录称为生产审计。

## 2. 幂等与一致性

- 所有正式写 API 强制要求 `Idempotency-Key`。
- 幂等键作用域是 `(tenant_id, idempotency_key)`。
- 批次创建会对规范化后的场景、模板、锁定项和完整资产清单计算 `request_sha256`；资产与锁定项采用稳定排序，因此相同语义请求可可靠重放。
- 同一键、同一评估内容重放返回已有记录，不产生第二次写入。
- 同一键、不同批次/评估/改判内容均返回 `409 IDEMPOTENCY_KEY_REUSED`。
- 改判必须携带 `baseEvaluationVersion` 和 `originalDecision`；版本或结论变化返回 `409 EVALUATION_VERSION_CONFLICT`。
- 评估、改判及其审计附属记录通过一次 D1 `batch()` 提交。D1 批处理失败时不报告成功。
- 竞争写由唯一索引兜底；冲突回查后仍会重新比较批次指纹或改判完整内容，只有确认已有等价记录时才返回幂等重放。

## 3. D1 未绑定与演示降级

当前 [hosting.json](../web/.openai/hosting.json) 中 `d1` 仍为 `null`，未创建或绑定任何生产数据库。

正式接口在 D1 不可用或 migration 未执行时返回：

```json
{
  "error": {
    "code": "AUDIT_DB_UNAVAILABLE",
    "message": "服务端 D1 尚未绑定或迁移未执行；生产审计未保存",
    "request_id": "...",
    "retryable": true
  }
}
```

约束：

- 响应不得出现 `persisted: server`。
- 浏览器 `localStorage` 只用于交互演示，不是审计记录。
- Pilot 环境必须关闭“把本地降级当成功”的产品文案和业务流程。
- `.openai/hosting.json` 的 `d1` 仍为 `null` 时，不得宣称持久化闭环已部署。

## 4. 认证与授权边界

当前实现只接受 Sites/ChatGPT 注入的已认证用户邮箱，并固定进入内部试点租户 `visionqa-internal-pilot`。请求体不能选择租户。

已实现：

- 未认证写入和读取返回 `401 AUTHENTICATION_REQUIRED`。
- 所有评估和改判查询均带 `tenant_id`。
- 批次注册已有资产时检查资产租户和内容哈希，防止跨租户复用 ID。
- actor、request_id、tenant_id 写入审计。

尚未实现，进入真实客户试点前必须补齐：

- 角色权限矩阵（上传者、评审员、管理员、只读审计员）。
- 独立 tenant membership 数据源和账号停用传播。
- 细粒度批次/项目授权。
- API 限流、CSRF/来源策略以及异常访问告警。

## 5. 保留、删除与导出边界

当前 migration 预留：

- `assets.retention_until`
- `assets.deleted_at`
- `assets.r2_key`
- `audit_events` 的不可变事件载荷

MVP 规则：

1. 原图只存放在私有 R2，D1 只保留对象键和哈希；禁止公共 URL。
2. 默认保留期建议 30 天，最终值由数据权利人与外部审查确认。
3. 删除先写审计事件，再删除 R2 对象，最后将 `assets.deleted_at` 置值；不得删除历史业务判断。
4. 删除后可保留不可逆 SHA-256、记录 ID、操作者和时间，以证明处理历史；不得保留可恢复原图。
5. 供应商原始响应不得直接写入 `result_json`；只能写受限引用，且必须有独立保留策略。
6. 本版本未提供生产删除/导出 API，避免在授权与双人复核未完成前暴露破坏性入口。

需要外审确认：

- 购买模板、真实投放成品、候选 AI 图的 owner/purpose/location/access/retention/deletion 清单。
- 第三方视觉模型是否保留输入与输出，以及如何申请删除。
- 审计事件保留期是否长于原图保留期。

## 6. 部署绑定说明（不执行生产操作）

实施人员需要在独立 staging 环境完成，当前 Agent 不创建数据库、不绑定资源、不接触密钥：

1. 创建独立 staging D1，并把绑定名设为 `DB`。
2. 从空库依序执行 `drizzle/0000` 至最新 migration。
3. 把 staging D1 资源 ID 通过 Sites 控制面绑定，不手写或猜测 ID。
4. 保持 R2 为私有 bucket；未完成对象授权链前不要开放上传 API。
5. 运行 API 集成测试：认证、跨租户、幂等重放、不同负载复用键、乐观锁冲突、批处理失败。
6. 检查 `.openai/hosting.json` 已记录真实绑定后，才可将环境标记为“服务端持久化可用”。
7. Pilot 与 staging 使用不同 D1/R2，不共享真实素材。

回滚原则：

- migration 只追加，不改写已发布 migration。
- 部署失败时回滚应用版本，不用破坏性 SQL 回退包含审计数据的表。
- 需要删除新增列或重建表时，先导出审计证据并由外部审查批准。

## 7. 外部验收证据

外部审查至少应查看：

- `drizzle/0002` 至最新 migration；
- `lib/platform/repository.ts` 的 D1 单批处理与幂等逻辑；
- 正式 evaluations/overrides API 的错误响应；
- `tests/platform-persistence.test.ts`；
- 一次 staging 空库 migration 日志；
- 一次故意失败的 D1 batch，证明没有半写记录；
- 未认证与跨租户读取的 401/404 证据。

本文件不构成安全认证，也不批准真实客户试点或自动发布。
