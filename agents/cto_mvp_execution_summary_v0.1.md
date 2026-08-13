# VisionQA CTO MVP 团队执行摘要 v0.1

> 日期：2026-07-29  
> 编制：产品负责人兼项目经理 Lead  
> 依据：各 Lead 计划、全部 implementation report、独立 QA 发布验收报告  
> 当前结论：`CONDITIONAL_GO_STAGING / NO_GO_PRODUCTION`

## 1. 结论

两波 Agent 工作已经把 VisionQA 从可点击原型推进为**内部受控 MVP 代码候选**：

- 产品范围、技术架构、数据评测边界已形成正式章程；
- evaluation v0.3、商业六项、四 Skill、Gate 和 Repair Prompt 已统一为可执行契约；
- Fixture 与 OpenAI Provider Adapter 代码路径已经建立，真实付费调用仍为 0；
- 后端已具备批次、完整评估、读取、追加式改判和审计的 D1 持久化候选；
- 前端可区分 Fixture、加载、正式结果和失败降级，并接入正式 evaluation/override 接口；
- 全量 Web 验证为 32/32，通过 Python 离线回归 12/12；
- migrations `0000–0005` 可从空库顺序执行，得到 11 张表、4 个幂等唯一索引；
- 本地 production start smoke 已验证 HTML、JS、CSS、字体、关键商品图和 hydration；
- 所有已发现 P1 均已关闭。

这些结果只证明代码候选和本地工程门禁成立。D1/R2 未绑定、真实 Provider 未获批准且未调用、正式 API 成功态未在 staging 闭环、LOW 图片仍为 0，因此生产仍是 No-Go。

## 2. 第一波：决策与架构 Lead

### 2.1 产品负责人兼项目经理 Lead

**职责**

- 冻结 MVP 必须项、排除项、团队角色、里程碑、依赖和外部审查权；
- 处理 v0.3 与旧 PRD 的口径冲突；
- 保证内部验收不能替代用户最终审查。

**输入**

- `PROJECT_STATE.md`；
- 策划书 v0.3、核心纠偏、批次工作流 PRD；
- 商业模板评测结果与现有原型状态。

**输出**

- [`product_program_lead_mvp_charter_v0.1.md`](./product_program_lead_mvp_charter_v0.1.md)。

**验收结果**

- PASS：MVP 范围和非目标明确；
- PASS：八类角色均有职责、输入、输出、验收；
- PASS：M0–M6 和 ER-0–ER-5 已定义；
- PASS：测试 Lead 否决权与用户最终 Go/No-Go 权分离。

### 2.2 技术架构 Lead

**职责**

- 盘点原型到受控 MVP 的技术缺口；
- 冻结模型观察、确定性策略、人工治理三层分离；
- 定义 API、D1/R2、Adapter、幂等、环境和任务依赖。

**输入**

- 产品章程、evaluation v0.2、现有 Web/D1/override 实现；
- 模型、部署、安全和审计要求。

**输出**

- [`technical_architecture_lead_mvp_plan_v0.1.md`](./technical_architecture_lead_mvp_plan_v0.1.md)。

**验收结果**

- PASS：最小架构和执行顺序已冻结；
- PASS：识别商业六项、完整 result_json、模板外键三个契约漂移；
- PASS：明确 D1/R2、真实 Provider、staging 和数据治理为外部依赖；
- PASS：未把线上原型误报为真实评估闭环。

### 2.3 Data & Evaluation Lead

**职责**

- 建立数据治理、受控负例、盲标、评测统计和发布质量的制衡结构；
- 定义 LOW 单变量规范、B0/B1/B2 基准和防泄漏纪律；
- 区分 Adapter 技术资格、业务准确率和生产资格。

**输入**

- Phase 1 商业共识标签与复评指标；
- 53 套购买模板授权边界；
- gates、Skill 映射、商业模板和 evaluation 契约。

**输出**

- [`data_evaluation_lead_mvp_plan_v0.1.md`](./data_evaluation_lead_mvp_plan_v0.1.md)。

**验收结果**

- PASS：五类数据/评测角色和独立权限已定义；
- PASS：8 类 LOW 单变量方向和验收方法已定义；
- PASS：B0/B1 可做研发技术资格，B2 明确阻塞于配对 gold；
- PASS：没有用购买模板推导四 Skill 准确率。

## 3. 第二波：实现与独立验收 Agent

### 3.1 契约与规则运行时实现 Agent

**职责**

- 消除商业六项、Schema、TypeScript、运行时校验和确定性规则漂移；
- 保证 Blocker、分数、Prompt 和未评估语义一致。

**输入**

- 技术架构与产品章程；
- commercial template、gates、Skill mapping、Phase 1 结论；
- v0.1/v0.2 历史契约。

**输出**

- evaluation-result v0.3 和 commercial-template v0.2；
- TypeScript runtime validator；
- Gate、商业分、综合分、Prompt 纯函数和测试；
- [`contract_rules_implementation_report_v0.1.md`](./contract_rules_implementation_report_v0.1.md)。

**验收结果**

- PASS：正式六项指标、权重和分档统一；
- PASS：99 分 Blocker 仍强制 `REJECT`；
- PASS：缺项/不可评估不伪造分数；
- PASS：Repair Prompt 保留来源、锁定项和策略；
- 独立 QA 已纳入 32/32 全量验证。

### 3.2 AI 模型 Adapter 实现 Agent

**职责**

- 建立 Provider-neutral 观察层；
- 提供 Fixture、OpenAI Responses API 路径、重试/超时/错误分类；
- 由本地规则重算所有分数和 Gate。

**输入**

- evaluation v0.3、运行时规则；
- 技术架构和数据评测计划。

**输出**

- providers types/factory/fixture/openai/orchestrator；
- 5 项 Adapter 测试和使用说明；
- [`model_adapter_implementation_report_v0.1.md`](./model_adapter_implementation_report_v0.1.md)。

**验收结果**

- PASS：Fixture 默认不联网、不付费且显式标记；
- PASS：OpenAI 路径有 Provider、付费、数据处理、模型 ID、密钥五重批准门；
- PASS：证据不足降级为 `PARTIAL + REVIEW + null score`；
- PASS：模型输出的自带 Gate/权重不会被消费；
- PENDING：真实 Provider 调用为 0，尚无真实成本、延迟和结果。

### 3.3 后端数据平台实现 Agent

**职责**

- 建立批次、资产、运行、完整结果、改判和审计的追加式持久化候选；
- 保证幂等、乐观锁、租户边界和失败不误报成功。

**输入**

- 技术架构、产品章程；
- evaluation v0.2/v0.3、商业模板 v0.2；
- 现有 D1 schema/migrations 和旧 override API。

**输出**

- migrations `0002–0005`；
- batch/evaluation/evaluation GET/override API；
- D1 repository、runtime validation、治理边界文档；
- [`backend_platform_implementation_report_v0.1.md`](./backend_platform_implementation_report_v0.1.md)。

**验收结果**

- PASS：完整 result_json 可无损保存；
- PASS：batch/evaluation/override 幂等与竞争冲突测试；
- PASS：override 四类记录使用单次 D1 batch 追加；
- PASS：D1 未绑定返回 `503 AUDIT_DB_UNAVAILABLE`；
- PASS：空库 migrations `0000–0005`，11 表、4 个幂等索引；
- PENDING：真实 staging D1 原子性、R2、上传后哈希、删除/导出未验证。

### 3.4 Dataset Ops / Controlled Negative Implementation Agent

**职责**

- 在不修改原素材的前提下准备 8 个 LOW 单变量制作提案；
- 固定来源、权利链、parent、操作、锁定项和禁止副作用；
- 等待外部创意审查后才制作 PSD 变体。

**输入**

- Data & Evaluation 计划；
- 购买模板 manifest、JPG 预览和 RAR/PSD 来源；
- HIGH/LOW 获取 Brief。

**输出**

- 8 行 `proposed_variants.csv`；
- 外部审查 README/checklist；
- [`dataset_negative_implementation_report_v0.1.md`](./dataset_negative_implementation_report_v0.1.md)。

**验收结果**

- PASS（PLAN_ONLY）：8/8 来源、权限、版本、hash、路径和提案审计完整；
- PASS：CN-003 不再新增商品事实；
- PASS：CN-006 不再复制优惠或制造叠加承诺；
- NOT RUN：图片、parent/variant、manifest、盲评和 gold 数量均为 0；
- PENDING：外部逐项 `ACCEPT / REWORK / REJECT`。

### 3.5 前端集成与 UX 状态实现 Agent

**职责**

- 保留 Apple-like 冷静中性视觉和“A 网格为主、B 证据详情”；
- 接入 evaluation v0.3 读取与正式 override；
- 补齐 Fixture/real/loading/fallback、未评估、错误、移动端和可访问性。

**输入**

- 产品章程、技术架构、契约/规则和后端报告；
- evaluation v0.3 与现有工作台。

**输出**

- API client、UI adapter、正式读取/改判集成；
- 状态、响应式、可访问性修正与截图；
- production smoke；
- [`frontend_integration_implementation_report_v0.1.md`](./frontend_integration_implementation_report_v0.1.md)。

**验收结果**

- PASS：Fixture 与真实数据来源不混淆；
- PASS：选中图片、模板、证据、Prompt 全链路联动；
- PASS：正式改判携带版本锁、幂等键和模板快照；
- PASS：桌面与 390×844 Fixture 主流程；
- PASS：本地 production HTML/JS/CSS/字体/图片 200，hydration 可交互；
- PENDING：正式 API 成功态、资产预览和移动双滚动审美需 staging/外部审查。

### 3.6 测试与发布质量 Lead

**职责**

- 独立复现测试、迁移、API 负测、Provider 批准门和 production smoke；
- 记录 P0/P1/P2，给出发布 Gate，不修改业务代码。

**输入**

- 全部计划和 implementation reports；
- 当前 Web/Python 代码、migrations、Fixture、QA 截图。

**输出**

- [`qa_release_acceptance_report_v0.1.md`](./qa_release_acceptance_report_v0.1.md)。

**验收结果**

- PASS：Web 32/32，lint/build 通过；
- PASS：Python 离线回归 12/12（需 `PYTHONPATH=src`）；
- PASS：空库 migrations `0000–0005`；
- PASS：API 400/401/422/503 负测和稳定错误码；
- PASS：五项 Provider 批准门均在 fetch 前拒绝；
- PASS：production 静态资源和 hydration smoke；
- PASS：所有已识别 P1 已关闭；
- `CONDITIONAL GO`：进入 staging 集成；
- `NO-GO`：production、真实模型调用、自动发布。

## 4. 跨团队最终验收

| 验收面 | 结果 | 可声明范围 |
|---|---|---|
| Web 自动化 | 32/32 PASS | 本地代码候选 |
| Python 离线回归 | 12/12 PASS | 离线规则/报告回归 |
| migrations | PASS | 空内存 SQLite 顺序可执行，不代表真实 D1 |
| production smoke | PASS | 本地 production start 静态资源与 hydration |
| 已知 P1 | CLOSED | 当前无开放 P1 |
| LOW 计划 | PASS / PLAN_ONLY | 可交外审，不能称为负例数据集 |
| staging | CONDITIONAL GO | 需外部批准和 D1/R2 资源 |
| 真实 Provider | NO-GO | 需 Provider/付费/数据处理/模型/密钥批准 |
| production | NO-GO | staging 闭环和真实评测均未完成 |
| 自动发布 | NO-GO | 无真实 gold、阈值和危险误放验证 |

## 5. 当前不需要用户做

- 不需要继续寻找或上传更多购买模板；
- 不需要现在提供 PSD；已有 RAR/PSD 路径只在 LOW 提案获批后使用；
- 不需要把 API key 发给任何 Agent 或写入 CSV/文档；
- 不需要批准 production 部署或自动发布；
- 不需要现在确定正式产品名；
- 不需要把 53 套模板解释为真实投放成品；
- 不需要立即准备 20–30 组真实客户 gold；该工作在 staging 与数据处理边界通过后启动更安全。

## 6. 唯一立即外部动作

打开外部审查包：

- [`../handoffs/MVP_EXTERNAL_REVIEW_v0.1/README.md`](../handoffs/MVP_EXTERNAL_REVIEW_v0.1/README.md)
- [`../handoffs/MVP_EXTERNAL_REVIEW_v0.1/external_review_decisions.csv`](../handoffs/MVP_EXTERNAL_REVIEW_v0.1/external_review_decisions.csv)

由用户本人或指定的独立审查者填写决定。不要在聊天中发送 API key。

## 7. 下一批 Agent 触发条件

| 外部决定 | 触发 Agent | 下一任务 |
|---|---|---|
| 至少一条 LOW 为 `ACCEPT` | Controlled Negative Production Agent | 只制作被接受行，生成 parent/variant、manifest、hash 和盲评包 |
| UI 桌面或移动为 `REWORK` | Frontend UX Agent | 只处理外审指出的流程/审美问题并重新做视觉 QA |
| UI 均为 `ACCEPT` | QA Lead | 冻结 Fixture UX 基线，不再做无目标美化 |
| D1/R2 staging 为 `APPROVE` | Platform/DevOps Agent | 创建独立 staging 资源、执行 migration、私有上传和审计 smoke |
| OpenAI Provider、付费、数据处理、模型 ID 全部批准 | Provider Activation Agent | 通过 secret 管理配置，不接触 production，运行授权小样本 |
| staging 有正式 evaluation ID | Frontend + QA | 验证 real 状态、正式改判、跨浏览器审计和资产预览 |
| LOW 图片完成并通过双人盲评 | Evaluation Agent | 执行 B1 parent/variant 方向敏感性评测 |
| 后续有 20–30 组配对 gold | Annotation + Evaluation Agents | 启动 B2；此前不评四 Skill 业务准确率 |

