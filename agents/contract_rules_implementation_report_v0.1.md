# VisionQA MVP 契约与规则运行时实现报告 v0.1

> 角色：契约与规则运行时实现 Agent  
> 日期：2026-07-29  
> 范围：数据契约、运行时校验、Gate / Score / Prompt 纯函数  
> 明确未做：UI 视觉调整、真实模型调用、伪造模型结果、数据库/API 扩展

## 1. 职责、输入、输出与验收

### 职责

消除商业六项指标、评估 Schema、TypeScript 类型、运行时校验和确定性规则之间的漂移，为后端、模型 Adapter 和前端提供同一套可执行口径。

### 输入

- `agents/technical_architecture_lead_mvp_plan_v0.1.md`
- `agents/product_program_lead_mvp_charter_v0.1.md`
- `contracts/` 现有 v0.1/v0.2 契约
- `standards/commercial_template_platform_promo_v0.1.md`
- `standards/gates_v0.1.md`
- `standards/skill_mapping_v0.2.md`
- `evals/` 已冻结 Phase 1 结论
- `web/` 现有类型、构建和测试配置

### 输出

- 版本化 JSON Schema 与示例
- TypeScript 契约类型与 runtime validator
- 确定性商业分、综合分、分档、Gate 和 Prompt 纯函数
- Schema / runtime / 规则测试
- 变更记录

### 验收结论

| 验收项 | 结论 | 证据 |
|---|---|---|
| 正式六项商业指标与权重一致 | 通过 | v0.2 商业模板 Schema + `COMMERCIAL_METRIC_WEIGHTS` |
| `fit_level` 由分数推导 | 通过 | `deriveFitLevel` + runtime 漂移校验 |
| Blocker 不被高分覆盖 | 通过 | `decideGate` + 99 分 Blocker 测试 |
| Prompt 字段完整并标来源 | 通过 | source-linked action + provenance |
| Schema/example/runtime tests | 通过 | 8 项契约测试全部通过 |
| 不改 UI、不伪造真实结果 | 通过 | UI 文件未修改；示例为 `DEMO` |

## 2. 修改文件

### 项目契约

- `contracts/commercial-template-v0.2.schema.json`
- `contracts/commercial-template-platform-promo-v0.2.example.json`
- `contracts/evaluation-result-v0.3.schema.json`
- `contracts/evaluation-result-v0.3.example.json`
- `contracts/CHANGELOG_v0.3.md`

### Web 运行时

- `web/lib/visionqa/contracts.ts`
- `web/lib/visionqa/rules.ts`
- `web/tests/contracts-rules.test.ts`
- `web/tests/schema-examples.test.mjs`
- `web/package.json`
- `web/package-lock.json`
- `web/tsconfig.json`

## 3. 规则实现

1. 商业贴合分只接受完整六项分数与固定权重；缺项、权重漂移或可评估项为 `null` 会拒绝计算。
2. `NOT_ASSESSABLE / NOT_APPLICABLE` 返回 `template_fit_score=null`、`fit_level=null`。
3. 综合分仅在四大 Skill 均可评分时计算；否则为 `null`。
4. 先执行确认 Blocker，再解释综合分。确认 Blocker 始终 `REJECT`。
5. 90 分以上只表示 `PASS` 候选；函数返回文案仍明确 MVP 需要人工复核。
6. Prompt 只组合输入观察、商业差距和锁定属性，不生成未提供的商品属性。
7. Blocker Prompt 默认进入 `MANUAL_REVIEW`，避免把商品事实错误降格成美化建议。

## 4. 验证命令与结果

```text
cd D:\VisionQA\web
npm run test:contracts
```

结果：Schema 示例 2/2、TypeScript 规则/runtime validator 6/6，共 8/8 通过。

```text
npm run lint
```

结果：通过。

```text
npm run build
```

结果：通过。

全量 `npm test` 的构建和本 Agent 新增测试通过，但原有 `rendered-html.test.mjs` 有 4 项被并发新增 API 的 `cloudflare:workers` 静态导入阻断，错误为 `ERR_UNSUPPORTED_ESM_URL_SCHEME`。该问题不来自本次契约实现，也没有擅自修改另一 Agent 的 API。

## 5. 剩余阻塞与风险

1. **普通 Node SSR 测试与 Cloudflare import 冲突**：需要后端 Agent 将 `cloudflare:workers` 隔离到运行时边界或为 Node 测试提供 adapter/mock。
2. **全量 TypeScript 检查已有 Cloudflare 全局类型缺失**：`Fetcher`、`D1Database` 和 `cloudflare:workers` 类型未被普通 `tsc` 解析；不影响本次 lint/build，但应由部署/后端配置统一解决。
3. **生产依赖安全告警**：`npm audit --omit=dev` 报告 Next.js 16.2.6 及其传递依赖有 3 个高危聚合项，建议单独评估升级到官方修复版本；本 Agent 未越权升级框架。
4. **语义跨字段约束**：JSON Schema 负责结构与固定权重，分数重算、分档推导和 Blocker 覆盖由 runtime validator 执行；后端写入前必须调用 validator，不能只依赖 Schema。
5. **历史数据迁移**：v0.2 的自由文本商业字段不能无损推导六项分数；必须标记未评估或重新运行，不能伪造迁移结果。

## 6. 后续接入要求

- 模型 Adapter 只输出观察，不直接写 Gate 或最终分数。
- 后端在持久化前依次调用：Schema 校验 → runtime validator → 规则引擎。
- 前端只消费派生的 `fit_level / score_band / decision`，不得在组件中重新实现阈值。
- 外部审查应重点检查：六项指标命名、边界值 69.999/70/89.999/90、Blocker 高分案例、Prompt 来源链和未评估语义。

