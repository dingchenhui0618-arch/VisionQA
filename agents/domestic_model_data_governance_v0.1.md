# VisionQA 国产视觉模型数据治理审查 v0.1

> 角色：国产模型数据治理 Lead  
> 日期：2026-07-29  
> 工作边界：仅审查公开官方文件与项目内授权记录；未创建账号、未读取或记录密钥、未调用模型、未发生付费。

## 1. 职责、输入、输出与验收

### 职责

- 把原 OpenAI 路线中的 `store:false + opt-out training + ZDR + region` 要求，替换为国内厂商可举证、可审计且不更宽松的控制组合；
- 区分“官网可确认”与“必须由企业账户管理员、厂商工单或合同确认”；
- 阻止把“不用于训练”误写成“零留存”；
- 明确哪些数据允许进入国产 Provider，哪些必须留在本地。

### 输入

- `datasets/commercial_template_seed_v0.1/manifest.json`
- `datasets/commercial_template_seed_v0.1/README.md`
- `agents/external_decision_intake_report_v0.1.md`
- `handoffs/MVP_EXTERNAL_REVIEW_v0.1/external_review_decisions.csv`

### 输出

- 本报告；
- 国产 Provider 激活组合门；
- 禁止发送的数据清单与 secret 管理规则。

### 验收结果

- PASS：所有外部事实仅引用厂商官方文档、官方协议或官方控制台说明；
- PASS：没有记录 API Key、AccessKey、SecretKey、Token 或账号凭据；
- PASS：没有执行真实或付费调用；
- PASS：明确说明“不训练 ≠ 零留存”；
- PASS：给出原 ZDR 条件在国内路线中的等价证据要求。

## 2. 项目数据授权边界

项目负责人已确认 53 套购买模板：

- 可用于 VisionQA 内部研发；
- 可上传第三方视觉模型测试；
- 不是真实投放效果数据；
- 不是四层视觉准确率 gold set；
- 未确认可再分发，源 PSD/RAR 不得公开。

这只解决“VisionQA 是否有权将指定素材用于第三方测试”，不替代 Provider 自身的数据处理、训练、保留、内容审核和跨境合规条件。

### 当前可发送的最小集合

仅限 manifest 中能追溯权利记录的 `commercial-seed` JPG 派生预览，而且必须：

1. 去除本地路径、购买订单、作者/卖家信息和压缩包元数据；
2. 不上传 PSD、RAR、图层结构或未用于本次评测的同包素材；
3. 不包含 API Key、系统环境变量、客户标识、联系人、订单或业务表现数据；
4. 每个请求仅发送完成评测所需的一张图与最小 Prompt；
5. 结果只落 VisionQA 私有 staging，按项目保留策略删除。

## 3. 候选 Provider 官方证据比较

### 3.1 结论矩阵

| Provider | 中国大陆地域 | 公开“不用于训练”证据 | 推理数据留存 | 内容/日志 | 私网或专属资源 | 企业/费用控制 | 治理结论 |
|---|---|---|---|---|---|---|---|
| 阿里云百炼 / 千问 VL | 可明确选华北 2（北京），中国内地部署范围；地域、Key、模型列表不跨区混用 | 官方隐私说明明确“绝不会将您的数据用于模型训练” | 同一说明同时明确会存储模型与应用调用数据；公开页未给出本项目可依赖的精确保留时长 | 平台存在输入/输出安全策略；应用观测可查看最长 30 天 Prompt/输出，但是否适用于纯模型 API、是否默认开启须确认；推理日志回流是另行开启功能 | 有业务空间专属域名、模型级权限、IP 白名单；有资源专享部署，但普通按量推理是否可走 PrivateLink 需确认 | 可按 API Key/空间/模型拆账并设置费用告警；公开说明中的“月度限额”是告警，不应当成每请求硬停 | **首选候选，但仅条件通过** |
| 智谱 BigModel / GLM-V | 隐私政策称境内运营收集的个人信息存储在境内；具体推理 Endpoint 的地域固定性须管理员确认 | 用户协议称除执行服务要求外不会对上传数据作未获授权的使用；服务协议称除提供服务所必需外不作未授权使用披露 | 仅称最小必要范围；上传数据删除后还有“缓冲期”，具体期限以产品文档为准；推理缓存/日志时长未公开明确 | 内容安全、人工访问范围、推理请求日志字段与时长未形成公开可依赖证据 | 官方介绍有专属资源部署；是否支持 Vision 模型、VPC/私网端点和租户隔离须商务确认 | 有余额、资源包、账单导出和按消耗开票；未找到通用 API 项目级硬预算开关证据 | **第二候选，需企业书面补证** |
| 火山方舟 / 豆包视觉 | 官方 DPA 通用条款称默认在中国大陆存储处理；方舟支持 VPC + PrivateLink | **标准《豆包模型数据授权使用协议》不满足**：授权用于模型优化、开发等，且授权永久，已使用数据技术上不可撤回 | 标准授权包含传输、存储、使用、复制、下载、修改；不能视为零留存 | 官方提供安全审计/加密能力，但公开的 180 天日志说明针对精调，不可套用于在线推理 | 支持 VPC + PrivateLink；精调支持 KMS/HYOK，不能自动推定在线视觉推理同等适用 | 有账单中心和按量计费；项目级硬停、发票与上限需管理员/商务确认 | **标准公有云条款 HOLD**；只有企业补充协议明确排除训练和永久授权后再评 |
| 百度千帆 / 视觉模型 | 中国境内服务，但具体 Endpoint/处理地域须管理员确认 | 公开标准用户协议没有可依赖的“推理输入不训练”承诺 | 标准协议称没有义务存储副本；同时明确用户不得提供保密信息、平台对用户内容无保密义务 | 可对自定义接入点配置输入/输出文本与图像安全等级；百度智能云隐私政策说明在获得许可时可能人工审查简短对话片段 | 有自定义接入点和算力单元；Vision 型号能否专属部署与 VPC 路径须确认 | 可终止具体计费项，超过免费资源不再响应；可按 Endpoint 拆账；发票/预算硬停仍需确认 | **标准公有云条款 HOLD**；企业保密/DPA 覆盖前不得发送购买素材 |

## 4. 逐厂商证据与未知项

### 4.1 阿里云百炼：治理首选，但不是公开意义上的 ZDR

公开可确认：

- [合规资质与隐私说明](https://help.aliyun.com/zh/model-studio/privacy-notice) 同时写明“不用于模型训练”和“将存储模型与应用调用时产生的数据”。因此“不训练”不能推导出零留存。
- [地域与接入域名](https://help.aliyun.com/zh/model-studio/regions/) 明确华北 2（北京）对应中国内地部署范围，且各地域 Endpoint、API Key、模型列表不能混用。
- [API Key 管理](https://help.aliyun.com/zh/model-studio/get-api-key) 支持限定可访问模型和 IP 白名单；默认白名单为全网，必须主动收紧。
- [权限管理](https://help.aliyun.com/zh/model-studio/permission-management-overview) 支持业务空间、用户、模型调用与限流管理。
- [应用观测](https://help.aliyun.com/zh/model-studio/application-observation) 可查看最长 30 天的 Prompt 和输出；这证明部分产品形态会保留可读内容，但不能据此断言普通模型 API 恰好保留 30 天。
- [日志回流](https://help.aliyun.com/zh/model-studio/model-log-backflow) 显示推理日志回流需显式开启，且可转为训练/评测集；VisionQA 必须保持关闭。
- [成本管理](https://help.aliyun.com/zh/model-studio/bill-query-and-cost-management) 支持按模型/API Key 查询费用并设置限额告警；告警不是代码侧硬停。

必须由账户管理员或阿里云工单确认：

1. `cn-beijing` 指定千问视觉模型的实际推理与备份处理均在中国内地；
2. 纯模型 API 的请求图片、Prompt、响应、审核副本、故障日志和备份分别保留多久；
3. 能否关闭 Prompt/响应可读日志、应用观测、推理日志回流和人工质量审查；
4. 删除请求的范围、完成 SLA、备份淘汰期与删除证明；
5. 内容安全是否保存原图/缩略图、命中片段及 request ID；
6. 业务空间专属域名是否只是逻辑隔离，是否另有 PrivateLink/VPC 或专属推理可用于选定视觉模型；
7. 企业合同、DPA、保密条款和增值税发票主体；
8. 控制台是否有真正阻止超支的项目级消费上限；没有则由 VisionQA Adapter 自己硬停。

### 4.2 智谱 BigModel：条款方向可接受，保留期和网络隔离证据不足

公开可确认：

- [用户协议](https://docs.bigmodel.cn/cn/terms/user-agreement) 规定用户上传数据归用户所有，除执行服务要求外不作未授权使用及披露；删除后仍有缓冲期，期限以产品文档为准。
- [服务协议](https://docs.bigmodel.cn/cn/terms/service-agreement) 称仅在提供服务和满足合规要求所需的最小必要范围存储，并进行匿名化和加密。
- [隐私政策](https://docs.bigmodel.cn/cn/terms/privacy-policy) 称境内运营产生的个人信息存储在境内，并提供删除申请路径；该政策主要处理个人信息，不能替代企业图像输入的 DPA。
- [平台介绍](https://docs.bigmodel.cn/cn/guide/start/introduction) 列出视觉 API 与专属资源部署。
- [HTTP API](https://docs.bigmodel.cn/cn/guide/develop/http/introduction) 要求保护 API Key 并建议通过环境变量配置。
- [费用说明](https://docs.bigmodel.cn/cn/faq/fee-issues) 支持资源包、余额、账单与删除 API Key 停止调用；[发票说明](https://docs.bigmodel.cn/cn/faq/invoice-issues) 支持按实际消耗开票。

必须补证：

- Vision 模型具体 ID、版本冻结、图片传输方式和输入大小限制；
- 推理图片/Prompt/响应、内容审核、错误日志、备份的逐类留存期；
- 是否用于基础模型训练、质量改进、人工评审；必须取得明确书面“不训练/不人工查看”条件；
- 专属资源是否支持所选视觉模型，是否有 VPC/私网 Endpoint；
- 删除 SLA、备份清理时限、企业 DPA 与保密义务；
- 项目级预算硬停能力。

### 4.3 火山方舟：标准豆包授权与 VisionQA 当前条件冲突

公开可确认：

- 官方[豆包模型数据授权使用协议](https://www.volcengine.com/docs/82379/1359327?lang=zh) 将输入和生成的文本、图片、视频等定义为客户数据；授权目的包括模型优化、开发、使用；授权期限为永久，已使用部分技术上无法撤回；并要求不要提交保密信息或商业秘密。
- 官方[DPA](https://www.volcengine.com/docs/undefined/67493?lang=zh) 的通用地域条款称默认在中国大陆处理，但不能覆盖或取消上述专项数据授权。
- 官方[私网访问文档](https://www.volcengine.com/docs/82379/1339360?lang=zh) 支持 VPC + PrivateLink。
- 官方[精调安全防护](https://www.volcengine.com/docs/82379/1834391?lang=zh) 说明精调日志默认 180 天、精调沙箱任务后销毁；这不是在线推理留存承诺，禁止张冠李戴。

激活前必须由企业补充协议明确覆盖并排除：

- 客户数据用于任何模型训练、优化、评测集积累或人工质量分析；
- 永久、不可撤销的客户数据授权；
- 将购买素材视为“非保密数据”的默认前提；
- 未明确期限的推理、审核与备份留存。

在获得逐条覆盖的签署文件前，方舟网络请求必须保持 0。

### 4.4 百度千帆：标准协议不适合当前购买素材

公开可确认：

- [千帆用户协议](https://cloud.baidu.com/doc/qianfan/s/Mmk5a8wjk) 明确用户不得提供保密信息，且平台对用户内容没有保密义务。
- [百度智能云隐私政策](https://cloud.baidu.com/doc/Agreements/s/Plr0fi68q) 说明在获得许可的前提下可能人工审查大模型调用产生的简短对话片段；是否覆盖企业 API 图片须另行确认。
- [安全策略](https://cloud.baidu.com/doc/qianfan/s/Lmmxhsja8) 支持对自定义 Endpoint 的输入/输出配置文本与图像安全等级，说明内容会进入安全检测链路。
- [计费管理](https://cloud.baidu.com/doc/qianfan/s/Dmh4su5wb) 可终止具体计费项，终止后超过免费资源的调用不再响应；[成本拆分](https://cloud.baidu.com/doc/qianfan/s/5mnelz9im) 可按自定义 Endpoint 拆账。

只有签署企业 DPA/保密补充协议，并明确推理输入不训练、人工不可见或严格受控、留存与删除期限、境内处理和网络隔离后，才可重新评审。标准线上条款下不得上传 commercial-seed。

## 5. 推荐路线

### 5.1 数据治理排序

1. **阿里云百炼 / 千问视觉：首选条件候选**  
   公开“不训练”承诺最清楚，且北京地域、业务空间、模型/IP 权限、费用拆账证据完整。主要缺口是：调用内容确切留存期、删除 SLA、内容审核副本和真正的私网/专属推理证据。
2. **智谱 BigModel / GLM-V：备选条件候选**  
   数据所有权和未授权使用条款方向合理，但推理留存、训练排除、人工审查和专属网络证据需通过企业文件补齐。
3. **火山方舟 / 豆包视觉：标准条款 HOLD**  
   除非企业协议明确覆盖永久训练/优化授权，否则不进入测试。
4. **百度千帆：标准条款 HOLD**  
   “不得提供保密信息/无保密义务”与购买素材的非公开属性冲突。

这只是数据治理排序，不代替视觉效果、结构化输出稳定性、价格与延迟基准。最终 Provider 必须同时通过模型能力 Agent 和本治理门。

## 6. 国产路线激活组合门

国产 Provider 只有在以下条件全部有证据时才可从 `0 calls` 变为 staging 小样本：

```text
DOMESTIC_PROVIDER_APPROVED = true
AND DOMESTIC_MODEL_ID_APPROVED = true
AND STAGING_D1_R2_ACCEPTED = true
AND DATASET_RIGHTS_ALLOWLIST_MATCH = true
AND MAINLAND_PROCESSING_EVIDENCE = true
AND NO_TRAINING_WRITTEN_EVIDENCE = true
AND RETENTION_DAYS_AND_SCOPE_CONFIRMED = true
AND CONTENT_REVIEW_AND_HUMAN_ACCESS_CONFIRMED = true
AND DELETION_AND_BACKUP_SLA_CONFIRMED = true
AND PRIVATE_OR_TENANT_ISOLATED_PATH_CONFIRMED = true
AND LOG_BACKFLOW_DISABLED = true
AND SECRET_MANAGER_CONFIGURED = true
AND IP_AND_MODEL_ALLOWLIST_CONFIGURED = true
AND COST_HARD_STOP_TESTED = true
AND BATCH_LIMIT <= 50
AND CONCURRENCY <= 3
AND EXPLICIT_RUN_APPROVAL = true
```

任意一项为未知、截图缺失、合同未签或只靠销售口头承诺时：

```text
NETWORK_REQUEST_COUNT = 0
```

### 6.1 原 OpenAI ZDR 的国内等价替换

国内路线不要求厂商必须使用“ZDR”这个产品名，但证据必须达到同等或更严格效果：

| 原条件 | 国内等价证据 |
|---|---|
| `store:false` | API/控制台/合同证明请求正文与图片不进入会话历史、应用观测、推理日志回流、评测集、训练集或人工质检；客户端也不启用上下文存储 |
| opt-out training | 官方条款或签署的企业补充协议明确：输入、输出、图片、Prompt、修复 Prompt 和人工改判均不用于预训练、微调、蒸馏、评测积累或模型改进 |
| ZDR | 各数据类别保留期为 0；如果法律/安全所需不能为 0，必须列出数据字段、目的、精确天数、访问角色、加密、删除及备份淘汰 SLA，并由数据责任人接受；仅写“不训练”不算通过 |
| data residency | 固定中国大陆 Endpoint/Region，合同确认推理、审核、日志、备份和灾备均不出境 |
| short private URL | 优先直接上传二进制；如必须 URL，使用私有对象存储、单对象签名 URL、GET-only、随机路径、短 TTL、一次性或最小次数、无列表权限，并在请求结束后立即删除 |

## 7. 禁止发送的数据

即使 Provider 已激活，以下内容仍不得发送：

- PSD、RAR、未解压源包、图层名称、字体文件和购买订单；
- 未被 manifest allowlist 命中的任何本地图；
- 真实客户生产图、未获得模特/摄影/品牌授权的素材；
- 身份证、手机号、地址、订单号、会员 ID、收货信息等个人信息；
- CTR、CVR、GMV、ROI、客户投放预算和渠道账户数据；
- VisionQA 的 secret、数据库凭据、Cloudflare Token、API Key、完整环境变量；
- 未公开系统 Prompt、规则库全文、客户专属商业 Profile；
- 国家秘密、重要数据、核心数据、受出口或行业监管限制的数据；
- 任何厂商标准条款明确禁止提交的保密信息或商业秘密。

## 8. Secret 管理规则

1. Secret 仅由授权账户管理员在 staging secret manager 中写入；不得通过聊天、CSV、Markdown、截图、工单正文或普通 `.env` 传递。
2. 每个 Provider、环境和项目使用不同凭据；staging 凭据不得访问 production。
3. 采用最小权限：仅允许选定视觉模型、固定中国大陆 Endpoint、固定来源 IP；默认全网白名单必须关闭。
4. 应用日志只记录 `provider/model/request_id/status/token/cost/latency`，不得记录请求正文、图片 Base64、签名 URL 查询串或响应全文。
5. 错误对象在落盘前清洗 Header、URL query、Key、Authorization 和厂商 SDK debug dump。
6. 禁止把密钥注入浏览器端；所有调用经服务端 Adapter。
7. 凭据轮换：首次 staging 验证后立即轮换；之后最长 90 天或疑似泄漏立即轮换。
8. 禁用 Provider 时同时撤销 Key、停用模型权限、删除临时对象、关闭推理日志回流并导出费用/审计摘要。

## 9. 账户管理员必须回填的证据清单

不得把“管理员尚未确认”写成“默认通过”。激活前保存以下非敏感证据：

- Provider、企业主体、合同/订单/DPA 版本与生效日期；
- 中国大陆 Region 与 Endpoint 截图（密钥打码）；
- 所选视觉模型 ID、快照/版本和可用地域；
- 不训练条款、留存分类表、删除与备份 SLA；
- 内容安全、人工访问、故障排查访问范围；
- 日志回流/应用观测/历史记录关闭状态；
- 专属业务空间、VPC/PrivateLink 或租户隔离证明；
- API Key 的模型 allowlist 和来源 IP allowlist；
- 项目级费用限额、告警和 VisionQA 代码侧硬停测试；
- 增值税发票主体与预算责任人；
- 首次运行的显式批准记录。

证据中 API Key、AccessKey、SecretKey、Token、Cookie 和完整签名 URL 必须遮蔽。

## 10. 当前 Gate 结论

```text
DOMESTIC_PROVIDER_DATA_GOVERNANCE = CONDITIONAL
PREFERRED_GOVERNANCE_CANDIDATE = ALIBABA_CLOUD_MODEL_STUDIO_QWEN_VL
SECONDARY_CANDIDATE = ZHIPU_BIGMODEL_GLM_V
VOLCENGINE_STANDARD_TERMS = HOLD
BAIDU_QIANFAN_STANDARD_TERMS = HOLD
REAL_NETWORK_CALLS = 0
```

下一动作不是索要 Key，而是由账户管理员选择“阿里云百炼北京地域”或“智谱企业路线”，完成第 9 节非敏感证据回填。只有能力评测方案和数据治理组合门同时批准后，Provider Activation Agent 才能申请一次最多 50 张、并发不超过 3 的 staging 真实调用。

