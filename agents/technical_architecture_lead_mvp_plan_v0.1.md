# VisionQA MVP 技术架构与派工蓝图 v0.1

> 负责人：技术架构 Lead  
> 日期：2026-07-29  
> 范围：从现有可点击原型推进到“可对授权小样本运行、结果可追溯、全程人工复核”的内部试点 MVP。  
> 非目标：自动发布、宣称准确率、客户级多租户、自动学习客户偏好、生产级大规模吞吐。

## 1. CTO 技术结论

现有系统不是空白项目，而是一个通过构建与回归测试的前端原型，加上较完整的数据契约、D1 表结构和单个人工改判 API。它已经具备 MVP 的产品外壳，但尚未具备真实评估执行能力。

MVP 的关键不是继续扩展页面，而是补齐以下闭环：

```text
授权图片上传/登记
→ 创建批次与不可变运行快照
→ 模型 Adapter 生成结构化观察
→ JSON Schema 校验
→ 确定性 Gate 与评分策略计算
→ 生成修复 Prompt
→ D1/R2 持久化
→ 前端读取真实结果
→ 人工确认/改判
→ 审计事件完整留痕
```

技术上应坚持三层分离：

1. **模型观察层**只描述观察、证据坐标、置信度，不直接决定发布。
2. **确定性策略层**根据版本化 Gate、评分和阈值生成分数与 `PASS / REVIEW / REJECT`。
3. **人工治理层**保留确认、改判和校准事件，单次改判不自动更新模板。

首个 MVP 只能定位为“人工审核辅助”。所有系统 `PASS` 必须人工复核，直到真实盲测证明可安全调整。

## 2. 当前技术成熟度盘点

| 能力面 | 现状证据 | 成熟度 | MVP 缺口 |
|---|---|---:|---|
| 前端工作台 | `web/app/workspace.tsx`；批次、详情、商业模板切换、修复 Prompt、人工改判均可演示 | 75% | 数据全部硬编码；无上传、批次创建、执行进度、错误重试、真实结果查询 |
| 响应式与设计系统 | `globals.css`、`DESIGN.md`；桌面/移动已检查 | 80% | 缺加载、空态、失败态、长任务态和真实数据极值测试 |
| API | 仅有 `POST /api/overrides` | 20% | 缺资产、批次、运行、结果、模板读取 API；缺统一错误格式和幂等 |
| 数据契约 | `evaluation-result-v0.2.schema.json`、商业模板和校准事件 Schema | 75% | 没有运行时 validator；数据库结构没有完整映射 v0.2；契约兼容策略未自动测试 |
| 数据库 | D1/Drizzle schema + 两个 migration | 55% | 线上 D1 未绑定；migration 未在真实 D1 执行；缺约束、索引、批次表、原始输出引用、任务状态 |
| 对象存储 | `.openai/hosting.json` 中 `r2: null` | 0% | 没有图片对象存储、签名/授权访问、哈希、保留和删除策略 |
| 人工审计 | Override API 可写 4 类记录；无 D1 时显式本地降级 | 45% | 多表写入无显式原子事务/幂等键；原型固定 run/evaluation ID；身份与权限不足 |
| 模型接入 | 契约预留 `model_snapshot` 与 `provider_adapter_version` | 5% | 无 provider adapter、无真实调用、无超时/重试/成本、无输出修复和契约拒绝路径 |
| Gate/评分引擎 | 原型规则存在于前端演示逻辑；标准文档已建立 | 25% | 规则未服务端化，无法证明模型分与发布决策解耦；缺版本化单元测试 |
| Repair Prompt | UI 有逐图演示文本，Schema 已结构化 | 25% | 无生成器、无输入锁定校验、无返工效果评测 |
| 部署 | 私有 Sites 原型已发布；commit `8ab868f` | 65% | D1/R2 均未绑定；无 staging/prod 配置矩阵；无迁移发布流程与运行健康检查 |
| 测试 | `npm test` 5/5、lint、build 于 2026-07-29 再次通过 | 45% | 当前主要为 HTML/源码断言；无 API 集成、DB、契约、策略、Adapter、E2E、安全测试 |
| 安全与隐私 | 可读取 ChatGPT 用户身份；网站为私有原型 | 25% | 写 API 未强制认证；无角色授权、限流、文件校验、恶意输入防护、数据生命周期 |
| 可观测性 | 表中有 latency/cost 设计 | 10% | 无结构化日志、request/run correlation、错误率与成本看板、告警 |

### 已验证事实

- `npm test`：5/5 通过。
- `npm run lint`：通过。
- 生产构建：通过。
- `.openai/hosting.json` 当前为 `d1: null`、`r2: null`。
- 部署 URL 存在，但只代表原型可访问，不代表数据闭环可用。
- `POST /api/overrides` 在 D1 不可用时返回 `503 AUDIT_DB_UNAVAILABLE`，前端再降级到 `localStorage`。
- 当前 UI 图片、分数、问题、证据坐标、Prompt 均来自 `workspace.tsx` 演示常量。

### 契约冻结前必须裁决的三个漂移

1. `evaluation-result-v0.2` 的 `commercial_assessment` 仍是文本型 `product_focus / selling_point_expression / click_motivation / brand_fit / placement_fit`，没有保存当前统一口径的六项商业子分、模板 ID、模板版本、适用性和相对贴合等级。
2. D1 `asset_evaluations` 只拆存少数字段，无法无损重建完整 v0.2 结果；MVP 应保存完整 `result_json`，拆列只服务查询和索引。
3. `commercial_profiles.template_id` 实际外键指向 `commercial_templates.id`（版本化主键），字段名容易让实现误以为指向逻辑 `template_id`。新 migration 中应重命名为 `commercial_template_id` 或明确采用版本化 key。

因此 T0 不是形式审查，而是其他实现 Agent 开工前的硬依赖。技术架构 Lead 应组织产品/标准/外部审查角色确认一次契约增量，避免前端、数据库和模型 Adapter 各自发明不同字段。

## 3. MVP 技术边界

### 3.1 必须交付

- 单租户、受控账号的内部试点。
- JPG/PNG/WebP，单图上限和批次上限由配置明确；PSD/RAR 不进入在线执行链路。
- 创建批次、上传候选图和参考图、登记 SKU 不可变属性。
- 首个真实视觉模型 Adapter，支持候选图 + 参考图组合输入。
- 输出必须通过 `evaluation-result-v0.2` 的运行时校验。
- 服务端确定性 Gate、四大 Skill 分数、综合分和商业模板相对分。
- 可复制的结构化修复 Prompt。
- 结果、模型快照、提示词版本、策略版本、人工决策和审计事件可追溯。
- D1 持久化、R2 私有对象存储。
- 所有 PASS 进入人工确认，不存在真正自动发布。
- 可在 20–50 组授权配对样本上运行一次完整盲测并导出评测文件。

### 3.2 明确不做

- 多客户自助注册、计费和套餐。
- PSD 在线解析和图层级审核。
- 基于一次人工改判自动训练或更新客户画像。
- 自动回写电商平台。
- 基于当前 53 套模板宣称转化提升。
- 在缺乏 HIGH/LOW 完整锚点时修改 90 分阈值。

## 4. 最小可交付架构

```text
[VisionQA Web / App Router]
  ├─ 上传与批次 UI
  ├─ 批次网格/证据详情
  └─ 人工确认/改判
          │ HTTPS + SIWC identity
          ▼
[Application API]
  ├─ Assets/Batches
  ├─ Runs/Evaluations
  ├─ Overrides/Audit
  └─ Templates
     │              │
     │ metadata     │ binary
     ▼              ▼
 [Cloudflare D1]  [Private R2]
     ▲
     │ state/result
[Evaluation Orchestrator]
  ├─ input validation + hash
  ├─ Provider Adapter
  ├─ contract validator
  ├─ deterministic Gate engine
  ├─ score/commercial policy
  └─ repair Prompt composer
          │
          ▼
 [Vision Model Provider]
```

长任务不能依赖浏览器请求保持连接。MVP 可先使用“D1 任务状态 + 服务端执行端点 + 客户端轮询”的受控实现；如果供应商延迟或批量规模导致请求超时，则必须升级为队列/工作流。批次最多 20 张并限制并发，避免在 MVP 阶段过早建设复杂分布式调度。

## 5. 接口边界

### 5.1 外部 HTTP API

| 方法与路径 | 输入 | 输出 | 关键约束 |
|---|---|---|---|
| `POST /api/assets/upload-intents` | 文件名、MIME、字节数、用途 | R2 上传授权或服务端上传入口、asset_id | 强制认证、MIME/大小白名单、私有存储 |
| `POST /api/batches` | 场景、商业模板、候选 asset_ids、参考 asset_ids、locked_attributes | batch_id、状态 | 同一租户引用校验；至少 1 个候选图 |
| `POST /api/batches/{id}/runs` | adapter、运行配置 | run_id、`QUEUED/RUNNING` | `Idempotency-Key` 必填；冻结模型/Prompt/规则版本 |
| `GET /api/runs/{id}` | run_id | 状态、进度、失败项 | 不返回供应商密钥或完整原始响应 |
| `GET /api/batches/{id}/evaluations` | 筛选、分页 | v0.2 结果摘要 | 服务端分页、稳定排序 |
| `GET /api/evaluations/{id}` | evaluation_id | 完整 v0.2 结果 + 审计摘要 | 证据图片使用短期签名 URL |
| `POST /api/evaluations/{id}/overrides` | human_decision、reason_code、evidence_note、期望版本 | override + audit id | 强认证、乐观锁/版本号、幂等 |
| `GET /api/commercial-templates` | status | 版本化模板列表 | 默认只返回 `ACTIVE/VALIDATING` |
| `GET /api/exports/{run_id}` | 格式 | CSV/JSON 导出 | 记录导出审计 |

所有错误统一为：

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "用户可读说明",
    "request_id": "req_xxx",
    "retryable": false
  }
}
```

### 5.2 Provider Adapter 接口

```ts
interface VisionProviderAdapter {
  readonly providerId: string;
  readonly adapterVersion: string;
  evaluate(input: ProviderEvaluationInput, signal: AbortSignal):
    Promise<ProviderObservationEnvelope>;
}
```

`ProviderEvaluationInput` 只包含：

- 候选图短期私有 URL 或受控字节流；
- 商品参考图；
- 场景和图位；
- SKU locked attributes；
- taxonomy、commercial template 与 prompt 的明确版本；
- request_id、run_id、asset_id。

Adapter 输出只允许是“模型观察信封”，不能直接决定 Gate：

- provider/model snapshot；
- 原始结构化观察；
- token/图像/费用与延迟元数据；
- provider request id；
- 原始响应的受限引用；
- warnings。

### 5.3 Adapter 可靠性策略

- 单图总超时建议 45 秒；供应商调用超时 35 秒。
- 只对网络错误、429、明确 5xx 重试，最多 2 次，指数退避带抖动。
- `INVALID_OUTPUT` 允许一次“只修复 JSON 结构”的重试，不允许偷偷更改视觉判断。
- 每次执行保存 model snapshot、adapter version、prompt version。
- Adapter 不处理商业阈值和发布结论。
- 供应商原始响应不直接展示给终端用户；敏感日志必须脱敏。
- 加入 circuit breaker：连续供应商错误达到阈值后停止新任务并进入 `PROVIDER_DEGRADED`。

## 6. 数据流与持久化设计

### 6.1 D1 必须新增/调整

建议由后端 Agent 生成 migration，不手改已发布 migration：

- `batches`：批次、租户、场景、模板版本、状态、创建者。
- `batch_assets`：候选/参考角色、排序、关联。
- `evaluation_jobs`：队列状态、attempt、next_retry_at、错误码、幂等键。
- `assets`：增加 tenant_id、sha256、mime_type、byte_size、r2_key、retention_until、deleted_at。
- `evaluation_runs`：增加 batch_id、provider_id、adapter_version、taxonomy_version、threshold_policy_version、status、started_at、completed_at、request correlation。
- `asset_evaluations`：保存完整 result_json、schema_version、commercial template/version、model status、gate status、latency/cost。
- `human_overrides`：增加 request_id、idempotency_key、base_evaluation_version；防止重复提交和覆盖竞态。
- `audit_events`：增加 request_id、tenant_id、subject_type、immutable payload。

必要索引：

- `assets(tenant_id, sha256)` 唯一或条件唯一；
- `evaluation_jobs(status, next_retry_at)`；
- `asset_evaluations(run_id, asset_id)` 唯一；
- `human_overrides(asset_evaluation_id, created_at)`；
- `audit_events(entity_type, entity_id, created_at)`；
- `commercial_templates(template_id, version)` 唯一。

### 6.2 R2 约束

- Bucket 私有，不允许公开对象 URL。
- Key 格式：`tenant/{tenant_id}/assets/{asset_id}/{sha256}.{ext}`。
- 上传后服务端重新计算 SHA-256，禁止只相信客户端。
- 读取使用短期签名或应用代理，并验证租户归属。
- MVP 默认保留期建议 30 天；删除资产时保留不可逆哈希和审计，但删除原图。
- 供应商请求结束后不得在临时目录残留图片。

### 6.3 写入一致性

当前 Override API 连续写入多张表，中途失败会产生部分记录。实现时必须：

- 使用 D1 支持的批处理/事务能力保证 evaluation snapshot、override、recalibration log、audit event 一致写入；
- 对所有写操作支持幂等键；
- 人工改判不得覆盖历史记录，只追加新版本；
- 失败时返回明确错误，不得宣称服务端已保存；
- `localStorage` 仅保留开发模式，MVP 试点环境禁止将其当审计记录。

## 7. 环境与配置

| 配置 | Local | Staging | Pilot |
|---|---|---|---|
| `DB` | 本地 D1 | 独立 staging D1 | pilot D1 |
| `ASSET_BUCKET` | 本地 R2/fixture | staging R2 | pilot 私有 R2 |
| `VISION_PROVIDER` | `fixture` 或真实 sandbox | 真实 provider | 冻结 provider |
| `VISION_MODEL` | 可配置 | 固定快照 | 固定快照 |
| `VISION_API_KEY` | `.dev.vars`/secret | secret | secret |
| `MAX_BATCH_SIZE` | 5 | 20 | 20 |
| `MAX_IMAGE_BYTES` | 明确配置 | 明确配置 | 明确配置 |
| `DATA_RETENTION_DAYS` | 7 | 14 | 30（待业务确认） |
| `REQUIRE_HUMAN_PASS_REVIEW` | `true` | `true` | `true` |
| `ENABLE_LOCAL_AUDIT_FALLBACK` | `true` | `false` | `false` |

`.openai/hosting.json` 必须完成 D1/R2 绑定后才能宣告持久化闭环完成。密钥不能写入仓库、数据库事件或前端 bundle。

## 8. 技术角色定义

### 8.1 前端应用 Agent

**职责**

- 将硬编码 `assets` 替换为真实批次/评估 API。
- 实现上传、批次创建、执行进度、错误重试、空态和真实审计状态。
- 保留当前 A 为主、B 为证据详情的产品结构。

**输入**

- 本文 API 边界；
- `evaluation-result-v0.2.schema.json`；
- 当前 `workspace.tsx`、`DESIGN.md`；
- 产品 Agent 提供的 MVP 流程与中文文案。

**输出**

- API client 与 typed view model；
- 上传/批次/结果/错误态 UI；
- 人工改判乐观锁交互；
- 前端组件与 E2E 测试。

**验收标准**

- 页面不再读取演示 `assets` 常量；
- 可从创建批次走到结果与人工确认；
- 刷新后状态来自服务端；
- 503/超时/部分失败可辨识且不误报成功；
- 桌面和 390px 移动端主流程通过；
- 无障碍状态不只依赖颜色；
- lint、build、单元和 E2E 全通过。

### 8.2 后端/数据平台 Agent

**职责**

- 建立 D1/R2 数据面、批次与运行 API、真实审计持久化。
- 保证身份、租户、幂等、并发控制和数据生命周期。

**输入**

- 本文表结构与 API；
- 现有 Drizzle schema/migrations；
- Sites D1/R2 绑定方式；
- 安全 Agent 的访问与留存规则。

**输出**

- 新 migration；
- assets/batches/runs/evaluations/templates/overrides API；
- R2 私有对象读写；
- migration 与 API 集成测试；
- 数据删除与导出脚本/接口。

**验收标准**

- staging D1 migration 从空库一次成功；
- 重复 Idempotency-Key 不产生重复 run/override；
- 多表写入失败不留部分业务记录；
- 未授权用户不能读取或写入别人的资产；
- R2 无公开 URL；
- 浏览器刷新后审计可查询；
- `localStorage` 不被计入试点审计；
- 20 图批次元数据读取 P95 < 500ms（不含模型执行）。

### 8.3 模型 Adapter Agent

**职责**

- 接入一个真实视觉模型；
- 将供应商响应规范化为 provider-neutral observation；
- 处理超时、重试、结构修复、成本和原始响应引用。

**输入**

- v0.2 契约；
- taxonomy、skill mapping、gates、商业模板；
- 20–50 组授权候选图/参考图；
- 模型供应商密钥和数据处理条款。

**输出**

- `VisionProviderAdapter` 实现；
- fixture adapter；
- prompt 模板与版本；
- contract tests；
- 小样本原始执行导出。

**验收标准**

- 同一输入保存 provider/model/prompt/adapter 版本；
- 100% 返回合法状态，非法 JSON 被显式标为 `INVALID_OUTPUT`；
- Adapter 不输出最终 Gate decision；
- 超时、429、5xx、不可读图片均有可测试路径；
- 每次执行有 latency、attempt、cost_status；
- 不把密钥和图片内容写入普通日志；
- 授权小样本真实运行完成，不能用模拟数据冒充。

### 8.4 规则与评分引擎 Agent

**职责**

- 把 Gate、四 Skill、商业模板和阈值从前端演示逻辑迁到服务端纯函数。
- 确保 Blocker 优先且所有策略版本可追溯。

**输入**

- `gates_v0.1.md`、`rubric_v0.1.md`、`skill_mapping_v0.2.md`；
- 商业模板 v0.1；
- 模型标准化观察。

**输出**

- Gate engine；
- score engine；
- commercial template scorer；
- repair Prompt composer；
- policy fixtures 和边界测试。

**验收标准**

- 确认 Blocker 时，高分仍为 `REJECT`；
- 疑似 Blocker 为 `REVIEW`；
- 缺关键输入时不产生伪精确分；
- 权重、四舍五入、70/90 边界有测试；
- 相同输入和相同版本得到确定性结果；
- 输出完全通过 v0.2 Schema；
- 前端不得独立重新计算最终决策。

### 8.5 DevOps / 可靠性 Agent

**职责**

- 配置 local/staging/pilot；绑定 D1/R2；建立迁移、部署、回滚与健康检查。
- 建立运行日志、request/run correlation 和成本/错误监控。

**输入**

- Sites 项目 ID；
- 环境矩阵；
- migration；
-供应商配额与超时策略。

**输出**

- 环境绑定和 secrets 清单；
- 部署 runbook；
- migration runbook；
- smoke test；
- 运行指标和告警规则。

**验收标准**

- staging 与 pilot 数据资源隔离；
- secret 不出现在 git/build/log；
- migration 失败会阻断发布；
- 部署后自动验证主页、DB、R2、一次 fixture run、一次 override；
- 可回滚到上一保存版本；
- request_id 可串联 API、run、provider、audit；
- 供应商错误率和任务积压可被发现。

### 8.6 安全与隐私 Agent

**职责**

- 威胁建模、访问控制、图片数据生命周期、供应商数据边界和滥用防护。

**输入**

- API/R2 架构；
- 用户授权范围；
- Sites 身份头；
- 供应商数据保留政策。

**输出**

- 威胁模型；
- 角色矩阵；
- 上传安全规则；
- 日志脱敏与删除策略；
- 试点安全检查表。

**验收标准**

- 所有写接口强制认证；
- 服务端验证身份头，不信任客户端 reviewerId；
- MIME、文件头、大小和图像解码校验通过；
- 无水平越权；
- CSRF/跨源、重放和批量滥用路径有控制；
- 删除请求可移除 R2 原图并保留最小审计；
- 外部模型的数据使用和保留符合用户授权。

## 9. 任务依赖与执行顺序

```text
T0 契约冻结/fixture
├─ T1 后端数据模型 + D1/R2
├─ T2 模型 Adapter + 原始观察
└─ T3 服务端 Gate/评分/Prompt
       │
       ├─ T4 Evaluation Orchestrator
       │    └─ T5 前端真实 API 接入
       │          └─ T7 端到端试点
       └─ T6 安全/DevOps（贯穿 T1–T5）
```

| WP | 任务 | 依赖 | 交付检查 |
|---|---|---|---|
| T0 | 冻结 v0.2 契约、补 validator 与 fixture | 无 | 合法/非法 fixture 测试 |
| T1 | D1/R2 绑定、数据模型、资产和批次 API | T0 | staging 空库迁移、私有上传读取 |
| T2 | fixture + 首个真实 Provider Adapter | T0 | 授权图真实执行、错误矩阵 |
| T3 | Gate/评分/商业/Prompt 纯函数 | T0 | 边界、Blocker、缺输入测试 |
| T4 | 编排 run/job，接 T2 + T3，持久化 v0.2 | T1–T3 | 20 图部分失败仍可完成批次 |
| T5 | 前端接真实 API，移除演示数据依赖 | T1、T4 | 上传到改判 E2E |
| T6 | 身份、权限、限流、日志、部署 runbook | T1–T5 | 安全测试和部署 smoke |
| T7 | 20–50 组授权样本盲测 | T2–T6、数据 | 输出完整评测包，不宣称未验证能力 |

## 10. 关键风险与控制

| 风险 | 等级 | 控制 |
|---|---|---|
| 没有候选 AI 图 + 参考图 gold set | 高 | MVP 只验证工作流；准确率结论延后；试点前收 20–50 组 |
| 当前锚点缺真实 HIGH/完整 LOW | 高 | 不改 90 阈值；LOW 用受控变体，HIGH 另采公认优秀图 |
| 供应商视觉观察不稳定 | 高 | 版本冻结、温度/采样固定、结构校验、重复性抽测 |
| 模型把观察和发布结论混合 | 高 | Adapter contract 禁止最终 decision；Gate 服务端纯函数 |
| D1 多表部分写入 | 高 | batch/transaction + 幂等 + 失败注入测试 |
| 图片泄露或供应商留存不明 | 高 | 私有 R2、短期 URL、最小日志、供应商条款审查 |
| 浏览器本地降级被误当正式审计 | 中 | staging/pilot 禁用 fallback；UI 清晰标记开发模式 |
| 长任务超出请求时限 | 中 | job 状态 + 轮询；达到阈值时升级队列 |
| Schema 与 DB/UI 漂移 | 中 | v0.2 runtime validator、contract test、DB 保存原始 result_json |
| 修复 Prompt 改坏 SKU | 高 | locked attributes 强制进入 Prompt；返工前后对比评测与人工确认 |

## 11. 可验证命令与验收证据

当前基线：

```powershell
Set-Location D:\VisionQA\web
npm test
npm run lint
git status --short
```

每个实现 Agent 必须在自己的交付中补充并运行：

```powershell
# 生产构建
npm run build

# 契约测试（实现后新增）
npm run test:contracts

# 服务端策略测试（实现后新增）
npm run test:policies

# D1 migration + API 集成（实现后新增）
npm run test:integration

# 浏览器主流程（实现后新增）
npm run test:e2e

# 安全 smoke（实现后新增）
npm run test:security
```

必须保留的证据：

- 命令和退出码；
- 部署版本/commit SHA；
- D1 migration 版本；
- Adapter/model/prompt/policy 版本；
- 一次成功执行和一次失败注入的 request_id/run_id；
- 试点导出的 v0.2 JSON 与人工改判审计。

## 12. MVP Definition of Done

以下条件全部满足才称为 MVP 完成：

1. 用户可上传授权 JPG/PNG/WebP，创建候选图 + 参考图批次。
2. 一个真实视觉模型在 20–50 组授权样本上运行，不以 demo 数据代替。
3. 100% 运行结果通过 v0.2 Schema 或被明确标为失败状态。
4. Gate、评分和 Prompt 在服务端生成；前端只展示，不自行决定。
5. Blocker 覆盖高分，70/90 边界和不可评估分支自动测试通过。
6. D1/R2 已在 staging/pilot 绑定；刷新后结果和审计仍存在。
7. 人工确认/改判追加留痕，重复提交不产生重复记录。
8. 所有系统 PASS 仍需人工复核，页面不存在“自动发布成功”表述。
9. 供应商超时、非法输出、批次部分失败、D1 写失败均有明确可恢复状态。
10. build、lint、contracts、policies、integration、E2E、安全 smoke 全通过。
11. 外部审查角色可仅凭导出文件复核输入、模型、策略、结果和人工决定版本。
12. 未经真实盲测，不宣称准确率、转化提升或自动发布安全性。

## 13. 建议立即派出的实现 Agent

并发上限允许时，建议先派三个互不覆盖的实现 Agent：

1. **后端数据平台实现 Agent**：T1，建立 D1/R2 与批次/资产 API。
2. **模型 Adapter 实现 Agent**：T2，建立 fixture 和首个真实 provider adapter。
3. **规则评分实现 Agent**：T0 + T3，建立 runtime validator、Gate/评分/Prompt 纯函数。

第二波：

4. **前端集成 Agent**：待 T1/T4 接口稳定后执行 T5。
5. **DevOps/安全 Agent**：从第一波开始审查，T4 后完成 pilot gate。

这些 Agent 不应同时编辑同一文件。技术架构 Lead 负责契约和边界裁决，CTO/总控 Agent 负责任务排序与跨角色验收，外部审查角色负责对 Definition of Done 与盲测证据进行独立复核。
