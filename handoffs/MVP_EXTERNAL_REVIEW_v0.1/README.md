# VisionQA MVP 外部审查包 v0.1

> 日期：2026-07-29  
> 当前 Gate：`CONDITIONAL_GO_STAGING / NO_GO_PRODUCTION`  
> 目的：把必须由用户或独立外部角色决定的事项集中为一次审查  

## 1. 你只需要做什么

请打开同目录的 [`external_review_decisions.csv`](./external_review_decisions.csv)，在每一行填写：

- `decision`；
- `decision_reason`；
- `conditions`（可留空）；
- `reviewed_by`；
- `reviewed_at`。

如果不同事项由不同人审查，可以把同一 CSV 分发给对应角色，最后合并回原表。不要修改 `decision_id`、对象、证据路径或允许值。

## 2. 决定分为四组

### A. 8 项 LOW 受控负例计划

审查角色：外部创意总监或服饰电商视觉专家。

逐项只能填写：

- `ACCEPT`：这个操作能够形成真实、可理解的单一商业失败，可以进入 PSD 制作；
- `REWORK`：方向合理，但操作、程度或锁定项需要修改；
- `REJECT`：不应制作，原因可能是粗暴破坏、并非商业失败、会引入商品事实错误或无法保持单变量。

证据入口：

- [`../controlled_negative_plan_review_v0.1/README.md`](../controlled_negative_plan_review_v0.1/README.md)
- [`../controlled_negative_plan_review_v0.1/proposed_variants.csv`](../controlled_negative_plan_review_v0.1/proposed_variants.csv)
- [`../controlled_negative_plan_review_v0.1/external_review_checklist.md`](../controlled_negative_plan_review_v0.1/external_review_checklist.md)

当前只有计划，没有生成任何 LOW 图片。未标 `ACCEPT` 的行不会进入制作。

### B. UI 桌面与移动端

审查角色：用户/创意总监，可邀请独立 UX 评审者。

逐项填写：

- `ACCEPT`：当前审美和流程可作为 staging 基线；
- `REWORK`：写明需要调整的区域、原因和目标；
- `REJECT`：只有整体方向不可用时选择。

请检查：

- 桌面：信息层级、Apple-like 冷静中性审美、网格与证据详情、Fixture/真实来源提示；
- 移动：390px 双列网格、Inspector、上下双滚动区、按钮可达与信息发现性。

视觉证据：

- [`../../runs/frontend_qa_v0.1/fixture-desktop-1440x900.png`](../../runs/frontend_qa_v0.1/fixture-desktop-1440x900.png)
- [`../../runs/frontend_qa_v0.1/fixture-mobile-390x844.png`](../../runs/frontend_qa_v0.1/fixture-mobile-390x844.png)
- [`../../runs/frontend_qa_v0.1/api-fallback-desktop-1440x900.png`](../../runs/frontend_qa_v0.1/api-fallback-desktop-1440x900.png)

### C. D1/R2 staging

审查角色：用户/CTO/数据责任人。

填写：

- `APPROVE`：允许创建并绑定**独立 staging** D1/R2，用于迁移、私有资产和审计闭环验证；
- `HOLD`：暂缓，写明缺少的账号、预算、安全或保留条件；
- `REJECT`：否决当前方案。

批准 staging 不等于批准 production。Agent 不得复用生产数据库，也不得把 bucket 设为公开。

### D. OpenAI Provider、付费与数据处理

审查角色：用户/预算责任人/数据责任人。

必须分别决定：

1. 是否允许把 OpenAI 作为首个真实 Provider；
2. 具体模型 ID；
3. 是否允许 staging 小样本产生付费调用及预算上限；
4. 当前已授权购买模板是否允许发送给该 Provider，并确认留存/训练/地域/ZDR 限制。

只有四项全部批准，Provider Activation Agent 才能启动。API key 只能通过 secret 管理配置，**不要写进 CSV、文档或聊天**。

## 3. 当前证据边界

内部已经独立验证：

- Web 32/32；
- Python 离线回归 12/12；
- migrations `0000–0005` 空库顺序执行；
- 本地 production start 静态资源和 hydration smoke；
- 当前无开放 P1。

仍未验证：

- 真实 staging D1/R2；
- 正式 API 成功态和跨浏览器审计；
- 真实 OpenAI 调用、成本和延迟；
- LOW 图片及其盲评；
- 四 Skill 真实业务准确率；
- production 与自动发布。

## 4. 现在不需要做

- 不需要提供更多购买模板或 PSD；
- 不需要提供 API key；
- 不需要批准 production 或自动发布；
- 不需要现在准备 20–30 组真实客户 gold；
- 不需要确定正式产品名。

## 5. 返回方式

填写完成后，将 `external_review_decisions.csv` 返回项目。CTO 会按行触发对应 Agent；任何 `HOLD / REWORK / REJECT` 都会保留为正式审查结果，不会被内部 Agent 改成通过。

