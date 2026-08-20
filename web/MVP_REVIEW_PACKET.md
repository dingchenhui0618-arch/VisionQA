# VisionQA v0.5 MVP Review Packet

## 1. Brief and success definition

- `USER-SUPPLIED`：产品负责人无代码经验，具备电商运营经验，能够审核商家痛点、文案和交付结果。
- Target user：服饰电商运营、视觉负责人、AI 出图与审核人员。
- Vertical slice：商品基准与人群 → 素材提交 → 质量评审 → 改图任务 → 外部生成结果回传 → 人工复审 → 营销交付草案。
- Primary metric `PROPOSED`：完成评审的素材中，能够经过一次改图并通过人工复审、进入交付的比例。
- Exclusions：本轮没有接入 Seedream、千问改图或 GPT Image 付费 API；没有真实账号认证；没有真实博主检索；没有客户付款或采用证据。

## 2. Assumption register

- `VERIFIED`：现有 VisionQA 评审、批次、人工改判和测试内核可运行。
- `USER-SUPPLIED`：商家需要更结构化的人群画像、渠道、改图和营销交付。
- `HYPOTHESIS`：把评审、改图复审和营销交付放在同一工作流，会减少运营在多个工具之间的沟通损耗。
- Riskiest assumption：生成后的图片能否稳定保持 SKU 一致性，并达到人工可交付标准。

## 3. Team governance

- 本轮未创建子智能体。当前代码与状态高度耦合，新增代理会增加整合成本。
- Customer Discovery Agent：`NOT RUN`；本轮没有把模拟发现冒充真实访谈。
- 后续独立 QA：在真实改图 Provider 接入并形成可运行结果后再执行，避免只审核 UI 草案。

## 4. Implemented MVP

- 五阶段工作台：`app/workspace.tsx`。
- 人群画像：`app/workspace-overview.tsx`。
- 渠道与素材来源：`app/workspace-intake.tsx`。
- 半自动改图复审：`app/workspace-repair.tsx`。
- 痛点、逐字稿与商业片参考：`app/workspace-growth.tsx`。
- 契约：`contracts/product-expression-v0.1.schema.json`、`repair-job-v0.1.schema.json`、`marketing-delivery-pack-v0.2.schema.json`。

## 5. Reproduction

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 3141
npm test
npm run lint
```

打开 `http://localhost:3141/workspace`，进入内部预览，依次检查五阶段导航。

## 6. Test evidence

- `npm test`：构建、页面、契约、质量规则、模型适配、存储和持久化测试通过。
- `npm run lint`：要求 0 errors / 0 warnings。
- 浏览器：1440px 与 390px 检查；无横向溢出；干净页面控制台 0 errors。
- 真实图像编辑 API：`NOT RUN`。
- 真实客户采用、付款与复购：`MISSING`。

## 7. Customer Discovery — Day 1 — SIMULATED

- `SIMULATION`：运营可能不希望理解模型差异，只希望明确知道哪张图能交付、哪里要改、改后是否误伤商品。
- `NEXT QUESTION`：最近一次 AI 商品图返工中，从发现错误到拿到可交付版本用了多久，主要卡在哪个工具或沟通节点？
- `NEXT QUESTION`：如果只提供评审报告而不提供改图结果，商家是否仍愿意付款？
- Recommendation：`TEST NEXT`，用一个真实 SKU 跑一次“评审—外部改图—回传复审—交付”。

## 8. Minimum feedback loop

`上传素材 → 完成评审 → 建立 Repair Job → 上传改图结果 → 完成人工复审 → 记录是否交付`

- `repair_job_created`：判断问题是否成功进入返工动作。
- `repair_output_uploaded`：判断用户是否能把外部工具结果带回。
- `repair_review_completed`：判断改图候选是否通过四项人工 Gate。
- `delivery_pack_exported`：只代表导出，不代表客户采用。

## 9. Internal review

- Product value：工作流骨架成立，真实改图效果未验证。
- Evidence integrity：未接 API 的 Provider 均显示“未配置”；示例内容保持示例标记。
- Security/privacy：本轮没有新增凭据或外部图片传输。
- Residual high risk：多模型图像一致性、成本、延迟和失败重试均未验证。
- Compatibility boundary：持久化评估结果仍使用历史 `evaluation-result-v0.3` 的商业字段 ID。当前已增加 `product-expression-v0.1` 运行时校验和旧版诚实投影：只迁移具有直接对应证据的字段，其余保持 `NOT_ASSESSABLE`；真实 Qwen 尚未原生返回新六维度，不能宣称已经完成新维度标定。

## 2026-08-20 增量交付：商品表达契约与本地营销智能体

- 实现：`lib/visionqa/product-expression.ts`、`lib/visionqa/agents/local-orchestrator.ts`、`app/api/agent-runs/route.ts` 与营销交付交互界面。
- 证据完整性：智能体只读取用户填写的人群/场景/关注因素、质量问题、锁定属性和商品表达契约；输出附 claim ID，未知事实不补写。
- 运行边界：`LOCAL_RULES_NO_NETWORK`，本轮外部 API 调用、图片上传、模型费用和自动发布均为 0。
- 测试：`npm run test:contracts` 为 34/34；`npm run build` 通过。完整 `npm test` 与浏览器复验在本轮最终 QA 后更新。
- 当前限制：本地规则链能验证编排、追溯和失败关闭，但不能证明大模型生成质量、市场采用或客户付款；这些证据仍为 `MISSING`。
- 外部复核问题：真实模型接入时应只发送结构化事实，还是允许发送商品图；供应商、预算、留存周期和跨境处理边界需用户批准。

### 最终回归证据

- `npm test`：84/84 通过（含生产启动、页面结构、契约示例、智能体失败关闭、质量规则、模型适配、对象存储与持久化）。
- `npm run lint`：0 error / 0 warning。
- 浏览器：内部预览 → 营销交付 → 运行智能体成功；14 条事实可追溯，输出携带 claim ID，控制台 0 error。
- 响应式：390 × 844 下智能体区可见，`scrollWidth 375 <= innerWidth 390`，未发现横向溢出。
- 示例项目没有可评估的新版商品表达结果，因此智能体输出为可审核草案但状态保持 `NEEDS_INPUT`，不升级为可交付结论。

## 2026-08-20 L2 增量审查

- 实现资产：`lib/visionqa/agents/l2-runtime.ts`、`tests/l2-agent-runtime.test.ts`、`AUTHORIZATION_BOUNDARY.md`、本地素材 manifest 工具与工作台工具轨迹。
- 当前活动 Provider：`NON_MODEL_TEST_PROVIDER`；首选外部 Provider 已选择千问百炼，适配器固定 `qwen3.7-plus-2026-05-26`。网络调用、模型推理和费用均为 0，真实模型质量证据仍为 `MISSING`。
- 安全 Gate：仅四项领域工具可调用，最大 6 步；越权工具测试已通过。
- 本地素材证据：`artifacts/local-materials/apparel-main-2026-08-20.json`，66 张 JPG、326,867,895 bytes、0 组 SHA-256 重复；仅记录相对路径和哈希。
- 新 Customer Discovery：`NOT RUN`。本轮是已确认产品方向的工程增量，不能从内部实现推导新市场证据。
- 下一独立判断：确认千问 Key 的本地安全配置、结构化事实数据范围和费用上限；未确认前继续失败关闭。
- 本轮分组回归：界面/契约 13/13、TypeScript 77/77、生产启动 smoke 1/1，共 91/91；构建通过，`npm run lint` 0 error / 0 warning。浏览器确认千问状态为“适配完成 · 等待授权”，390px 与 1440px 均无页面级横向溢出，控制台 0 error。

## 10. Claims-to-evidence

| Claim | Evidence | Verdict | Limitation |
|---|---|---|---|
| 五阶段界面可运行 | build、tests、browser QA | supported | 仅本地原型 |
| Repair Job 可导出并回传结果 | UI 与契约 | supported | 未调用真实生成 API |
| 某个模型最适合服饰改图 | 无 | unsupported | 需要同样本对照 |
| 客户愿意付款 | 无 | unsupported | 需要真实订单 |

## 11. Cost and engineering estimate

以下均为 `PROPOSED` 粗估，不是承诺工期，真实 Provider 文档、额度和返回质量会造成较大波动。

- 当前五阶段原型、契约和半自动闭环：已落地。
- 接入一个真实改图 Provider：约 4–7 个工程日。
- 三 Provider 统一适配、队列、重试、成本记录和对照评测：约 8–15 个工程日。
- 正式账号、对象存储、任务持久化、租户隔离与审计：约 10–20 个工程日。
- 形成可供少量客户使用的私有 Beta：整体约 4–7 周的单人开发量，建议按阶段验收，不一次性投入。

## 12. Security and dependencies

- 不在前端保存 Provider Key。
- 客户图片传输必须有明确授权、私有存储、短时 URL 和删除策略。
- 改图结果必须保存模型、版本、Prompt、输入引用和人工复审记录。

## 13. External review questions

- 商品一致性 Gate 是否覆盖最常见的服饰错误？
- 前后对比是否足以发现非目标区域漂移？
- 痛点和逐字稿是否来自商品事实，而不是模板化想象？

## 14. Cheapest next experiment

选择一个真实 SKU、两张有明确结构错误的 AI 商品图，分别用三种候选模型执行同一 Repair Job。记录一次可交付率、漂移数量、人工用时和成本，再决定第一个正式接入的 Provider。
