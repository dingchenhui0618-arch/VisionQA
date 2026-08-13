# VisionQA 国产多模态模型选型报告 v0.1

> 角色：国产多模态模型选型 Lead  
> 核验日期：2026-07-29（Asia/Shanghai）  
> 事实来源：仅使用厂商官方开发文档、官方产品页、官方 API Explorer 和官方服务条款  
> 执行边界：本报告未创建账户、未配置密钥、未执行免费或付费模型调用

## 1. 职责、输入、输出与验收

### 职责

为服饰电商图片质检 MVP 选择首个国产视觉模型及备用模型，核验图像输入、结构化输出、上下文、成本、限流和数据治理边界，并给出不扩大授权范围的 canary 验证方案。

### 输入

- `agents/model_adapter_implementation_report_v0.1.md`
- `agents/data_evaluation_lead_mvp_plan_v0.1.md`
- `evals/baseline_plan_v0.1.md`
- `evals/commercial_template_evaluation_protocol_v0.2.md`
- `handoffs/MVP_EXTERNAL_REVIEW_v0.1/execution_ledger.csv`
- 已冻结的 VisionQA provider-neutral observation、确定性规则、商业六项评分和人工复核流程

### 输出

- 首选 Provider / 精确模型 ID；
- 备用 Provider / 模型 ID；
- 暂不采用项及理由；
- 成本估算方法；
- 数据治理待确认项；
- 5 张以内 canary 方案和验收门。

### 验收标准

- 不凭公开排行榜或营销排名选择模型；
- 所有动态事实带官方链接并注明核验日期；
- 不执行付费调用，不要求用户在聊天中提供 API Key；
- 明确区分“官方文档已确认”和“必须在账户控制台/合同中确认”；
- 模型只输出观察草稿，最终 0–100 分、Gate 和 Repair Prompt 仍由 VisionQA 确定性编排产生。

## 2. 结论

### 首选：阿里云百炼 `qwen3-vl-plus-2025-12-19`

首轮 staging canary 建议采用华北 2（北京）的固定快照：

```text
Provider: aliyun-bailian
Model ID: qwen3-vl-plus-2025-12-19
API: OpenAI-compatible Chat Completions 或 DashScope 多模态生成 API
Mode: non-thinking
Output: response_format={"type":"json_object"} + 本地 JSON Schema 严格校验
```

选择理由：

1. 官方模型页明确支持 `Text + Image + Video` 输入、文本输出、结构化输出；上下文 262,144，最大输出 32,768。
2. 固定快照有利于复现；`qwen3-vl-plus` 浮动别名当前等同于该快照，但不应把浮动别名写入基准结果。
3. 官方结构化输出文档明确把 Qwen3-VL-Plus 系列列入 JSON mode 支持范围。
4. 华北 2 官方原价在输入不超过 32K 时为输入 1 元/百万 tokens、输出 10 元/百万 tokens，适合 3–5 张小样本试验。
5. 官方隐私说明明确称调用数据不会用于模型训练；但同时明确因法律法规要求会存储模型与应用调用数据。因此它不是公开文档意义上的 ZDR，必须把留存周期和删除边界作为账户/合同确认项。

首选并不代表已经批准激活。只有新的国产 Provider 外审决策、staging 就绪、数据处理确认、预算硬停和 secret 配置全部满足后才能产生网络请求。

### 备用：智谱 `glm-4.6v`

```text
Provider: zhipu-bigmodel
Model ID: glm-4.6v
API: https://open.bigmodel.cn/api/paas/v4/chat/completions
Mode: thinking disabled 或由 canary 固定为单一模式
Output: response_format={"type":"json_object"} + 本地 JSON Schema 严格校验
```

备用理由：

1. 官方文档明确支持图像、视频、文本、文件输入及文本输出，上下文 128K。
2. 官方能力说明直接覆盖商品属性识别、广告素材分析、商品质控、缺陷检测和 Image2Prompt，与 VisionQA 的商品图分析及 Repair Prompt 场景高度相关。
3. 官方 Chat Completions 示例直接使用 `model="glm-4.6v"` 和 `image_url`，也支持 Base64 图片。
4. 官方结构化输出只确认 `json_object`，没有在已核验资料中确认严格 JSON Schema。因此必须保留本地 validator、一次格式修复上限和 `INVALID_OUTPUT` 记账。
5. 官方服务协议称用户数据归用户所有，除提供服务所必需外不做未授权使用，并在最小必要范围内存储；但未公开给出 API 请求的具体留存天数、ZDR、处理地域或不可变模型快照。因此作为备用交叉验证更稳妥，不先作为唯一基准。

### 暂不作为首轮默认：火山方舟豆包

候选在线推理模型：

```text
Foundation model: doubao-seed-2-0-pro
Candidate online model ID: doubao-seed-2-0-pro-260215
```

官方 API Explorer 在 2026-07-29 可查到基础模型 `doubao-seed-2-0-pro` 及版本 `260215`；官方产品页给出的 Doubao-Seed-2.0-pro 起始价格为输入 3.2 元/百万 tokens、输出 16 元/百万 tokens，并将其列为支持多模态视觉理解的模型。

暂缓理由不是视觉能力不足，而是以下证据未闭环：

1. 官方公开的“豆包模型客户数据授权规则”在用户同意该授权时，允许为模型优化、开发等目的传输、存储和使用客户数据，授权可为长期且已使用部分在技术上无法撤回。账户是否已勾选、能否保持未授权或已终止，必须由账户管理员在控制台和合同中确认。
2. 本轮未在官方 API 文档的可读取内容中确认该在线模型对 `json_schema` 或 `json_object` 的精确支持边界。
3. 在线推理实际可用的 dated model ID、默认限流和账户配额应以方舟控制台返回为准；不能把 Coding Plan 的模型名、价格和调用入口误用于在线推理。

只有完成账户数据授权状态核验、API 输出格式 canary 和精确在线模型 ID 核验后，豆包才可进入同等级候选。

## 3. 官方能力对照

| 项目 | 百炼 Qwen3-VL-Plus 快照 | 智谱 GLM-4.6V | 方舟 Doubao-Seed-2.0-pro |
|---|---|---|---|
| 推荐状态 | 首选 | 备用交叉验证 | Hold |
| 建议模型 ID | `qwen3-vl-plus-2025-12-19` | `glm-4.6v` | `doubao-seed-2-0-pro-260215`，需控制台复核 |
| 图像输入 | 官方确认 | 官方确认，URL/Base64 示例齐全 | 官方产品/图片理解文档确认 |
| 文本输出 | 是 | 是 | 是 |
| 上下文 | 262,144；输出 32,768 | 128K；模型概览列最大输出 32K | 本轮可读官方页面未得到精确值，控制台核验 |
| JSON | 官方确认 JSON mode | 官方确认 `json_object` | 未闭环 |
| 严格 JSON Schema | 官方文档提供“以 Schema 提示 + 本地校验”的实践；API 参数是 `json_object` | 未确认，只按 JSON object 使用 | 未确认 |
| 固定快照 | 有 dated snapshot | 文档只给模型别名，未确认 immutable snapshot | 有 dated ID 候选，需控制台确认 |
| 官方公开价格 | ≤32K：输入 1 / 输出 10 元每百万 tokens | 价格页需登录/控制台核验；不可在报告中猜测 | Pro 起：输入 3.2 / 输出 16 元每百万 tokens |
| 公开户级限流 | 快照：60 RPM / 100K TPM | 未在公开模型页给固定配额 | 未在可读模型页闭环 |
| 训练使用 | 官方称不会将数据用于模型训练 | 服务协议称不做未授权使用；匿名化数据条款需法务复核 | 若接受客户数据授权规则，可用于模型优化等 |
| 留存 / ZDR | 明确会依法存储；周期和 ZDR 未公开 | 最小必要存储；具体周期和 ZDR 未公开 | 必须核验账户授权、留存和删除 |
| 处理地域 | 可明确选择华北 2（北京） | API 域名明确，具体数据处理地域仍需合同确认 | 方舟在线入口为北京，实际处理边界需合同确认 |

## 4. 为什么不把模型直接当“评分器”

三个候选都只应实现相同的 `VisionProviderAdapter`：

```text
图片 + 场景模板 + 只读评分 rubric
  -> Provider observation draft
  -> JSON parse / local schema validation
  -> evidence completeness check
  -> VisionQA 固定六项权重重算
  -> 四大 Skill 重算
  -> Blocker / Gate
  -> evidence-bound Repair Prompt
  -> evaluation-result v0.3
```

Provider 不得决定：

- 最终 `PASS / REVIEW / REJECT`；
- 六项权重；
- `≥90` 阈值；
- Blocker 是否被高分抵消；
- 没有证据时的默认分；
- Repair Prompt 是否可直接投产。

模型需要返回：观察项、严重度建议、证据文字、可选区域坐标、六项原始子分建议和修复动作草稿。最终综合分与决策由本地规则重算。

## 5. 成本估算方法

### 百炼首选的预算公式

华北 2、单次输入不超过 32K 时：

```text
单图成本（元）
= input_tokens / 1,000,000 × 1
+ output_tokens / 1,000,000 × 10
```

示例仅用于预算，不是实测：如果一张图连同 prompt 共计 4,000 输入 tokens，返回 2,000 输出 tokens，则约：

```text
0.004 + 0.020 = 0.024 元/图
5 张一次运行约 0.12 元
5 张 × 3 次重复约 0.36 元
```

图像 token 会随分辨率和供应商计数方式变化，所以真实 canary 必须记录 provider `usage`，不能把上述假设写成实际成本。若启用思考模式，思维链/输出 token 可能显著增加；首轮固定非思考模式。

### 预算硬门建议

- 首批 5 张，每张最多 3 次重复；
- 单批最多 15 次请求；
- 并发 1，待稳定后才申请提升；
- staging 预算硬停建议 20 元人民币；
- 预计成本超过剩余预算时必须在 `fetch` 前失败；
- 不自动续费、不使用浮动 `latest` 模型、不静默改用更贵模型；
- 记录 token、成本、延迟、request ID 和实际 model 字段，不记录密钥或长期图片 URL。

智谱和豆包的成本必须从账户价格页读取后写入单独配置，未获得控制台证据前不得填默认值。

## 6. 3–5 张 canary

建议使用 5 张已有授权的 commercial-seed，只用于 staging，不引入客户生产数据：

| Canary | 选择目的 | 预期检查 |
|---|---|---|
| `CT-030` | 完整且商业表现较强 | 能给出中高区间六项分数；不虚构硬缺陷；证据具体 |
| `CT-012` | 促销信息层级拥挤 | 应识别 promotion hierarchy 短板并生成可执行降噪 Prompt |
| `CT-024` | 无模特、产品平铺 | 不应把“无模特”误判为人体缺陷；可指出 click motivation 风险 |
| `CT-044` | 更像非促销渠道主图 | 应优先给 `NOT_APPLICABLE` 证据，不能硬打低分 |
| `CT-035` | 信息/主体条件不足的边界图 | 应进入 `NOT_ASSESSABLE` 或人工复核，禁止静默 PASS |

### 每张请求的最小输出

- `assessability` 与理由；
- 观察到的商品、人物、文字和促销元素；
- issue code、severity、evidence；
- 六项原始建议分，各项必须有证据；
- 不确定项；
- Repair Prompt 草稿，必须引用已观察证据，不得改变商品事实。

### Canary 验收门

只有全部满足才进入 15 张研发锚点，不等于 production Go：

1. 5/5 返回可解析 JSON；
2. 5/5 通过本地 evaluation-result v0.3 validator；
3. 缺证据分数自动降为 `null`，不得被填充；
4. `CT-044` 不被强制套入促销评分；`CT-035` 不得 PASS；
5. 0 次模型自报 Gate 直接覆盖本地 Gate；
6. 0 次 Blocker 被综合高分抵消；
7. 5/5 Repair Prompt 包含具体动作、约束和不可变项，且无商品事实幻觉；
8. 每次保存 provider、实际模型字段、adapter/prompt/schema/rule 版本、token、成本、延迟和 request ID；
9. 失败、429、超时和 invalid output 全部入账，不挑最好的一次展示；
10. 同图三次重复后的 decision 一致性和 issue 集合 Jaccard 进入正式评测报告。

## 7. 激活前的数据治理缺口

### 三家共同必须确认

- 创建独立 staging 项目/业务空间和最小权限子账号；
- API Key 只进入 secret manager，不进入聊天、CSV、日志、数据库或前端 bundle；
- 明确图片处理地域、跨境情况、子处理者和数据删除机制；
- 明确请求正文、图片、响应、滥用/安全日志的具体留存时间；
- 确认调用输入和输出是否用于基础模型训练、人工审核或产品改进；
- 图片仅用短期私有 URL 或官方确认不会持久化的 Base64 路径；
- 禁止客户生产数据和 PII 进入首轮 canary；
- 保存合同/控制台截图的哈希或审查引用，不保存密钥。

### 百炼特有

- 公开资料明确“不用于训练”，但也明确会依法存储调用数据；需账户负责人确认具体留存期、删除和是否有企业级零留存能力；
- 确认业务空间为华北 2（北京），API Key 与 region 一致；
- 确认该账户确实可调用 `qwen3-vl-plus-2025-12-19`，并记录控制台价格和限流。

### 智谱特有

- 确认 `glm-4.6v` 是否会滚动升级、响应是否返回可追溯 model revision；
- 确认 API 请求的准确留存周期、处理地域和是否存在企业零留存选项；
- 价格和 RPM/TPM 必须从已登录控制台留证；
- 用户协议关于匿名化研究/模型训练的条款需要数据责任人或法务确认与业务数据条款的适用边界。

### 豆包特有

- 检查账号是否接受了“豆包模型客户数据授权规则”；若接受，确认是否可以终止新数据授权并取得书面/控制台证据；
- 未消除该授权风险前，不发送 commercial-seed；
- 在线推理模型 ID、JSON mode、RPM/TPM、输入图片限制和账单价格全部用控制台/API Explorer 留证；
- 不使用 Coding Plan 入口替代在线推理 API。

## 8. CTO 调度建议

1. 先由外部审查角色把原 OpenAI 四项批准作废/替换为国产 Provider 决策，不沿用旧决定。
2. 首选申请：百炼华北 2 + `qwen3-vl-plus-2025-12-19` + 20 元 canary 上限。
3. Provider Adapter Agent 新增 `aliyun-bailian` adapter；复用 provider-neutral envelope、重试和本地 validator。
4. Security/Data Agent 完成留存、训练使用、地域、短期图片 URL 和 secret 证据。
5. QA Agent 先做所有批准门缺失时 `fetch=0`，再经明确授权运行 5 张 canary。
6. 若首选 schema-valid、证据或稳定性不达标，再以相同输入、相同 prompt、相同本地规则运行 `glm-4.6v` 交叉验证。
7. 豆包只在数据授权状态和在线 API 能力闭环后进入下一轮，不与首轮并行付费。

## 9. 官方资料

### 阿里云百炼

- [qwen3-vl-plus 模型信息](https://help.aliyun.com/zh/model-studio/qwen3-vl-plus)
- [千问结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)
- [百炼模型推理价格](https://help.aliyun.com/en/model-studio/model-pricing)
- [百炼合规资质与隐私说明](https://help.aliyun.com/zh/model-studio/privacy-notice)
- [百炼权限管理](https://help.aliyun.com/zh/model-studio/permission-management-overview)

### 智谱

- [GLM-4.6V 模型与 API 示例](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-4.6v)
- [模型概览](https://docs.bigmodel.cn/cn/guide/start/model-overview)
- [结构化输出](https://docs.bigmodel.cn/cn/guide/capabilities/struct-output)
- [对话补全 API](https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E5%AF%B9%E8%AF%9D%E8%A1%A5%E5%85%A8)
- [服务协议](https://docs.bigmodel.cn/cn/terms/service-agreement)
- [用户协议](https://docs.bigmodel.cn/cn/terms/user-agreement)

### 火山方舟

- [火山方舟模型列表（登录控制台前的官方入口）](https://docs.volcengine.com/docs/82379/1330310)
- [模型服务价格](https://docs.volcengine.com/docs/82379/1544106)
- [图片理解](https://docs.volcengine.com/docs/82379/1362931)
- [豆包官方产品与公开价格](https://www.volcengine.com/product/doubao/)
- [基础模型版本 API Explorer](https://api.volcengine.com/api-explorer/?action=ListFoundationModelVersions&groupName=%E5%9F%BA%E7%A1%80%E6%A8%A1%E5%9E%8B&serviceCode=ark&version=2024-01-01)
- [豆包模型客户数据授权规则](https://www.volcengine.com/docs/82379/1359327)

## 10. 当前决策状态

```text
技术选型：Qwen3-VL-Plus snapshot = RECOMMENDED
备用选型：GLM-4.6V = QUALIFIED_FOR_BACKUP_CANARY
豆包：HOLD_PENDING_DATA_AND_API_VERIFICATION
真实网络调用：0
付费：0
Production：NO-GO
Staging canary：WAITING_NEW_EXTERNAL_APPROVAL_AND_ACCOUNT_EVIDENCE
```

