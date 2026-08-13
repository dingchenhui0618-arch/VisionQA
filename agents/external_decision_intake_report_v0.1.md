# VisionQA 外部审查决策接入报告 v0.1

> 角色：外部审查决策接入 Lead  
> 日期：2026-07-29  
> 工作边界：只校验和规范化外审决定，不修改业务代码，不配置密钥，不激活外部服务

## 1. 职责、输入、输出与验收

### 职责

- 以原始 CSV 而不是用户摘要作为唯一逐行决策来源；
- 区分“审查已接受/批准”和“执行条件已经满足”；
- 把条件、前置依赖、责任 Agent、当前状态和冲突转为机器可读台账；
- 复核外审引用的旧 UI 问题，避免重复开已关闭缺陷；
- 把 Provider 四项批准合并为不可拆分的激活门；
- 不读取、索取或记录 API key。

### 输入

- `handoffs/MVP_EXTERNAL_REVIEW_v0.1/external_review_decisions.csv`
- `handoffs/MVP_EXTERNAL_REVIEW_v0.1/README.md`
- `agents/cto_mvp_execution_summary_v0.1.md`
- `agents/qa_release_acceptance_report_v0.1.md`
- `agents/dataset_negative_implementation_report_v0.1.md`
- `agents/backend_platform_implementation_report_v0.1.md`
- `agents/model_adapter_implementation_report_v0.1.md`
- `handoffs/controlled_negative_plan_review_v0.1/proposed_variants.csv`
- 当前 `web/app/workspace.tsx` 与相关自动测试

### 输出

- 本报告；
- `handoffs/MVP_EXTERNAL_REVIEW_v0.1/execution_ledger.csv`；
- `PROJECT_STATE.md` 外审接入状态。

### 验收结论

- PASS：原表实际 **15 行、15 个唯一 `decision_id`**；
- PASS：15 行均填写决定，且决定值均属于各行 `allowed_values`；
- PASS：8 个 `CONTROLLED_LOW`、2 个 `UI_UX`、1 个 `PLATFORM_STAGING`、3 个 `MODEL_PROVIDER`、1 个 `DATA_PROCESSING`；
- PASS：CN-007 的“裁切后促销组仍 ≥50% 可见”已固化为硬验收；
- PASS：Inspector 写死和 128/12 计数经当前代码、测试和 QA 证据确认已修复，没有重新开 bug；
- PASS：Provider 四项虽全部 `APPROVE`，但在 staging、数据、预算与运行配置门完成前仍不可激活；
- PASS：交付中没有 API key 或 secret 值。

## 2. 原始决定表事实

用户摘要称“16 行”，但文件中的实际事实是：

| 项目 | 结果 |
|---|---:|
| 数据行 | 15 |
| 唯一 `decision_id` | 15 |
| 空决定 | 0 |
| 非法决定值 | 0 |
| ACCEPT | 10 |
| APPROVE | 5 |
| HOLD / REWORK / REJECT | 0 |

因此执行编排必须按 **15 行**，不能按摘要中的 16 行生成幽灵任务。

## 3. 规范化结论

### 3.1 LOW 受控负例：方向曾获接受，但 7 项工具阻塞、1 项必须返工

原始决定为 8/8 `ACCEPT`。这只批准进入制作与后续盲评，不表示生成图自动成为 LOW gold。

存在一项角色边界冲突：

- 决定表要求“外部创意总监或服饰电商视觉专家”；
- 实际 `reviewed_by` 为“产品负责人（代理外部审查）”；
- 外审回复自身也建议由真人服饰视觉专家 cosign 后再进入 PSD 制作。

因此台账保留原始 `ACCEPT`，但不能把它解释为“当前可以制作”。进入实际制作前，由符合要求的视觉专家完成 cosign。该条件不得由内部制作 Agent 自我签署。

制作 Agent 的执行检查又发现：

- CN-001–CN-007 都要求 PSD 图层级精确变换、文字/数字/商品像素锁定；
- 当前可用 imagegen 无法保证单变量编辑，也不能证明非目标像素未变化；
- 因此 CN-001–CN-007 状态为 `TOOLING_BLOCKED`，禁止用近似生成图替代受控实验。

CN-008 存在更严重的计划事实错误：

- 计划声称 CT-014 右下角存在“立即购买 CTA”；
- 已独立查看 `飞鱼素材库 (14).jpg`，右下角实际为促销价格/折扣信息，没有“立即购买”CTA；
- 外审 `ACCEPT` 是基于错误的计划描述，不能覆盖源图事实；
- CN-008 状态为 `REWORK_REQUIRED`：必须重选确有 CTA 的 parent 或重写符合源图事实的单变量方案，并重新外审，旧 ACCEPT 不继承。

CN-007 另有不可放宽的硬门：

```text
裁切后促销组可见比例 ≥ 50%
```

若低于 50%，该变体必须 `REWORK`，不得进入评分或盲评；原因是它会从“可评分的渠道适配失败”退化为 `NOT_ASSESSABLE`。

### 3.2 UI：桌面基线已接受，旧 bug 不重开

`UI-DESKTOP-001` 和 `UI-MOBILE-001` 均为 `ACCEPT`。

外审条件中提到的两个问题属于陈旧信息：

1. “网格 Inspector 永远显示 asset #1”
   - 当前 `workspace.tsx` 由 `selectedId` 解析 `selected`；
   - Inspector 的编号、分数、门禁、Skill、商业分、问题、Prompt 和审计均消费同一 `selected`；
   - 前端实现报告和独立 QA 均记录实机点击 #005 后从 82/REVIEW 更新为 91/PASS。

2. “筛选计数 128/84/36/8 与 12 张不一致”
   - 当前计数从资产数组动态派生；
   - `rendered-html.test.mjs` 明确断言不得出现旧计数；
   - `PROJECT_STATE.md` 已记录修复。

结论：不重新开这两项 bug。移动端保留一个新的 staging 验收项：真实图片与正式 evaluation 成功态出现后，复核双滚动、Inspector 联动、按钮可达与水平溢出。

### 3.3 Staging D1/R2：获准执行，但不等于已就绪

`STAGING-D1R2-001=APPROVE` 只授权 Platform DevOps Agent 创建隔离 staging 资源。

必须满足：

- 不复用 production D1/R2；
- R2 bucket 私有；
- migrations `0000–0005` 在真实 staging 空库执行；
- 故意制造一次 D1 业务批处理中途失败，并证明零半写；
- 完成幂等重放、版本冲突、追加审计和私有 R2 短期读取 smoke；
- secret 只走运行环境管理；
- 单租户身份仅限 staging，不得引入真实客户生产数据。

当前没有真实资源与 smoke 证据，因此状态为 `CONDITIONAL_EXECUTION`，不能标记 `READY` 或 `PASS`。

### 3.4 Provider：四项批准齐全，但组合激活门未满足

决策层四项已经齐全：

- OpenAI Provider：批准；
- 模型 ID：批准为 `gpt-4o`；
- 付费：批准初始 staging 验证，总预算 ≤50 USD、单批 ≤50 张、并发 ≤3；
- 数据：批准仅发送有权利记录的 `commercial-seed`。

`gpt-4o` 是本次被批准的明确模型 ID。“建议 dated snapshot”不是另一个已批准值，Activation Agent 不得擅自替换；若要改变模型 ID，应新增决策记录。

Provider 只有在以下条件同时有证据时才可激活：

```text
STAGING-D1R2-001 真实验收通过
AND Provider / Model / Paid / Data 四项均批准
AND 成本监控与预算硬停已实现并测试
AND 处理地域、训练退出、ZDR适用状态已确认
AND 短期私有图片 URL 链路已就绪
AND 运行环境显式批准门完整
AND secret 已由授权人员通过 secret 管理配置
```

任何一项缺失时，网络请求次数必须保持 0。当前四项是“决策批准完成”，不是“运行条件完成”，所以统一状态为 `WAITING_COMPOSITE_GATE`。

## 4. CTO 可调度清单

### 可立即执行

- QA Lead：把桌面与移动审美结论冻结为 staging UI 基线；
- Platform DevOps Agent：在已有账号/权限可用的前提下开始隔离 staging D1/R2 资源编排；若账号或资源权限缺失，应立即回报外部依赖，不得伪造资源 ID；
- Dataset Ops Lead：重做 CN-008 parent/操作事实核验并重新提交外审；
- 数据治理 Lead：准备 LOW 制作 cosign 表和盲评验收模板，不生成实际 LOW gold 结论。

### 条件执行

- Controlled Negative Production Agent：CN-001–CN-007 暂停于 `TOOLING_BLOCKED`；只有取得可验证的 PSD 精确编辑能力并完成视觉专家 cosign 后才可制作；CN-007 还必须执行 ≥50% 可见硬门；
- Provider Activation Agent：只能准备配置检查、预算硬停测试和数据治理验证，不能发起真实调用；
- Mobile QA：等真实 staging 图片与 evaluation 成功态后复核双滚动和 Inspector。

### 当前阻塞

- Provider 真实调用：阻塞于 staging 验收、成本硬停、数据账户/地域/ZDR证据、短期私有 URL 以及安全 secret 配置；
- staging “就绪”声明：阻塞于真实 D1/R2 资源和 smoke 证据；
- LOW 制作：CN-001–CN-007 阻塞于 PSD 精确编辑能力；CN-008 阻塞于计划事实返工与重新外审；
- LOW gold 冻结：随后仍阻塞于视觉专家 cosign、PSD 实际制作、单变量 QA 和双人盲评；
- production：仍为 `NO-GO`，本轮没有任何 production 批准。

## 5. 冲突与不越权声明

- 没有把 15 行误报为 16 行；
- 没有把 `ACCEPT/APPROVE` 解释为条件已经满足；
- 没有让外审 ACCEPT 覆盖 CN-008 的源图事实错误；
- 没有使用 imagegen 伪造需要 PSD 单变量编辑证据的受控负例；
- 没有恢复已经关闭的 Inspector/计数缺陷；
- 没有创建 D1/R2、没有配置 Provider、没有发起网络或付费调用；
- 没有读取、索取、记录或输出 API key；
- 没有修改业务代码。
