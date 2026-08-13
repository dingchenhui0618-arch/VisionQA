# VisionQA Discovery Pilot Phase 1 本地 Fixture 预检独立 QA v0.1

> 审查日期：2026-07-31（Asia/Shanghai）  
> 审查范围：`D:\VisionQA\runs\discovery_pilot_v0.2\phase1_local_fixture_preflight_report.md`、`D:\VisionQA\runs\discovery_pilot_v0.2`、`D:\VisionQA\web`  
> 执行边界：只读；未访问云端、未调用模型、未修改代码  
> **结论：`GO_FOR_LOCAL_FIXTURE / HOLD_EXTERNAL_DEMO`**

## 1. 审查职责与输入

本轮作为既有独立 QA，复核 Phase 1 本地 fixture 预检证据是否与 Phase 0 资产冻结、Web 代码契约和测试结果一致，重点检查：

- 17 条样本读取、SHA、`DEVELOPMENT_REFERENCE`；
- `FIXTURE_REPLAY_NO_MODEL / LOCAL_ONLY / NO_IMAGE_COPY`；
- 缺少上下文时必须 `REVIEW` 且分数为 `null`；
- feedback trace 契约；
- npm test/build/lint 结果及 warning；
- 外部演示和真实模型是否仍被正确阻断。

## 2. 独立复验结果

### 2.1 样本与运行边界：PASS

- `pilot_sample_manifest.csv`：17 行；
- `pilot_sample_id`：17/17 唯一；
- `asset_id`：17/17 唯一；
- `source_split=DEVELOPMENT_REFERENCE`：17/17；
- `source_split_status=PROPOSED_NOT_MATERIALIZED`：17/17；
- `binary_in_project=NO`：17/17；
- `integrity_against_manifest=LOCAL_SHA_MATCHED`：17/17；
- SHA：17/17 为合法 64 位十六进制且互相唯一；
- `run_config.csv` 中 manifest SHA 与当前文件独立复算一致：
  `C2250E5C0674F74AA5D71FFDAE1472D2842F9311B44B3B680D50ED07E1617AD7`；
- 运行模式：`FIXTURE_REPLAY_NO_MODEL`；
- 网络策略：`LOCAL_ONLY`；
- 图片策略：`NO_IMAGE_COPY / NO_EXTERNAL_TRANSFER`；
- `human_final_review=REQUIRED`；
- 17/17 客户展示授权为 `NO`，人工决策、返工轮次、耗时和 blocker 结果未被预填。

目录中未发现 JPG、PNG、PSD、RAR、ZIP 或图片文件签名。`source_alias` 是脱敏逻辑别名，不是可访问的客户图片绝对路径。

### 2.2 空台账与停止语义：PASS

以下表均只有表头，无虚构访谈、评分、返工、异常、付款或转化事件：

- `pilot_sessions.csv`
- `pilot_review_events.csv`
- `pilot_rework_rounds.csv`
- `pilot_daily_metrics.csv`
- `pilot_exceptions.csv`
- `exceptions.csv`

`pilot_run_ledger.csv` 只有一条本地 `PREFLIGHT` 记录，`npm_test_passed=true`、`npm_test_count=55` 的历史字段与当前测试证据不冲突；`preflight_status=PASS_INTERVIEW_ONLY` 且 `stop_reason` 明确要求参与者素材授权和业务身份。它不被解释为客户验证成功。

### 2.3 Web 构建、测试与 lint：PASS（带非阻断 warning）

独立执行 `npm test`：

- build 完成；
- 渲染/生产 smoke 与契约测试：9/9 PASS；
- TypeScript/适配器/存储/平台/数据库/UI 测试：57/57 PASS；
- 合计：66/66 PASS。

独立执行 `npm run lint`：

- 0 errors；
- 1 个既有 warning：`lib/visionqa/providers/qwen.ts:27` 的 `buildPrompt` 未使用。

该 warning 不影响本地 fixture 预检，但进入外部演示前应清理或明确豁免，避免把 lint warning 当作全绿。

## 3. 关键安全契约

### 缺上下文降级：PASS

`app/api/live-evaluate/route.ts` 在 reference/provenance 缺失时强制：

- `decision=REVIEW`；
- `overall_score=null`；
- `score_band=null`。

`workspace.tsx` 的本地流程也将缺失参考声明或未知 AI 来源映射为 `REVIEW`，不会把 fixture 分数伪装为真实模型结果。运行时契约与规则层进一步保留不完整字段为 `null`。

### Feedback trace：PASS

`tests/local-mvp.test.ts` 与 `lib/visionqa/local-mvp.ts` 复验：

- schema version；
- candidate trace ID；
- candidate SHA-256；
- fixture case；
- evaluation mode；
- 原始/人工决定；
- reason code；
- bounded local storage。

反馈记录使用 `FIXTURE_REPLAY_NO_MODEL`，不会误标为真实模型或客户生产事件。此前 17 条 pilot 空台账不会因本地反馈测试而被填充。

## 4. 当前裁决

```text
PHASE_1_LOCAL_FIXTURE=PASS
SAMPLE_CONTRACT=17/17 PASS
MISSING_CONTEXT=REVIEW + SCORE_NULL PASS
FEEDBACK_TRACE=PASS
NPM_BUILD_TEST=66/66 PASS
LINT=0_ERRORS_1_WARNING
EXTERNAL_DEMO=HOLD
REAL_MODEL=NOT_RUN
CLOUD=NOT_RUN
```

本轮允许继续推进本地 fixture 闭环和评分/反馈链路验证；不允许把它升级为客户演示、真实模型效果或商业付费验证。

## 5. 下一步最小动作

1. 由现有 Agent 清理 `qwen.ts:27` 的未使用 `buildPrompt` warning，或在项目状态中记录有期限的豁免；这不需要新增 Agent。
2. 为本地 fixture 增加一条自动化断言：缺 reference/provenance 时 UI 与 API 均返回 `REVIEW` 且所有评分字段为 `null`。
3. 如进入真实客户演示，先取得参与者图片授权、业务身份、参考/SKU 上下文和人工终审安排；只使用参与者自有图片，在授权设备本地运行。
4. 保持 17 条内部开发参考图不外传、不上传、不进入客户演示。

## 6. 最终结论

**GO_FOR_LOCAL_FIXTURE，HOLD_EXTERNAL_DEMO。**  
Phase 1 本地 fixture 预检与 Web 证据一致，66/66 测试通过；唯一已知问题是 1 个非阻断 lint warning，下一步应小范围清理，不扩大产品范围。
