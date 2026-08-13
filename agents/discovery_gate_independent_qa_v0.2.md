# VisionQA Discovery Gate 独立 QA v0.2

日期：2026-07-31（Asia/Shanghai）  
状态：`HOLD_PENDING_EXECUTION_PACKAGE / DESIGN_PRECHECK_COMPLETE`  
独立性：本 Agent 只审不改；未修改产品代码、客户清单或发现执行资产。

## 1. 角色契约

### 职责

独立复核 `MVP_EXTERNAL_REVIEW_v0.2` 的 ER-01 至 ER-09 在转成 Customer Discovery / 受控试点资产时，是否：

- 扩大了外审授权范围；
- 漏掉数据、披露、追溯或停止门；
- 误用 `CALIBRATION_REVIEW` / `EVALUATION_HOLDOUT`；
- 复制、移动、上传或向无权主体展示客户素材；
- 把计划、模板、代理外审或 fixture 结果写成真实客户证据；
- 生成没有明确行动路径的指标。

### 输入

- `D:\VisionQA\handoffs\MVP_EXTERNAL_REVIEW_v0.2\external_review_decisions.csv`
- `D:\VisionQA\data\customer_xiaoyu_v0.1\asset_manifest.csv`
- `D:\VisionQA\agents\mvp_discovery_closure_recommendation_v0.2.md`
- `D:\VisionQA\agents\customer_discovery_execution_report_v0.2.md`
- 当前本地 MVP 与 `npm test`
- 待生成：`D:\VisionQA\runs\discovery_pilot_v0.2\`

### 输出

本报告给出逐条 ER 覆盖、数据边界检查、缺陷、复验清单和 `GO / HOLD`。

### 验收标准

1. ER-01..ER-09 无遗漏。
2. 试点样本只能来自 `DEVELOPMENT_REFERENCE`。
3. 客户图零复制、零移动、零上传、零未授权展示。
4. 没有真实访谈/报价/付款时，对应计数必须为 0，不得伪造。
5. 每个指标都能追溯到原始事件，并具有通过、失败或证据不足时的明确动作。
6. 任一 P0 未关闭时总体裁决必须为 `HOLD`。

## 2. 本轮证据快照

项目不是 Git 工作树，因此本 QA 用 SHA-256 冻结所读输入：

| 资产 | SHA-256 |
|---|---|
| `external_review_decisions.csv` | `60DB27F927FC6DE4B516FF765A2976649121FB7178D0C95A146F62ED86499FA4` |
| `asset_manifest.csv` | `A5EE47D50F1674EC487C406B8E271959A06130F278C34FB2244C423102B148AF` |
| `mvp_discovery_closure_recommendation_v0.2.md` | `FC55CA59B613AFC595F3C737C1557965E918D5BDA89F0DF698CEA597B136835F` |
| `customer_discovery_execution_report_v0.2.md` | `119353636CBF2FD9B9EC8B7C5446003067D6BC3F3732D106D03DD0A74FAA5853` |

现状：

- 外审表 9/9 均为 `GO_FOR_DISCOVERY`。
- reviewer 字段为“投资人+产品负责人（代理外部审查）”；它可作为发现阶段决策输入，但不能宣称为完全独立的外部生产签字。
- `customer_discovery_execution_report_v0.2.md` 明确为  
  `NO_CONTACTS_MADE / NO_INTERVIEWS_COMPLETED / NO_PAYMENT_RECEIVED`。
- `D:\VisionQA\runs\discovery_pilot_v0.2\` 尚不存在，因此目前没有真实会话、审核事件、报价、付款或试点指标可复验。
- 2026-07-31 独立运行 `npm test`：`55/55` 通过。

## 3. 总体裁决

**总体：HOLD。**

当前可 `GO` 的最小范围：

- 不接触图片的问题访谈准备；
- 仅由获授权内部操作员，使用 17 张已选 `DEVELOPMENT_REFERENCE` 做本地、无模型、无外部展示的 dry-run；
- 生成空 schema、校验规则和脱敏模板。

当前必须 `HOLD`：

- 向外部受访者展示 `customer_xiaoyu_v0.1` 的 17 张客户素材；
- 使用任何未进入本 manifest 且未标为 `DEVELOPMENT_REFERENCE` 的参与者自有图片；
- 把计划的 12 次访谈、6 次演示、3 份报价或 1 笔付款写成已完成；
- 真实模型、云存储、遥测、自动发布、生产决策；
- 在未指定外联执行人、联系授权、收款主体与合同/退款口径前，由 Agent 自行外联、报价或收款。

`HOLD` 不是推翻 ER-01..09，而是说明“发现阶段方向已获准”不等于“客户素材外部展示和试点数据包已具备执行证据”。

## 4. ER-01..09 逐条复核

| ER | 外审授权 | 转执行检查 | 当前结果 | 复验门 |
|---|---|---|---|---|
| ER-01 | 只进入高频服饰 AI 图审核团队 | 执行报告限定品牌/零售商与服务商；有最近 30 天、SKU/参考、独立复核和人工终审硬条件 | `PRE-PASS` | 实际账户表必须为空起步；每个合格账户有公开来源、资格事实、反例和 owner；同一组织不重复计痛点票 |
| ER-02 | 本地候选闭环 | 本地 MVP 测试通过；计划记录上下文、人工判断、返工与时长 | `HOLD` | 真实包中每个 review event 可连接 session、sample、feedback；样本来源冲突先关闭 |
| ER-03 | Fixture 不得冒充模型推理 | 两份文档固定 `FIXTURE_REPLAY_NO_MODEL`，并提供逐字披露 | `PRE-PASS` | 6/6 演示均有披露确认；任一未确认即不计数并停止该演示 |
| ER-04 | Gate 优先；上下文缺失不得 PASS | 设计含 `context_complete`、人工 Blocker 与 `context_incomplete_pass_count=0` | `PRE-PASS` | 事件级校验必须 fail closed；缺上下文、披露缺失、已知 Blocker 逃逸任一发生即 `P0_STOP` |
| ER-05 | 87 张素材本地且不上传 | 17 个建议样本已独立核对，17/17 属于 `DEVELOPMENT_REFERENCE`；项目内媒体与 87 个客户 SHA-256 精确匹配数为 0 | `HOLD` | 需要原素材提供方对“外部概念测试展示”的明确授权；需要 pre/post 不移动证明；包中不得含图片或原路径 |
| ER-06 | 人工决定和上下文可追溯 | 设计有 session / sample / review / feedback ID；本地反馈 schema 有 trace、hash、时间、原因 | `HOLD` | 实际 CSV 尚无；返工零轮字段与指标 action map 缺失；localStorage 不能写成正式审计 |
| ER-07 | 自动化测试通过 | 独立实跑 `55/55` 通过 | `PASS` | 每个 run 在开始前重跑；记录源版本、数量、时间和日志摘要；失败即阻止当天试点 |
| ER-08 | WTP 必须诚实 | 报告明确 WTP 为 LOW/VERY_LOW；无联系人、访谈和付款 | `PRE-PASS` | 空包所有真实证据计数必须为 0；只有已确认收到的书面带价提案和真实到账可升级 |
| ER-09 | 不提前扩张 | 自动发布、DAM、多租户、自动改图、视频/3D、新垂直、平台 API、GMV 分成均 HOLD | `PASS` | 异常/需求记录不得自动转工程；只允许重复出现且不越界的闭环缺陷进入复盘 |

## 5. 数据边界独立检查

### 5.1 87 张 manifest

| 检查 | 结果 |
|---|---:|
| 总行数 | 87 |
| `DEVELOPMENT_REFERENCE` | 49 |
| `CALIBRATION_REVIEW` | 19 |
| `EVALUATION_HOLDOUT` | 19 |
| `split_status=PROPOSED_NOT_MATERIALIZED` | 87/87 |
| `usage_scope=internal VisionQA evaluation/benchmark` | 87/87 |
| `external_transfer_policy=GOVERNANCE_GATE_REQUIRED` | 87/87 |
| 原始绝对路径字段/值 | 0 |
| 不符合脱敏 alias 格式 | 0 |

### 5.2 建议 17 张样本

独立按 `asset_id` 回查原 manifest：

- 17/17 唯一；
- 17/17 为 `DEVELOPMENT_REFERENCE`；
- 17/17 为 `PROPOSED_NOT_MATERIALIZED`；
- 17/17 为 `decode_status=OK`；
- 17/17 为 `GOVERNANCE_GATE_REQUIRED`；
- 13 张 `MODEL_PRESENT`、4 张 `PRODUCT_ONLY`；
- 覆盖 8 个 shoot group；
- 全部 `classification_status=PENDING_REVIEW`，不能当 ground truth。

### 5.3 复制/移动/上传

- 对 `D:\VisionQA` 内、排除依赖与构建目录后的 20 个 JPG/PNG/WebP 计算 SHA-256，与 87 个客户 SHA-256 的精确匹配数为 **0**。
- `D:\VisionQA\data\customer_xiaoyu_v0.1\` 只含 README、inventory report 和 manifest，不含图片副本。
- 上述证据可以证明“项目内没有客户原图精确副本”，但**不能单独证明原素材在其未知原位置从未移动**。最终包需要由获授权本地解析器提供 pre/post inventory 摘要或操作员签名证明；该证明不得泄露原路径。
- 当前 manifest 的 usage scope 是内部评估/benchmark，未单独写明可向其他外部企业展示。没有素材提供方的明确演示授权前，17 张只能用于内部 dry-run。

## 6. 发现的缺陷

### P0-01：两份执行资产对演示图片来源定义冲突

`mvp_discovery_closure_recommendation_v0.2.md` 固定 17 张 `customer_xiaoyu` 的 `DEVELOPMENT_REFERENCE`；`customer_discovery_execution_report_v0.2.md` 又要求每位参与者使用自己的 10–20 张已授权图片。

风险：

- 参与者自有图不一定在当前 manifest，更不一定属于 `DEVELOPMENT_REFERENCE`；
- 向其他受访企业展示 `customer_xiaoyu` 素材可能构成跨客户披露；
- 同一试点会混入两套授权和两套 provenance，无法满足“仅 DEVELOPMENT_REFERENCE”。

关闭条件：

1. 明确分成两个互不混用的阶段：
   - 内部 dry-run：仅 17 张 `customer_xiaoyu DEVELOPMENT_REFERENCE`，不向外部受访者展示；
   - 外部概念测试：只用非敏感公共 demo，或为每位参与者建立单独的已授权 manifest 和同等治理门。
2. 本次 `discovery_pilot_v0.2` 若按本 QA 验收，只能引用当前 17 张，不得临时加入参与者图片。
3. 若确需向外部展示 17 张，必须先取得原素材提供方对该展示范围的明确授权证据。

### P0-02：实际试点包尚未落地

缺少 `README.md` 与 7 张 CSV，无法验证样本、真实空值、trace join、异常停止或指标可重算。

关闭条件：生成包后由本 Agent 对行数、外键、枚举、时间、派生指标和零结果状态逐项复验。

### P1-01：没有可复核的“未移动”证据字段

计划要求每日确认 87 张原图数量与原位置未变化，但 `pilot_run_ledger.csv` 没有 inventory digest、pre/post count、location attestation 或 checker 字段。

关闭条件：加入不暴露路径的 `source_inventory_digest_before/after`、`source_file_count_before/after`、`no_move_attested_by`、`attested_at`；任一不一致即停止。

### P1-02：返工零轮字段在文字与 schema 间不一致

文档要求在 `pilot_review_events.csv` 写 `rework_round_count=0`，但该字段不在给出的字段列表中。

关闭条件：补入 `rework_round_count` 并由 `pilot_rework_rounds.csv` 可重算；无真实修订时必须为 0，不能伪造返工。

### P1-03：并非所有指标都有行动路径

Gate 已覆盖 completion、trace、feedback、上下文、known fixture blocker、报价和付款；但 `median/p90 review seconds`、`override_rate`、`prompt_copy_rate`、返工分布等只有解释边界，没有明确的 `GO/HOLD/INVESTIGATE/INVALID` 动作。

关闭条件：在 README 增加 metric action map，至少包含 source、denominator、minimum sample、status、threshold/diagnostic rule、pass action、fail action、insufficient-data action 和 prohibited interpretation。

### P1-04：代理外审不得包装成完全独立外审

外审 reviewer 字段存在“代理外部审查”字样，且 evidence location 指向可变本地文件。

关闭条件：对外表述限定为“代理外审后的发现阶段授权”；真正完全外部审查应另有 reviewer 身份、审查日期、输入 hash 和独立签字。当前授权绝不扩展到生产、真实模型或自动发布。

### P2-01：文件数量表述不一致

建议文档写“7 个试点文件”，实际为 README + 7 个 CSV，共 8 个文件。

关闭条件：统一写成“8 个文件（1 README + 7 CSV）”。

### P2-02：非 Git 项目不能只写 `git_or_source_version`

当前没有 Git commit 可引用。

关闭条件：run ledger 必须记录可复算的 source manifest/report SHA-256 或发布包 digest，不得留空或伪造 commit。

## 7. 所有指标的最低行动路径

最终包至少要实现下表；没有足够样本时必须走“证据不足”，不能补数。

| 指标 | 目标/规则 | 通过动作 | 失败/证据不足动作 |
|---|---|---|---|
| `qualified_sessions` | 问题 Gate 使用独立账户；最终目标 12 次有效访谈 | 达门后才进入概念测试 | 不达门则继续同 ICP 发现或 STOP 定位；不扩新垂直 |
| `completion_rate` | 演示 Gate `>=4/6` 独立完成 | 可进入带价测试 | 2–3/6 只修闭环/表达；<=1/6 停止报价 |
| `fixture_disclosure_rate` | `6/6` | 保持披露 | 任一失败，停止演示并记录 P0 |
| `trace_join_rate` | `100%` | 保留 schema | <100% 阻止汇总，修复数据链后重跑 |
| `feedback_persistence_rate` | `100%` 或有 exception | 可汇总人工反馈 | 缺失即 HOLD；不得把内存/剪贴板当持久化 |
| `context_incomplete_pass_count` | `0` | Gate 通过 | >0 立即停止当日试点 |
| `known_fixture_blocker_escape_count` | `0` | 仅证明 fixture 门禁逻辑 | >0 立即停止；不得推导真实召回率 |
| `external_transfer_detected` | `false / 0` | 保持本地模式 | 任一 true 立即停止、隔离并升级治理 |
| `median/p90_review_seconds` | 只做同流程基线描述 | 样本充分后用于下一轮访谈 | 缺时间戳则该指标 INVALID；不得宣称节省 X% |
| `override_rate` | 诊断人工分歧，不是准确率 | 按原因 taxonomy 复盘 | 异常高/低只触发质性抽查，不改模型结论 |
| `prompt_copy_rate` | 诊断带入返工意愿，不是效率 | 追踪真实采纳/拒绝原因 | 只复制未返工时 rework 仍为 0 |
| 返工分布 | 只记录真实发生，最多 3 轮 | 比较真实流程中断点 | 无修订图或无额外授权时全部为 0 |
| `written_priced_pilot_count` | 至少 3 份且客户确认收到 | 进入商业 Gate | 不足则 WTP 保持 LOW |
| `paid_commitment_count` | 至少 1 笔真实到账 | 才可称早期付费信号 | 0 时不得写“已验证 WTP” |

## 8. 待生成包复验清单

### 文件与空状态

- [ ] 正好 8 个预期资产：1 README + 7 CSV。
- [ ] 首次生成时 sessions、review events、rework、metrics 中没有虚构客户行。
- [ ] `NO_CONTACTS / NO_INTERVIEWS / NO_QUOTES / NO_PAYMENT` 与实际空表一致。

### 样本

- [ ] `pilot_sample_manifest.csv` 正好 17 行、17 个唯一 asset ID。
- [ ] 17/17 可与原 manifest 按 asset ID + alias + SHA-256 精确 join。
- [ ] 17/17 `source_split=DEVELOPMENT_REFERENCE`。
- [ ] calibration/holdout 使用数为 0。
- [ ] 没有 original path、原文件名、图片、缩略图、裁切图、截图。

### 追溯

- [ ] session → review → sample → feedback 外键 100%。
- [ ] 时间单调且 duration 可重算，不接受手填估算。
- [ ] `rework_round_count` 与 rework 表一致。
- [ ] WTP 状态不可由口头兴趣升级为 proposal/paid。

### 安全与停止

- [ ] `evaluation_mode=FIXTURE_REPLAY_NO_MODEL`。
- [ ] `network_policy=LOCAL_ONLY`。
- [ ] npm test 通过且记录真实数量。
- [ ] pre/post inventory digest 和数量一致。
- [ ] 任一 P0 会写 exception 并阻止 `COMPLETED`。

### 指标

- [ ] 每个派生指标能从原始事件重算。
- [ ] 分子、分母、最小样本和空值规则明确。
- [ ] 每项都有通过、失败、证据不足动作。
- [ ] 准确率、Blocker recall、CTR/CVR/GMV、节省比例、自动发布安全全部为 `N/A / NOT_AUTHORIZED`。

## 9. 最终 GO 条件

只有同时满足以下条件，才能把本报告从 `HOLD` 更新为 `GO_FOR_CONTROLLED_DISCOVERY_EXECUTION`：

1. P0-01 图片来源/授权冲突关闭；
2. 实际试点包生成且通过第 8 节全部检查；
3. 17/17 仅 `DEVELOPMENT_REFERENCE`，项目及运行包无客户图片副本；
4. pre/post 证据可支持“未移动”；
5. 所有真实客户/付款表从空数据开始；
6. metric action map 完整；
7. 外联、合同/收款和素材演示授权由有权人明确给出；
8. 对外不把代理外审、fixture、计划指标或价格梯子写成已验证结果。

