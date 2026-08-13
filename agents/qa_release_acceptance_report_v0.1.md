# VisionQA MVP 独立测试与发布验收报告 v0.1

> 角色：测试与发布质量 Lead  
> 日期：2026-07-29  
> 原则：只审查、复现、阻断和出具结论；未修改业务代码  
> 当前建议：`NO-GO_PRODUCTION / CONDITIONAL_GO_NEXT_INTERNAL_GATE`

## 1. 结论

现有代码已达到“内部受控 MVP 候选”的大部分工程要求：契约与确定性规则、模型 Adapter 安全门、Fixture 降级、服务端持久化候选、幂等冲突处理、前端 Fixture/失败降级、桌面与 390px 移动端核心交互均通过独立验证。

当前不能发布为生产 MVP，也不能声称真实批次闭环完成。剩余 Gate：

1. D1/R2 未绑定，正式服务端审计、跨浏览器恢复和真实资产链路未启用；
2. 没有经批准的真实 Provider 调用、真实模型运行结果、成本/延迟基线；
3. 前端正式 API 成功态、正式改判、D1 审计闭环尚无 staging evaluation 可做端到端验证；
4. 受控 LOW 负例仍为 `PLAN_ONLY`，图片数量为 0，外部审查尚未完成。

## 2. 验收矩阵

| 模块 | 独立结果 | 证据/限制 |
|---|---|---|
| evaluation v0.3 JSON Schema 示例 | PASS | Ajv 示例校验通过 |
| 商业六项固定权重与分档 | PASS | 边界与重算测试通过 |
| 四 Skill 固定权重 | PASS | 规则测试通过 |
| Blocker 优先于高分 | PASS | 高分 Blocker 强制 REJECT |
| Repair Prompt 来源链和锁定项 | PASS | 契约/规则测试通过 |
| Fixture 默认与明确标记 | PASS | 默认不访问网络，携带 Fixture warning；UI 双重提示 |
| 真实 Provider 批准门 | PASS（代码） | 五个必要变量分别缺失均在 fetch 前 CONFIGURATION；无密钥泄漏 |
| evidence 缺失降级 | PASS | 分数变 null、整体 PARTIAL、Gate REVIEW，不伪造证据 |
| D1 migration 0000–0005 | PASS（空内存库） | 11 表；`batches.request_sha256` 存在；4 个幂等唯一索引 |
| evaluation 幂等 | PASS | 同内容重放，异内容冲突 |
| batch 幂等 | PASS | 同内容重放、异内容与 race 均冲突 |
| override 幂等/乐观锁 | PASS | 同内容重放、异内容与 race 均冲突；原结论不覆盖 |
| D1 未绑定行为 | PASS | 正式 API 返回 `503 AUDIT_DB_UNAVAILABLE`，不误报保存成功 |
| API 认证与输入负测 | PASS | 400/401/422/503 状态和稳定错误码符合预期 |
| 前端 Fixture 状态 | PASS | 来源 Badge、全宽说明、Inspector 均明确“演示/未标定” |
| 前端 loading/fallback 状态 | PARTIAL PASS | fallback 实机通过；loading 代码存在；瞬时状态未单独录屏 |
| 前端 real 状态 | PENDING STAGING | Adapter 单测通过；无 D1/正式 evaluation ID，不能做端到端确认 |
| 选中图联动 | PASS | 实机点击 #005 后 Inspector 更新为 91/PASS，证据页保持 #005 |
| 正式证据不伪造坐标 | PASS（代码/文案） | 正式无坐标时明确不显示模拟标记 |
| 桌面视觉与交互 | PASS（dev） | 关键区域清晰、无图片失败、无控制台 error/warn |
| 390×844 移动端 | PASS WITH UX REVIEW | 无水平溢出、双列网格与 Inspector 可用；双滚动区体验待外部 UX 裁决 |
| 静态资源 production smoke | PASS | HTML 所有 JS/CSS/字体和关键商品图 200，MIME 正确，hydration 可交互 |
| LOW 负例计划 provenance | PASS（PLAN_ONLY） | 8 行来源、权限链、版本和 hash 正确；0 图片 |
| LOW 负例图片/manifest/gold | NOT RUN | 尚未生产，不能验收 |

## 3. 实际执行记录

### 3.1 Web 全量

执行：

```text
cd D:\VisionQA\web
npm test
npm run lint
```

结果：

- `vinext build`：PASS；
- 页面/静态 Schema/production smoke：8/8 PASS；
- TypeScript 契约、Adapter、平台、UI Adapter：24/24 PASS；
- 合计：32/32 PASS；
- ESLint：PASS。

### 3.2 Python 离线评估器

直接运行 `python -m unittest discover -s tests -v` 会因项目未安装、`visionqa` 不在默认模块路径而失败。使用项目源码路径后：

```text
$env:PYTHONPATH='D:\VisionQA\src'
python -m unittest discover -s tests -v
```

结果：12/12 PASS。该运行前置条件应补入开发/CI 说明，列为 P2 文档问题。

### 3.3 空库迁移

用 Node `DatabaseSync(':memory:')` 依次执行：

```text
0000_workable_squirrel_girl.sql
0001_round_thunderbolts.sql
0002_familiar_sentinels.sql
0003_yellow_electro.sql
0004_massive_iron_patriot.sql
0005_shocking_scarlet_witch.sql
```

结果：

```text
TABLES 11
REQUEST_SHA256 true
IDEMPOTENCY_INDEXES 4
```

此结果只证明 SQLite/D1 兼容 SQL 的空库顺序可执行，不替代真实 staging D1 的原子性与故障注入测试。

### 3.4 API 负测（本地 dev）

| Case | HTTP | 错误码/结果 |
|---|---:|---|
| 创建批次无 Idempotency-Key | 400 | `IDEMPOTENCY_KEY_REQUIRED` |
| 有幂等键但无认证 | 401 | `AUTHENTICATION_REQUIRED` |
| 非法 JSON | 400 | `INVALID_JSON` |
| 非法批次 payload | 422 | `BATCH_REQUEST_INVALID` |
| 合法批次但 D1 未绑定 | 503 | `AUDIT_DB_UNAVAILABLE` |
| 非法 evaluation 契约 | 422 | `EVALUATION_CONTRACT_INVALID` |
| 非法 override | 422 | `OVERRIDE_REQUEST_INVALID` |
| GET evaluation 但 D1 未绑定 | 503 | `AUDIT_DB_UNAVAILABLE` |

### 3.5 真实调用批准门负测

以 OpenAI 路径为例，分别移除：

- `VISION_PROVIDER_APPROVED`
- `VISION_PAID_CALLS_ENABLED`
- `VISION_DATA_PROCESSING_APPROVED`
- `VISION_MODEL`
- `OPENAI_API_KEY`

五种情况均得到 `CONFIGURATION`，且错误文本不含测试密钥；未知 Provider 同样拒绝。真实付费调用次数为 0。

### 3.6 production 静态资源复验

执行：

```text
cd D:\VisionQA\web
npm run build
npm run start -- --port 3100
```

首次使用 vinext 0.0.50 时曾复现 `/assets/*` 与商品图 404。前端 Agent 升级到 vinext 1.0.0-beta.4 并加入 production smoke 后，QA 重新构建、启动全新产物并逐项检查。

最终结果：

```text
200 application/javascript /_next/static/chunks/framework-*.js
200 application/javascript /_next/static/chunks/index-*.js
200 application/javascript /_next/static/chunks/layout-segment-context-*.js
200 application/javascript /_next/static/chunks/rolldown-runtime-*.js
200 application/javascript /_next/static/chunks/workspace-*.js
200 text/css /_next/static/css/index-*.css
200 font/woff2 /_next/static/_vinext_fonts/**/*.woff2
200 image/png /fashion/model-blue-floral-dress-front.png
200 /favicon.svg
```

production 页面实机选择 #005 后 Inspector 更新为 91/PASS，证明 hydration 正常；图片 `naturalWidth > 0`，控制台无 error/warn。`P1-FE-STATIC` 已关闭。

## 4. 数据状态审查

### 4.1 53 套购买模板

- 身份：购买的可编辑电商模板；
- 允许：内部研发和已确认的第三方模型测试；
- 禁止：公开再分发、冒充真实客户投放成品、声称有 CTR/CVR 证据；
- 不能用作四 Skill 准确率 gold set。

### 4.2 PLAN_ONLY 受控负例包 v0.1.1

独立验证：

- 8 行，`variant_id` 和 parent 唯一；
- 8/8 preview 与 RAR 路径存在并与源 manifest 匹配；
- `source_asset_id` 显式保留 `commercial-seed-*`；
- `source_rights_ref` 固定 manifest v0.1.0 和 SHA-256，重算一致；
- 提案人、版本、时间、外部评审角色齐全；
- 8/8 为 `PLAN_ONLY_AWAITING_EXTERNAL_APPROVAL` 和 `SYNTHETIC_CONTROLLED_NEGATIVE`；
- 外部审查结果字段为空；
- 负例目录图片数为 0。

先前两项问题已修复：

- CN-003 不再新增“新品/舒适/品质”等无来源宣称；
- CN-006 不再复制优惠券或制造叠加承诺。

因此该包可交外部创意审查，但不能称为负例数据集、LOW gold 或模型能力证据。

## 5. 问题清单

### P0

无新增实现型 P0。

### P1

无开放 P1。

已关闭：

- `P1-IDEMPOTENCY`：batch/override 首查和 race 均比较内容指纹，定向负测 6/6 PASS；
- `P1-DATA-01/02`：CN-003 与 CN-006 不再新增商品或优惠事实；
- `P1-FE-STATIC`：production JS/CSS/字体/商品图全部 200，MIME 与 hydration 验证通过。

### P2

1. Python 测试需要 `PYTHONPATH=src` 或先安装 package，默认命令不可直接运行；
2. 移动端使用上下两个独立纵向滚动区，功能可用，但手势与信息发现性需外部 UX 审查；
3. 批次列表 GET、资产预览契约、evidence bbox/polygon、RBAC、删除/导出执行器仍未实现；
4. 真实资产 SHA-256 当前由元数据入口提供，尚无服务端上传后重算链路。

## 6. 内部通过与外部待审边界

内部已通过：

- 规则和契约候选；
- Fixture/Adapter 安全边界；
- 平台代码级持久化与幂等候选；
- 前端 dev Fixture 与失败降级；
- PLAN_ONLY 负例前置包。

仍需用户/外部审查：

- Apple-like 视觉和 390px 双滚动交互是否接受；
- 8 条受控负例操作是否允许进入制作；
- 真实 Provider、模型 ID、预算、数据处理条款和密钥配置；
- HIGH 样本、真实候选图与商品参考图；
- staging D1/R2 与正式 evaluation 的闭环；
- 最终商业和生产 Go/No-Go。

## 7. 发布建议

```text
进入下一内部修复/集成 Gate：CONDITIONAL GO
外部负例计划审查：GO
真实模型调用：NO-GO（待用户批准与数据治理）
staging 真实闭环：NO-GO（D1/R2 未绑定）
production 发布：NO-GO（D1/R2、正式 staging 闭环和真实模型 Gate 未完成）
自动发布/≥90 直接发：NO-GO（阈值未标定且无真实 gold）
```

D1/R2 和真实模型条件到位后必须另做 staging Gate；当前报告不能自动升级为生产通过。
