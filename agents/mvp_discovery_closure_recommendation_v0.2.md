# VisionQA 受控 Discovery 闭环落地建议 v0.2

日期：2026-07-31（Asia/Shanghai）  
状态：`IMPLEMENTATION_READY / LOCAL_ONLY / NO_MODEL / NO_IMAGE_COPY`  
适用阶段：外审 9 项 `GO_FOR_DISCOVERY` 后的受控客户验证  

## 1. 职责、输入、输出与验收

### 职责

把 `MVP_EXTERNAL_REVIEW_v0.2` 的 9 项 `GO_FOR_DISCOVERY` 转成主 Agent 可直接实施的本地试点资产定义、字段契约、执行顺序和停止条件。本文不修改产品代码，不复制、移动或上传客户图片。

### 输入

- `D:\VisionQA\handoffs\MVP_EXTERNAL_REVIEW_v0.2\external_review_decisions.csv`
- `D:\VisionQA\data\customer_xiaoyu_v0.1\asset_manifest.csv`
- `D:\VisionQA\data\customer_xiaoyu_v0.1\README.md`
- 当前本地 MVP：`D:\VisionQA\web`

### 输出

- 一个 17 张 `DEVELOPMENT_REFERENCE` 候选样本名册；
- 应落地的 7 个试点文件及字段；
- 一套可直接执行的会前、会中、会后顺序；
- 数据治理、结果披露和范围停止条件；
- 可验证但不夸大模型或商业价值的试点指标。

### 验收

主 Agent 实施后必须同时满足：

1. 样本数在 10–20 张之间；本文建议 17 张。
2. 17/17 均来自 `DEVELOPMENT_REFERENCE`，`CALIBRATION_REVIEW` 和 `EVALUATION_HOLDOUT` 使用数为 0。
3. 87 张原始素材继续保持原位置、本地只读、零复制、零移动、零上传。
4. 每次审核可用 `pilot_session_id + candidate_trace_id + review_event_id` 追溯上下文、人工判断、返工轮次和审核耗时。
5. 页面和记录均保留 `FIXTURE_REPLAY_NO_MODEL`；不得把 fixture 结果写成当前图片的模型推理。
6. 所有指标只说明工作流、痛点和付费假设，不说明准确率、转化率、GMV 或自动发布安全。

## 2. 外审 9 项到试点控制的映射

| 外审项 | 试点落地控制 | 证据文件 |
|---|---|---|
| ER-01 ICP qualification | 只接受近 30 天存在批量 AI 图审核/返工，且有独立复核者的服饰团队 | `pilot_sessions.csv` |
| ER-02 Local candidate loop | 本地选图、fixture 回放、人工确认/改判、反馈落盘；每次计时 | `pilot_review_events.csv` |
| ER-03 Disclosure | 每个事件固定记录 `evaluation_mode=FIXTURE_REPLAY_NO_MODEL` 和披露确认 | `pilot_sessions.csv`、`pilot_review_events.csv` |
| ER-04 Gate priority | 记录缺失上下文、人工 Blocker 判断和最终发布判断；缺上下文不得记为可发布 | `pilot_review_events.csv` |
| ER-05 Customer assets | 只引用脱敏 alias 和 SHA-256；不记录原路径，不生成图片副本 | `pilot_sample_manifest.csv` |
| ER-06 Traceability | 会话、候选、评估、人工反馈、返工轮次使用稳定 ID 连接 | 全部 CSV |
| ER-07 Automated test | 会前记录 `npm test` 结果和版本；失败即停止当日试点 | `pilot_run_ledger.csv` |
| ER-08 WTP honesty | 金额只记录为受访者原话/提案状态和置信度，不形成销售事实 | `pilot_sessions.csv`、`pilot_daily_metrics.csv` |
| ER-09 No expansion | 自动发布、完整 DAM、自动改图、视频/3D、跨行业、平台白标继续 HOLD | `README.md`、`pilot_run_ledger.csv` |

## 3. 建议样本：17 张 DEVELOPMENT_REFERENCE

选择依据仅为清单元数据覆盖，不代表质量标签或 ground truth：

- 覆盖全部 8 个可用 `DEVELOPMENT_REFERENCE` 拍摄组；
- 13 张 `MODEL_PRESENT`、4 张 `PRODUCT_ONLY`；
- 包含横图、竖图、小文件、高分辨率和超过 10 MB 的本地输入边界；
- 只引用 `asset_id` 和脱敏 `source_alias`，不形成任何原图副本。

| 顺序 | asset_id | source_alias | 类型 | shoot_group | 元数据覆盖理由 |
|---:|---|---|---|---|---|
| 1 | XY-0020 | `xiaoyu/436e5798a8673dbb.jpg` | PRODUCT_ONLY | SG-04 | 商品静物、中等尺寸 |
| 2 | XY-0022 | `xiaoyu/630dda2dd7607f98.jpg` | PRODUCT_ONLY | SG-04 | 商品静物、较小文件 |
| 3 | XY-0024 | `xiaoyu/6c8810cf6287bc6f.jpg` | MODEL_PRESENT | SG-04 | 较低分辨率 |
| 4 | XY-0026 | `xiaoyu/1224ea91ba11ed6c.jpg` | MODEL_PRESENT | SG-04 | 10,360,723 bytes，验证大文件本地处理 |
| 5 | XY-0029 | `xiaoyu/d5b064961a59c36a.jpg` | MODEL_PRESENT | SG-04 | 98,732 bytes，最小文件边界 |
| 6 | XY-0030 | `xiaoyu/fd7e3fb17988a2d7.jpg` | PRODUCT_ONLY | SG-04 | 商品静物、小文件 |
| 7 | XY-0034 | `xiaoyu/4318ad337c56d769.jpg` | PRODUCT_ONLY | SG-04 | 商品静物、高分辨率 |
| 8 | XY-0037 | `xiaoyu/85a345cbb07adbd0.jpg` | MODEL_PRESENT | SG-05 | 新拍摄组 |
| 9 | XY-0041 | `xiaoyu/7d5f191569aa1214.jpg` | MODEL_PRESENT | SG-06 | 横图 8192×5464 |
| 10 | XY-0042 | `xiaoyu/5a6fd367098f0494.jpg` | MODEL_PRESENT | SG-06 | 同组竖图，用于方向差异 |
| 11 | XY-0049 | `xiaoyu/7de4ab6f2a208976.jpg` | MODEL_PRESENT | SG-08 | 新拍摄组 |
| 12 | XY-0051 | `xiaoyu/095807be84dc67a6.jpg` | MODEL_PRESENT | SG-08 | 同组较大文件 |
| 13 | XY-0053 | `xiaoyu/2a0bdbd7f3becaad.jpg` | MODEL_PRESENT | SG-09 | 8736×11648 高分辨率 |
| 14 | XY-0055 | `xiaoyu/3fb41a7f605eb237.jpg` | MODEL_PRESENT | SG-10 | 新拍摄组 |
| 15 | XY-0062 | `xiaoyu/bf3b715ed1643085.jpg` | MODEL_PRESENT | SG-10 | 同组不同文件体量 |
| 16 | XY-0070 | `xiaoyu/6b7323112450ebf2.jpg` | MODEL_PRESENT | SG-12 | 新拍摄组 |
| 17 | XY-0082 | `xiaoyu/aaefa83c08ac8519.jpg` | MODEL_PRESENT | SG-15 | 新拍摄组 |

实施前必须从原清单重新执行 fail-closed 校验：

- 行数必须为 17，且 `asset_id` 唯一；
- `proposed_split == DEVELOPMENT_REFERENCE`；
- `split_status == PROPOSED_NOT_MATERIALIZED`；
- `decode_status == OK`；
- `external_transfer_policy == GOVERNANCE_GATE_REQUIRED`；
- 本地只读解析得到的 SHA-256 必须与原清单一致；
- 任一条件不满足就从本轮排除，不从 calibration 或 holdout 补位。

`classification_status=PENDING_REVIEW` 必须原样保留。`initial_asset_type` 只用于覆盖抽样，不可改写成人工真值。

## 4. 主 Agent 应落地的文件清单

建议目录：`D:\VisionQA\runs\discovery_pilot_v0.2\`。该目录只保存脱敏结构化记录，不保存图片、缩略图、裁切图、截图或原始路径。

### 4.1 `README.md`

记录：

- 试点目的：验证工作流可用性、真实痛点、现有替代方案和付费意愿；
- 明确非目标：模型准确率、商业转化、生产发布、自动发布；
- 数据边界：`LOCAL_ONLY / NO_IMAGE_COPY / NO_EXTERNAL_TRANSFER`；
- 模式：`FIXTURE_REPLAY_NO_MODEL`；
- 17 张样本名册版本；
- 操作角色、保留期限、删除责任人和异常上报方式；
- 每日开始/结束检查清单。

### 4.2 `pilot_sample_manifest.csv`

每个样本一行，字段：

```text
pilot_sample_id,selection_order,asset_id,source_alias,sha256,mime_type,bytes,
width,height,aspect_ratio,initial_asset_type,classification_status,shoot_group,
source_split,split_status,decode_status,external_transfer_policy,
selection_reason,selected_by,selected_at,integrity_checked_at,integrity_status
```

硬约束：

- `source_split` 只能是 `DEVELOPMENT_REFERENCE`；
- `integrity_status` 只能在本地 SHA-256 匹配后写 `MATCHED`；
- 禁止加入 `original_path`、真实文件名或可还原客户身份的字段。

### 4.3 `pilot_run_ledger.csv`

每次启动/结束一次试点运行各写一行，字段：

```text
run_id,event_type,event_at,operator_alias,mvp_version,git_or_source_version,
npm_test_passed,npm_test_count,evaluation_mode,network_policy,
sample_manifest_version,preflight_status,stop_reason,notes_redacted
```

`npm_test_passed != true`、`evaluation_mode != FIXTURE_REPLAY_NO_MODEL` 或 `network_policy != LOCAL_ONLY` 时，`preflight_status` 必须为 `BLOCKED`。

### 4.4 `pilot_sessions.csv`

每位受访者/每场会议一行，记录业务上下文，字段：

```text
pilot_session_id,run_id,participant_alias,organization_alias,organization_type,
participant_role,icp_qualified,qualification_reason,ai_images_last_30d_band,
review_batches_last_30d_band,current_review_process,current_tools,
independent_reviewer_present,rework_frequency_band,rework_cost_description,
scenario,channel,batch_size_band,reference_material_available,
consent_scope,fixture_disclosure_confirmed,session_started_at,session_ended_at,
session_duration_seconds,wtp_question_asked,wtp_amount_currency,
wtp_amount_minor,wtp_commitment_level,wtp_confidence,notes_redacted
```

约束：

- `participant_alias` 和 `organization_alias` 必须脱敏；
- WTP 可记录明确金额，但 `wtp_commitment_level` 必须区分 `HYPOTHESIS / VERBAL_RANGE / WRITTEN_PILOT_PROPOSAL / PAID`；
- 未真实付款不得写 `PAID`，未形成书面带金额提案不得提升到 `WRITTEN_PILOT_PROPOSAL`。

### 4.5 `pilot_review_events.csv`

这是闭环主表，每次原图审核/人工确认/改判一行：

```text
review_event_id,pilot_session_id,run_id,pilot_sample_id,asset_id,source_alias,
candidate_trace_id,candidate_sha256,fixture_case_id,evaluation_mode,
commercial_template_id,context_complete,missing_context_fields,
fixture_overall_score,fixture_gate_decision,fixture_blocker_present,
review_started_at,first_decision_at,review_completed_at,review_duration_ms,
human_blocker_judgment,human_decision,human_confidence,reason_code,
evidence_note_redacted,prompt_viewed,prompt_copied,prompt_copy_count,
feedback_storage,feedback_persisted,feedback_record_id,disclosure_visible,
review_status,exception_id
```

约束：

- `candidate_sha256` 必须等于 `pilot_sample_manifest.sha256`；
- `evaluation_mode` 固定为 `FIXTURE_REPLAY_NO_MODEL`；
- fixture 分数、Gate、证据和 Prompt 只是闭环占位，禁止与当前图片的人工作品质量判断混为一列；
- `context_complete=false` 时，最终可发布判断不得为 `PASS`；
- `review_duration_ms = review_completed_at - review_started_at`，不得手填估算；
- `feedback_persisted=true` 必须能用 `feedback_record_id` 在本地记录中找到；
- `evidence_note_redacted` 不记录人物身份、原文件名或客户敏感信息。

### 4.6 `pilot_rework_rounds.csv`

每个真实发生的返工轮次一行；未返工也必须在 `pilot_review_events.csv` 的汇总字段中记 0：

```text
rework_event_id,pilot_session_id,review_event_id,asset_id,round_number,
repair_prompt_id,repair_prompt_sha256,prompt_source,locked_attributes_confirmed,
rework_owner,rework_started_at,rework_completed_at,rework_duration_seconds,
revised_candidate_trace_id,revised_candidate_sha256,
post_rework_human_decision,post_rework_reason_code,round_outcome,stop_reason
```

边界：

- `round_number` 从 1 开始且最多 3 轮；
- 没有真实修订图时不得伪造一轮，记录 `rework_round_count=0`；
- 任何修订图必须另有明确本地使用授权，仍不得由 VisionQA 上传；
- 不保存修订图副本；只保存本地哈希和脱敏 trace；
- 客户使用自己的改图工具不等于 VisionQA 获得该工具或数据的处理授权。

### 4.7 `pilot_daily_metrics.csv`

每天由原始记录可重算，字段：

```text
metric_date,run_id,qualified_sessions,started_reviews,completed_reviews,
completion_rate,median_review_seconds,p90_review_seconds,override_count,
override_rate,feedback_persisted_count,feedback_persistence_rate,
trace_join_success_count,trace_join_rate,prompt_copy_count,prompt_copy_rate,
rework_zero_count,rework_one_count,rework_two_count,rework_three_count,
context_incomplete_count,context_incomplete_pass_count,
known_fixture_blocker_escape_count,paid_commitment_count,
written_priced_pilot_count,metric_generated_at,generated_by
```

这些指标只允许解释为：

- 工作流能否完成；
- 审核时长和人工改判发生情况；
- 反馈是否完整落盘并可追溯；
- 用户是否愿意把 Prompt 带入自己的返工流程；
- 付费意愿当前处于哪一级证据。

禁止将 `override_rate` 写成模型准确率，也禁止将 `prompt_copy_rate` 写成返工效率提升或商业转化提升。真实 Blocker recall、误放率和准确率在 fixture 模式下必须标记 `N/A`；`known_fixture_blocker_escape_count` 只验证已知 fixture 门禁逻辑。

### 4.8 `pilot_exceptions.csv`

异常和停止事件一行一条：

```text
exception_id,run_id,pilot_session_id,review_event_id,severity,category,
detected_at,description_redacted,asset_accessed,external_transfer_detected,
customer_data_exposed,containment_action,resolution_status,resolved_at,owner
```

`external_transfer_detected=true`、误用 holdout/calibration、哈希不一致、披露缺失或产品出现真实 Provider 网络请求，均为 `P0_STOP`，立即终止当日试点。

## 5. 执行顺序

### Phase 0：一次性冻结（主 Agent）

1. 从原 `asset_manifest.csv` 只读生成 17 行 `pilot_sample_manifest.csv`。
2. 执行上述 fail-closed 校验；禁止人工手抄 SHA。
3. 建立 7 个空表和 README，冻结 schema 版本。
4. 明确本地解析器只把 `source_alias + sha256` 映射到原图；映射只存在于操作员本机内存，不写磁盘日志。

### Phase 1：每日会前门

1. 运行 `npm test`，预期当前为 55/55；实际数量写台账，不写死未来数量。
2. 确认 MVP 显示 `FIXTURE_REPLAY_NO_MODEL`。
3. 确认没有 Qwen/OpenAI/OSS 或其他外部请求能力被激活。
4. 抽查当天样本 SHA-256；不一致即停止。
5. 创建 `run_id`，写 `pilot_run_ledger.csv` 的 `STARTED` 事件。

### Phase 2：受访者资格与上下文

1. 先问“近 30 天是否发生批量 AI 图片审核与返工”。
2. 记录当前怎么解决、谁复核、批次量级、返工频率和成本描述。
3. 不满足服饰、高频批量、独立复核三项中的关键条件时，可继续访谈但不得计为 `qualified_sessions`。
4. 展示前要求受访者确认：这是 fixture 工作流演示，不是模型对客户图片的判断。

### Phase 3：本地审核闭环

1. 每场建议审核 3–5 张；整个波次覆盖 17 张，不要求每位受访者看完全部。
2. 操作员通过本地授权解析找到原图，先校验 SHA-256，再由浏览器本地选择。
3. 启动计时，记录上下文完整性。
4. 浏览 0–100、Gate、分项、证据、商业判断和 Repair Prompt。
5. 让受访者人工确认或改判，并记录原因、证据、置信度。
6. 验证本地反馈实际持久化，记录 `feedback_record_id`。
7. 询问 Prompt 是否会进入现有返工流程；若仅复制而未真实返工，返工轮次必须为 0。

### Phase 4：返工与结束

1. 只有真实发生修订并有额外本地使用授权时才写 `pilot_rework_rounds.csv`。
2. 最多 3 轮，超过即停止并记录 `stop_reason=ROUND_LIMIT`。
3. 会后问当前替代方案、愿意付多少钱、金额对应的采购条件。
4. 写 `COMPLETED` 台账事件，并生成当日派生指标。
5. 每日核对 87 张原图数量和原位置未变化；不得为试点创建副本。

### Phase 5：每 3 个会话一次审查循环

按以下顺序复盘，不扩张功能：

1. 哪类企业的痛点重复出现？
2. 他们当前具体怎么解决？
3. 哪个价格/付费条件出现了可验证承诺？
4. 哪个闭环步骤最常中断？
5. 哪些改动能直接减少完成时间或错误率？

只能把会话中重复出现、且不突破当前边界的 P0/P1 闭环问题交回工程。Agent 结构优化、自动发布、完整 DAM、自动改图、视频/3D、跨行业和平台白标继续 HOLD。

## 6. 试点通过门与停止门

### 工作流通过门

- 17/17 样本均为 `DEVELOPMENT_REFERENCE`；
- 试点事件 `trace_join_rate = 100%`；
- `feedback_persistence_rate = 100%`，否则必须有异常记录；
- `context_incomplete_pass_count = 0`；
- `known_fixture_blocker_escape_count = 0`；
- 每次完成事件都有真实计时、人工判断和原因；
- 外部传输事件为 0。

这些门只证明受控闭环可以运行，不证明模型有效。

### Discovery 证据升级门

- 完成至少 12 次真实访谈；
- 其中至少 6 次完成概念/闭环测试；
- 至少 3 份带明确金额的书面试点提案；
- 至少 1 次真实付款后，WTP 才可从假设升级为已验证早期信号。

### 立即停止门

任一情况发生即停止：

- 样本来自 `CALIBRATION_REVIEW` 或 `EVALUATION_HOLDOUT`；
- 原图被复制、移动、重命名、生成缩略图或上传；
- 发现外部 Provider、云存储或遥测请求；
- SHA-256 不一致；
- 页面把 fixture 说成当前图片的模型判断；
- 缺上下文仍允许最终 `PASS`；
- 记录出现真实姓名、原始路径、原文件名或其他客户敏感信息；
- 受访者要求进入自动发布、真实模型或生产决策，但相关治理门尚未另行批准。

## 7. 已知限制

- 17 张样本仍是元数据抽样，未做本轮人工内容复核，不能称为代表性样本或 gold label。
- 87 张素材整体偏正向，不能验证拒绝档、低分档或真实缺陷召回。
- fixture 与客户图片无语义关系，因此不能计算模型质量、Blocker recall、误放率或商业预测。
- 浏览器 localStorage 不是正式审计存储；试点结束应导出脱敏结构化记录并进行完整性核对，但导出中仍不得包含图片或原路径。
- 真实模型 canary、服务端审计、生产发布和任何云端处理仍为独立授权事项，本建议不授权。

## 8. 最终建议

可以实施一个 17 张、全本地、无模型、无图片复制的 Discovery 波次。它验证的是“候选图进入 → 信息呈现 → 人工判断 → Prompt 使用意愿 → 反馈追踪 → 痛点/WTP 记录”是否成立。只有上述闭环证据稳定后，才值得申请真实模型和服务端审计的下一阶段授权。
