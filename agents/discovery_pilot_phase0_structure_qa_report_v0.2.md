# VisionQA Discovery Pilot Phase 0 资产结构独立审查 v0.2

> 审查日期：2026-07-31（Asia/Shanghai）  
> 审查范围：`D:\VisionQA\runs\discovery_pilot_v0.2`  
> 审查性质：只读结构 QA；未访问云端、模型或客户图片  
> **结论：`GO_PHASE_0_LOCAL_ASSET_FREEZE / HOLD_EXTERNAL_DEMO`**

## 1. 审查职责

作为既有独立 QA，核对 Phase 0 资产是否满足本地开发参考集冻结要求：17/17 `DEVELOPMENT_REFERENCE`、manifest/config SHA 绑定、固定模式、无图片二进制、空台账不伪造事件、字段契约与 handoff/README 一致。

## 2. 输入与输出

### 输入

- `pilot_sample_manifest.csv`
- `README.md`
- `run_config.csv`
- `pilot_run_ledger.csv`
- `pilot_sessions.csv`
- `pilot_review_events.csv`
- `pilot_rework_rounds.csv`
- `pilot_daily_metrics.csv`
- `pilot_exceptions.csv`
- `exceptions.csv`

### 输出

- 本审查报告；
- Phase 0 可继续保持本地资产冻结；
- 外部客户演示继续保持 HOLD，直到参与者授权、业务身份和客户素材条件满足。

## 3. 结构检查结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| Manifest 记录数 | PASS | 17 行 |
| `source_split=DEVELOPMENT_REFERENCE` | PASS | 17/17 |
| `source_split_status=PROPOSED_NOT_MATERIALIZED` | PASS | 17/17 |
| `binary_in_project=NO` | PASS | 17/17 |
| `integrity_against_manifest=LOCAL_SHA_MATCHED` | PASS | 17/17 |
| SHA-256 格式与唯一性 | PASS | 17/17 格式有效、17/17 唯一 |
| SHA 与 run_config 绑定 | PASS | manifest SHA `C2250E5C...1617AD7` 与 `run_config.csv` 完全一致 |
| 运行模式 | PASS | `FIXTURE_REPLAY_NO_MODEL` |
| 网络策略 | PASS | `LOCAL_ONLY` |
| 图片策略 | PASS | `NO_IMAGE_COPY` / `NO_EXTERNAL_TRANSFER` |
| 人工终审 | PASS | `REQUIRED` |
| customer 展示授权 | PASS | 17/17 为 `NO` |
| 人工决策/返工/时长 | PASS | 未预填，均为 `NOT_RUN`/`UNASSIGNED`/`TO_LABEL` |
| 二进制文件 | PASS | 目录仅含 CSV/README，无 JPG/PNG/PSD/RAR/ZIP 或图片签名 |
| 空台账 | PASS | sessions/review/rework/metrics/exceptions 均只有表头，无伪造事件 |
| 预检台账 | PASS | 仅 1 条 `PREFLIGHT`，停止原因明确 |
| 字段契约 | PASS | 表头与 README v0.2 契约一致 |

`source_alias` 中的 `xiaoyu/<hash>.jpg` 是脱敏的逻辑别名，不是可访问的本地绝对路径；目录内未发现对应图片二进制。`run_config.sample_manifest_path` 与 ledger 中的 `mvp_path` 是配置/审计路径，不是客户图片传输路径。

## 4. 空表与状态语义

以下文件均为空数据表，未被伪造为成功：

- `pilot_sessions.csv`
- `pilot_review_events.csv`
- `pilot_rework_rounds.csv`
- `pilot_daily_metrics.csv`
- `pilot_exceptions.csv`
- `exceptions.csv`

Manifest 17 行全部仍为 `PENDING_REVIEW`、`WAITING_FOR_CONTEXT_AND_LOCAL_BINARY`；这与 README 的“未取得客户上下文和本地图片前不得演示”一致。`pilot_run_ledger.csv` 的唯一事件为本地 `PREFLIGHT`，状态为 `PASS_INTERVIEW_ONLY`，并明确停止于外部演示所需的参与者资产授权与业务身份。

## 5. 风险与保留边界

- 这批 17 条是开发参考集，不是客户真实投放素材，也不构成客户授权。
- 目前不能执行真实逐图模型 dry-run、客户演示、外传、真实评分或商业 WTP 结论。
- `sample_manifest_sha256` 绑定的是当前文件完整内容；任何新增行、重排、字段修改或编码变化都必须重新计算并更新 config，再经 QA 复验。
- 仅当参与者明确授权 10–20 张自有图片、确认业务身份并在授权设备本地运行，才可进入外部演示阶段。

## 6. 验收结论

Phase 0 本地资产冻结结构完整，满足继续推进“跑通 VisionQA 闭环”的前置条件；不得把它误报为真实业务验证或模型效果验证。

```text
PHASE_0_STRUCTURE=PASS
DEVELOPMENT_REFERENCE=17/17
MANIFEST_SHA_BINDING=PASS
BINARY_IN_PROJECT=0
FABRICATED_EVENTS=0
EXTERNAL_DEMO=HOLD
```
