# VisionQA Customer Discovery v0.1

版本日期：2026-07-30  
状态：`HYPOTHESIS_ASSET / NO_EXTERNAL_INTERVIEWS / READY_FOR_VALIDATION`

## 角色契约

### 职责

Customer Discovery Agent 每天围绕三问工作：

1. 哪些企业真的痛？
2. 他们现在怎么解决？
3. 多少钱愿意买？

本轮职责是把项目现有证据、87 张客户素材和公开市场信息转成可验证的 ICP、替代方案、付费意愿和 MVP 回灌假设。不得冒充真实访谈、真实报价、真实成交或真实业务效果。

### 输入

- 产品定义、PRD、状态与治理基线：
  - `D:\VisionQA\AI视觉质量评估系统_策划书_v0.3.md`
  - `D:\VisionQA\docs\07_批次审核工作流_PRD_v0.1.md`
  - `D:\VisionQA\docs\08_核心产品纠偏决定_v0.1.md`
  - `D:\VisionQA\docs\10_商业价值模板化决策_v0.1.md`
  - `D:\VisionQA\PROJECT_STATE.md`
- 客户素材只读盘点：
  - `D:\VisionQA\data\customer_xiaoyu_v0.1\README.md`
  - `D:\VisionQA\data\customer_xiaoyu_v0.1\inventory_report.md`
  - `D:\VisionQA\data\customer_xiaoyu_v0.1\asset_manifest.csv`
- 公开一手/可信信息：Google Merchant Center、Amazon Seller Central、Pixelz、Filestage、Adobe Workfront、McKinsey 公开页面。
- 当前日期可见的公开价格仅用于替代方案锚点，不代表中国客户愿意支付同等价格。

### 输出

| 文件 | 用途 |
|---|---|
| `daily_questions.md` | 每日三问与 14 天发现节奏 |
| `icp_pain_matrix.csv` | 4 类 ICP 的痛点、当前方案和触发条件 |
| `current_alternatives.md` | 现有替代方案、优劣与可替代边界 |
| `wtp_hypotheses.csv` | 不虚构的价格区间假设与验证门槛 |
| `interview_script.md` | 30–40 分钟问题访谈及价格敏感度方法 |
| `mvp_iteration_recommendations.md` | 第二轮工程回灌优先级 |

### 验收标准

- 至少 3 类企业 ICP，逐类回答“三问”。
- 所有痛点和价格均标记为事实、推断或待访谈假设。
- 有可执行的价格敏感度访谈与付费试点方法。
- 明确 MVP 必须改、暂缓、需客户验证项。
- 形成不阻塞真实模型闭环、可独立交给工程 Agent 的优先级清单。

本轮已满足以上资产验收；尚未满足“客户问题已证实”或“客户愿意付费已证实”。

## 核心结论

### 哪些企业更可能真的痛

当前最值得优先验证的是：

1. **每周处理大量服饰 AI 模特图、有独立审核人的品牌/零售商**；
2. **同时服务多品牌、靠交付速度与返工率赚钱的 AI 内容工作室/电商摄影与代运营机构**；
3. **同时经营多个渠道、需要在发布前满足平台图片规则的跨境服饰卖家/运营服务商**；
4. **已有素材审批或 DAM 工作流、但缺少服饰 AI 图专业判断的内容平台/ISV**。

“服饰企业”本身不是充分条件。真正的资格条件应是：**高频批量、重复人工复核、返工链条、错误有明确成本、能提供候选图与参考图配对、愿意保留人工终审**。

置信度：`MEDIUM`。前三类与现有产品范围和公开规则一致，但尚无完成的问题访谈；第四类销售周期长，优先级最低。

下一验证动作：先约 5 家品牌/零售商和 5 家机构，不按公司知名度筛选，按“最近 30 天是否发生过批量 AI 图审核与返工”筛选。

### 他们现在怎么解决

最可能的替代方案组合是：

- 人工逐张查看 + 即时通讯/表格记录；
- 设计师或外包修图团队返工；
- 在线 proofing / DAM 工具管理版本和审批；
- 平台上传后的规则诊断或自动修图；
- 模型提供方自带的安全检测或生成后抽检。

公开事实证明“平台规则会导致图片被拒”和“市场上有人按图收费做电商图后期、按月收费做审批工作流”；但“目标客户当前具体使用飞书/Excel/Photoshop多少小时”仍是待访谈假设。

置信度：`MEDIUM-LOW`。

下一验证动作：每次访谈必须重建一个最近批次，从收到图片到发布逐步画出人员、工具、耗时、返工和最终责任人。

### 多少钱愿意买

当前没有真实付费意愿证据。`wtp_hypotheses.csv` 中的区间仅是用于访谈和报价实验的价格梯子：

- 品牌/零售商：付费试点 `¥3,000–8,000`，稳定期假设 `¥2,000–6,000/月`；
- 机构/工作室：付费试点 `¥5,000–15,000`，稳定期假设 `¥5,000–15,000/月`；
- 跨境卖家/运营商：付费试点 `¥2,000–6,000`，稳定期假设 `¥1,500–5,000/月`；
- 平台/ISV：集成试点 `¥20,000–80,000`，仅在 API、隔离和审计闭环后验证。

这些区间不能写入销售承诺。只有以下行为才升级为高置信度：

1. 客户给出当前成本和采购流程；
2. 客户接受具体价格档而不是口头说“有兴趣”；
3. 客户签署有金额的试点订单、支付定金或进入真实采购；
4. 试点中真实使用并复购。

置信度：`LOW`。

下一验证动作：完成至少 12 次问题访谈，其中 6 次进入概念测试，争取 3 份有明确金额和付款条件的付费试点提案，至少 1 次真实付款。

## 证据分级

| 等级 | 含义 | 本轮例子 |
|---|---|---|
| `FACT_LOCAL` | 项目内可复核事实 | 87 张 JPG 均可解码；75 张初判含模特；当前无 gold、无真实投放绩效 |
| `FACT_PUBLIC` | 公开来源明确陈述 | Google 违规图片可被拒；Pixelz 和 Filestage 的公开价格 |
| `INFERENCE` | 从事实推导，仍需客户证实 | 发布前检查可减少上传后返工 |
| `HYPOTHESIS` | 尚无直接证据 | 目标客户愿付某一人民币区间 |

## 公开来源

- [Google Merchant Center 图片要求](https://support.google.com/merchants/answer/6324350?hl=en)：图片不满足要求会被拒；需准确展示商品，禁止多类覆盖元素；生成式 AI 图片需保留相关元数据。
- [Google Merchant Center 自动图片改进](https://support.google.com/merchants/answer/12724659?hl=en)：平台可移除文字、水印、覆盖层或 Logo 以尝试恢复批准。
- [Amazon Seller Central 图片要求](https://sellercentral.amazon.com/seller-forums/discussions/t/13af96ea-6b07-4bf9-8dbe-a13292c2e3b1)：主图需专业、清晰、准确展示实际商品，并限制文字、图形和水印。
- [Pixelz 公开价格](https://www.pixelz.com/pricing/)：电商图片后期存在按月订阅 + 按图收费的采购习惯。
- [Filestage 公开价格](https://filestage.io/pricing/)：内容审批工具存在免费、`€199/月`、`€329/月`和企业档，支持版本对比、审批和 review agents。
- [Adobe Workfront 方案](https://business.adobe.com/products/workfront/pricing.html)：企业内容工作管理已提供 review/approval、版本、移动 proofing 和签核。
- [McKinsey 2025 AI 调研](https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai/)：AI 在营销销售中使用广泛，但多数企业仍处于试验或试点阶段；不能由此推断 VisionQA 的需求或付费。

## 证据、置信度、下一动作

- 证据：本目录各文件均引用本地项目事实或公开链接，并对推断和假设单独标记。
- 总体置信度：`MEDIUM-LOW`。ICP 方向有支撑，痛点频率、购买人和价格仍未验证。
- 下一动作：按 `daily_questions.md` 执行 14 天节奏，并将真实访谈逐条写入新的、带日期和匿名受访者编号的研究日志；不得回写虚构结果到本版本。
