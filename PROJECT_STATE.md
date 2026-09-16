# VisionQA 项目状态

## 2026-09-16 PostgreSQL 修图事务第一批

- 新增 `web/drizzle-pg/0004_repair_transactions.sql` 与 `web/lib/beta/postgres-repair-repository.ts`，把修图任务、额度冻结、执行权获取、成功扣次、失败退回和中断恢复纳入同一 PostgreSQL 事务边界。
- 同租户同项目最多一个 `HELD / RUNNING` 修图任务；同租户幂等键复用必须保持请求指纹一致。重复建立、重复 capture/release 不重复冻结或结算。
- Worker 通过条件更新从 `HELD` 原子 claim 为 `RUNNING`；只有一个执行者取得外部调用权，成功结算还必须携带相同 execution owner。输出资产必须显式绑定本次 repair attempt，同时属于同租户、同项目且为已就绪修正版。
- 结算同时校验钱包、hold 和 attempt 的条件更新；任一状态不一致则整笔回滚。技术失败、Gate 拦截与服务中断释放额度，不伪装为业务成功。
- 数据库空库迁移及事务测试通过 5/5。尚未把 `/api/repair-attempts` 切换到该 repository，也未在真实 PostgreSQL 或线上应用迁移；现有生产 API 仍不能宣称具备跨进程强一致扣次。
- 最终回归：Agent 67/67、页面/Schema/生产守卫 31/31、原业务/runtime 143/143、生产构建与 ESLint 均通过；仅依赖构建仍报告既有 `gray-matter` direct-eval warning。
- 产品运行边界不变：只允许 DeepSeek / Qwen；Sol/Luna 仅用于开发、测试和压力对抗。本轮真实模型调用、线上变更与新费用均为 0。
- 模拟客户发现 Day 2 已记录到 `reports/SIMULATED_DAILY_DISCOVERY_AGENT_SUBSCRIPTION_DAY2.md`；它不是真实访谈、采用或付款证据。

## 2026-09-15 单商品智能体运行内核第一批

- 本地主线仍为 `localhost:6300`，线上系统未改动。官网 `/`、登录 `/login`、单商品对话 `/agent` 的路由关系保持不变。
- 新增商品级结构化上下文：固定 project / conversation / product identity，SKU facts、已选素材、任务状态、压缩摘要、revision 与更新时间；跨商品写入和旧 revision 均失败关闭。
- 新增图片版本树：原图与修正版保留 parent-child 来源链，当前版本可切换；人工确认严格绑定单个版本，新版本不继承父版本放行。Mock 会映射到同一契约但继续明确为 `MOCK_ONLY`。
- 新增统一 Provider Runtime：Mock 与注入式真实 Provider 使用相同请求、结果和错误契约。真实 Qwen 修图路由已接入统一运行时；每次修图只允许一个已确认图片调用，禁止无限自动重试。外部执行前必须取得租户级派发声明，重复执行在 Provider 调用前即被拦截；生产缺少 `DATABASE_URL` 时失败关闭。
- 新增模型调用账本：只记录 request/project/conversation/operation/provider/model/status/token/图片计数/成本/耗时/retry/idempotency 等元数据，不保存 Prompt、密钥或图片字节；本地开发账本写入 `web/work/local-agent-state`，生产表迁移已准备但未执行。
- 积分状态继续沿用真实 BetaService 的 `AVAILABLE → HELD → CAPTURED / RELEASED`；另新增 Provider 无关的结算状态机测试。技术失败与 Gate 拦截释放，成功候选捕获一次，重复动作幂等。
- 新增正式数据库迁移草案 `web/drizzle-pg/0003_agent_runtime.sql`，包含商品对话上下文、图片版本和模型调用账本；父版本使用租户/项目/对话/商品/资产复合约束，派发账本使用租户幂等唯一键。后续 `0004` 已补修图事务。两项迁移均尚未应用到本地或线上真实 PostgreSQL，不得据此声称生产持久化完成。
- 协作方式：`gpt-5.6-sol` / `gpt-5.6-luna` 仅用于研发、测试、独立审查和压力对抗，不进入产品运行时；VisionQA 当前产品运行模型固定为 DeepSeek + Qwen，未来 Seedance 需独立 Gate 后才可接入。本轮未触发真实模型调用。
- 验证（该阶段快照）：Agent 运行与交互测试 62/62、原业务/runtime 测试 143/143、页面/Schema/生产守卫 31/31 通过；ESLint 0 error/warning，生产构建通过。后续 2026-09-16 已扩展为五段迁移与 67 项 Agent 测试。浏览器实际完成 Mock 建商品 → 示例素材 → 筛查 → 选择 → V1 → 刷新恢复；构建期间曾捕获一次 Vite HMR 连接错误，刷新后未出现新时间戳错误。真实模型结果、390px 移动端和线上仍为 `NOT_RUN`。
- 详细架构与边界见 [Agent Runtime 基础](docs/17_AGENT_RUNTIME_FOUNDATION.md)；模拟客户发现见 [Day 1 报告](reports/SIMULATED_DAILY_DISCOVERY_AGENT_SUBSCRIPTION_DAY1.md)。

## 2026-09-15 入口恢复与后端接入第一批

- `localhost:6300/` 已按历史冻结版本 `6f1ab23` 恢复最初 P1 首页，所有入口统一指向 `/login`；`/login` 恢复原左右分栏登录视觉，测试入口在登录表单下方；成功后进入 `/agent`。
- 第一批后端接入已开始：手机号/密码表单复用既有 `/api/trial-auth/login` 会话接口，认证成功后建立独立本地 Agent 预览标记；直接 Mock 入口跳过账号验证并明确标示。未调用图片筛查或修图模型。
- Agent 细节优化新增筛查缩略图、待修图/商品参考并排证据，桌面主内容从 840px 扩至 1120px；版本、失败恢复和 mock 边界保持不变。
- Luna 三批只读审查完成：首页/登录定位、Agent UX、Beta 后端分批接入。后端顺序固定为会话与项目 → 素材 → 筛查 → 修图与额度；不把 MockSnapshot 强行映射成真实 Beta 双账本。
- 浏览器已验证 P1 首屏、首页入口地址和恢复后的登录页；构建及 Agent 测试通过。素材删除/替换、框选、真实服务项目桥与手机复验留给下一批。线上未改动。

## 2026-09-15 当前主线：本地对话 Mock 闭环

- 用户最新决定：官网暂不改设计；官网入口 → 登录页（下方合并测试入口）→ 单商品智能体对话。先验收交互，再接真实服务。仅 localhost:6300，不发布线上。
- 已实现独立模拟登录、商品对话、参考/候选素材、筛查、修改计划、失败重试、前后对比、多轮母版、历史版本和模拟交付记录。旧工作台与旧数据保留，新界面无旧工作台跳转。
- 浏览器实测：测试入口、新建商品、示例素材、筛查、模拟失败重试、V1 确认及下载按钮、V2、刷新恢复；直接续聊正确显示 V2 母版。模拟版本图片像素未改变，不是模型效果证据。
- 验证：npm test 通过（含 agent 37/37、业务 143/143、构建及 HTML/生产守卫）；ESLint 通过。手机、用户文件上传、存储配额和多标签页冲突的浏览器验收仍待补齐。
- 独立审查三项已修复：返回筛查、存储 revision 冲突检测、当前显示版本绑定下一轮母版；另外各阶段可查看历史版本。
- 旧实时链路的存储 503 未在此轮修复，已与 mock 隔离；没有读取或修改凭据、调用付费模型或部署。接口与下一步见 [Mock 计划](docs/16_MOCK_CONVERSATION_PLAN.md)。以下为历史记录。

## 2026-09-14 本地对话规划接入（不发布）

- 仅 `localhost:6300/agent`：接入 Mastra Agent + 服务端 DeepSeek 文字规划，支持追问、补充要求、计划修订、确认后建立项目。新计划使旧确认失效；重复提交和重复确认幂等。
- 不是完整图片 Agent 闭环：图片工具仍在原工作台；计划尚不自动写入修图指令。长期记忆、跨进程恢复、持久预算账本、真实模型效果与浏览器点击验收尚未完成。
- 证据：智能体零网络测试 15/15（包含真实 SDK + Mastra 工作流、模拟 HTTP 传输），客户额度/邀请回归 12/12；定向 ESLint 通过。全仓 TypeScript 仍有 19 个错误，本轮相关路径 0 个；不得称全仓构建通过。
- 本轮没有真实模型调用、收费修图、线上部署或密钥变更。页面热请求 HTTP 200；本地冷编译明显偏慢，HTTP 不能替代视觉/点击验收。
- 详细实施与下一步见 [本地智能体记录](docs/15_LOCAL_AGENT_IMPLEMENTATION.md)。下面均为历史阶段快照。

## 当前方向：2026-09-10 视觉 AI 智能体

- 用户已明确认可：产品主体是视觉 AI 智能体；商品图审核、修图和一致性检查是首个业务能力包，不是整个产品的永久范围。
- 当前产品定义：[视觉智能体 v0.1](docs/12_VISUAL_AGENT_PRODUCT_v0.1.md)；首个交互与验收样例：[任务样例 v0.1](docs/13_VISUAL_AGENT_FIRST_TASK_v0.1.md)。具体首版设计尚待实现与体验验证。
- 本轮交付为产品规格，不代表新智能体功能已实现。没有改动线上流程、邀请码、支付或模型权限，也未运行收费调用。
- 下一步：内部验证对话式任务体验，再贯通既有审核修正能力；保留当前客户入口，发布前核验持久化、隔离、真实模型结果与剩余预算。
- 以下带日期段落为历史快照，不应用旧的未部署描述推断当前线上状态。9 月 2 日部署证据见 PROGRESS.md 第 26 节；今天未重新验证线上版本或基础设施状态。

## 2026-09-01 客户体验内测版重构

- 已完成客户/开发者版本分流：`/`、`/login`、`/workspace`、`/workspace/projects/:id` 为客户流程，`/internal` 保留完整模型、Prompt、Gate 和审计能力；本机固定账号只进入 `/internal/login`。
- 已实现邀请会话、项目、单文件素材上传、简化筛查、问题框选、修图额度冻结/扣除/释放、服务端基础文件 Gate、三项人工确认和下载恢复；开发者版新增邀请、补次和预算硬停面板。
- PostgreSQL 正式表迁移已增加 User、Tenant、Membership、Invite、Session、Project、ScreeningBatch/Item、RepairAttempt、CreditWallet/Ledger/Hold、PaymentOrder；支付生产模式保持 `disabled`。
- 本机示例链已实际验收：5 次额度进入 → 2 张候选免费筛查 → 1 张需要处理 → 修正版通过 Gate → 额度变 4 → 刷新恢复 → 三项确认后开放下载。桌面与 390px 无页面级横向溢出，控制台 0 error/warning。
- 自动化共 130/130 通过，新增邀请单次消费/过期、租户隔离、1/10/11 张边界、文件大小、额度幂等、失败释放、成功扣次、质量补次、7 天清理、支付关闭和服务端 Gate 测试；构建与 ESLint 通过。
- 生产发布仍被基础设施绑定阻断：当前本机未配置客户版 PostgreSQL 连接和私有 OSS 上传签名/对象存储；因此未部署到 `visionqa.dionysusding.cn`，也未运行 30 次真实模型 QA。该阻断不能用进程内开发存储或公开图片 URL 绕过。

> 这是本项目的首要状态入口。每次阶段交付、评审结论或方向变化后更新。  
> 最后更新：2026-08-28（Asia/Shanghai；第五阶段工程收口与新对话交接）
> 内部代号：`VisionQA`；外部产品名：待定  

## 2026-08-26 完整 SKU 真实修正闭环准备

## 2026-08-28 第五阶段收口：合成案例边界闭环

- 本阶段不是商业上线，而是对第四阶段末形成的 5 例合成修图案例库做工程与证据收口。产品学习状态为 `ACCEPT_FOR_LEARNING`，市场状态仍为 `HOLD`。
- 独立 QA 首轮发现：L3 可被同义自由文本绕过、SC-001 存在双刺绣标签错配、合成证据身份在界面与导出链丢失。收口实现没有降低标准，而是逐项修复并补回归。
- L3 案例策略现由冻结案例 ID 强制执行；SC-003/SC-005 不生成局修 Prompt，不能建立或执行局修任务。SC-001 使用 v2 单问题候选，文件 SHA-256 为 `b886ac06047dc7cede8d7a3439b16454fc34a3b9fbb961630175572fe808f20a`。
- 合成案例从载入、人工确认、本机 Project 持久化、修正页到任务 JSON 持续携带 `SYNTHETIC_INTERNAL_TEST_ONLY / IMAGEGEN_SYNTHETIC_INTERNAL / not_real_customer_evidence / not_model_effectiveness_evidence / not_commercial_evidence`。
- 运行时案例元数据与 manifest 由自动化逐字段核对；浏览器加载 public 图片时额外核验 SHA-256，任何漂移失败关闭。
- 回归证据：ESLint、生产构建、15/15 页面/Schema/production 检查、118/118 TypeScript/runtime 测试通过；真实浏览器桌面与 390×844 复验 SC-003 同义文案，边界为 `REGENERATE`、任务禁用、合成证据标签可见、0 横向溢出、0 console error/warning。
- 本轮未调用 Qwen/DeepSeek 或其他项目 Provider，未新增模型费用；没有客户图片进入案例库。真实客户采用、PS 时间节省、付款和再次提交均为 `NOT_RUN`。
- 当前目标从“继续开发功能”切换为“真实参与者学习验证”：3 名美工或运营，每人 2–3 例；拟议通过线是至少 70% 在 60 秒内完成有理由路由且 L3 零误入局修。该阈值仍是实验建议，不是用户已经认可的商业门。
- 新对话接手文件：[`handoffs/PHASE_5_CLOSURE_HANDOFF_2026-08-28.md`](./handoffs/PHASE_5_CLOSURE_HANDOFF_2026-08-28.md)。

### 2026-08-27 灰色针织开衫 ImageGen → 诊断 → 修正 → 交付

- 内置 ImageGen 新建 `SYN-VQA-GRAY-CARDIGAN-001`：商品真值为四颗纽扣、左胸单枚黑色五瓣刺绣的暖浅灰针织开衫；错误模特图在右胸增加复制刺绣。
- 首次诊断漏检主错误。修复“参考图只是历史优秀参考”的错误提示契约后，模型识别重复刺绣但误报纽扣数量。新增结构化 SKU 事实后，模型正确识别主错误和四纽扣事实，但仍误报正确刺绣缺失。
- 新增工作台“确认过的商品事实”输入，并把事实传入 Provider 锁定属性。自动诊断定位为问题候选，不允许直接自动改图。
- 人工确认主问题后，Qwen Image 3.0 Pro 一次修正成功，保持完整全身构图并删除错误刺绣；本机漂移 Gate 通过，状态为 `HUMAN_REVIEW_CANDIDATE`。
- 生成前后对比与 2560×3840 本机重采样文件；不宣称 AI 细节重建。独立 QA 因协作通道连续断连未完成，客户交付继续阻断。
- 当前 Gate：`STRUCTURED_SKU_FACTS_ENABLED / AUTO_DIAGNOSIS_CANDIDATE_ONLY / HUMAN_ISSUE_CONFIRMATION_REQUIRED / QWEN_IMAGE_3_REPAIR_SUCCEEDED / HUMAN_REVIEW_CANDIDATE / INDEPENDENT_QA_NOT_COMPLETED / CUSTOMER_DELIVERY_BLOCKED`。

### 2026-08-27 Qwen Image 3.0 Pro 首次受控闭环

- 产品结果契约更新为：客户先看“具体问题、可修方式、修改前后、是否可交付”，不以总分作为前台主结果。已知问题可由用户直接确认并进入修正，不强制先跑综合评分。
- 工作台限定为黑白灰界面与真实图片主导；首页和测试登录页保持不变。本轮压缩了上传、诊断和修正页的解释文字。
- 新增 `qwen-image-3.0-pro` Provider、就绪 Gate、双路由兼容和固定受控探针。API Key、Workspace、Provider、付费、数据范围和模型版本在读取图片前检查；单次 `n=1`、0 自动重试。
- 真实探针请求成功，输出未退化为商品特写：错误工装贴袋被移除并保留完整全身模特构图。独立 QA 将其判为内部演示可用，但因非目标区域再渲染、合成样例与缺少客户终审，商业交付硬性阻断。
- 原始证据位于 `data/repair_benchmark_v0.1/runs/qwen-image-3-probe-001/`；单次实际费用仍待阿里云账单核验，不宣称为 0。
- 回归：109/109 测试、Lint 和生产构建通过；浏览器自动视觉复验被本地 URL 策略阻断，未绕过。
- 当前 Gate：`QWEN_IMAGE_3_CONTROLLED_PROBE_SUCCEEDED / INTERNAL_DEMO_ONLY / CUSTOMER_DELIVERY_BLOCKED / HUMAN_REVIEW_REQUIRED / NO_AUTO_RETRY / ACTUAL_COST_MISSING / HOME_AND_LOGIN_FROZEN`。

### 2026-08-26 ImageGen 修正金标准与受控闭环

- 已从历史会话恢复正确的 ImageGen 编辑契约：最后/主编辑图必须是唯一人物、画幅、镜头与构图母版；商品真值只验证 SKU 结构；Prompt 必须逐项冻结脸、姿势、手部、服装非目标区域、背景、光线和画幅。
- 内置 ImageGen 对当前合成样例完成局部修正，输出 `imagegen-repair-gold-v0.1.png`：保留完整成年男性模特与 1024×1536 画幅，只移除画面左侧（模特右腿）错误翻盖口袋。
- 输出 SHA-256 为 `3F25FB89B15E463941C087BC8C593031C3530979ABF3E328A9A23A1189C36EBE`；实际上传工作台后通过本机构图漂移 Gate，并显示“等待逐项确认”。24×36 粗粒度指纹复算为 `aspect_ratio_drift=0 / mean_pixel_difference=0.005981 / changed_cell_ratio=0`，显著低于 `0.18 / 0.55` 阈值。这只证明候选可以进入人工复审，不等于像素级无漂移或最终交付通过。
- 新增 `SYNTHETIC_GROUND_TRUTH` 内部诊断模式和“载入受控样例真值”按钮。入口同时锁定唯一候选、已知源图 SHA-256 与指定商品真值板，普通客户图片不能使用；不调用模型、不产生商业分数，也不冒充千问结果。
- 金标准来源、Prompt、不变量、人工确认与未宣称事项记录在 `repair-gold-v0.1.json`；README 与 `sku-facts.json` 已统一使用“画面左侧（模特右腿）”，消除左右歧义。
- 浏览器在刷新本地页面时被 Codex 内置 URL 安全策略拦截，因此新增按钮的最终点击链由自动化契约、构建与 lint 验证，未使用 CDP 或其他方式绕过；此前金标准上传与漂移 Gate 验收已在真实工作台完成。
- 工程验证：99/99 项自动化测试、生产构建与 ESLint 全部通过；没有再次触发千问诊断或千问改图付费请求。

- 当前优先级冻结为：完整 SKU 商品真值 → AI 模特草图 → 真实诊断 → 真实改图 → 前后人工复验 → 本机交付。
- 真实 AI 超分、正式账号、云端项目列表、租户隔离和服务器测试版均后移；客户测试人员由产品负责人继续寻找。
- DeepSeek 与千问 Key、千问 Workspace ID 已保存到本机 `web/.env.local` 并由 Git 忽略；本轮只核验 `SET/MISSING`，未读取、输出或提交密钥值。
- 产品负责人已明确授权重新开放本地人工体验测试；千问诊断与千问改图的现有 Provider、付费、数据范围和固定模型 Gate 当前均已开启。
- 根据当前千问图像编辑契约，Project 可以保留完整 SKU 的多张商品真值图；每次改图由用户明确选择最多 2 张最相关真值图，加 1 张待修图，总输入不超过 3 张。
- 修正页新增本次参考图选择器；选择变化后清除单次发送确认，未选择商品真值图时不能建立或运行千问改图任务。
- DeepSeek V4-Flash 保留为未来受控调度候选，不强行进入首个固定修正闭环；先用真实业务结果证明是否存在动态规划需求。
- 验收：`npm run lint`、生产构建、15 项页面/Schema 检查和 92 项 TypeScript/运行时测试通过；生产模式浏览器验收覆盖工作台、Gate、桌面与 390px，页面无横向溢出，控制台 0 error / 0 warning。
- 当前允许产品负责人在本机逐次手动测试；每次发送仍必须确认具体候选图与参考图。创建计费资源、充值、扩大到客户素材或服务器自动运行仍需重新确认。
- 当前 Gate：`LOCAL_KEYS_CONFIGURED / LOCAL_MANUAL_TEST_MODE_ENABLED / DIAGNOSIS_AND_QWEN_REPAIR_READY / PER_SEND_CONSENT_REQUIRED / HUMAN_REVIEW_REQUIRED / AUTO_PASS_DISABLED`。

### 2026-08-26 合成商品真值样例 v0.1

- 在用户当前没有真实 SKU 链接的情况下，建立 `SYN-VQA-BURGUNDY-TROUSERS-001` 合成内部测试 SKU；SKU 链接保持为可选输入，不伪造远程商品页面或真实在售事实。
- 商品真值板包含同一条深酒红微褶男士运动长裤的正面、背面、侧面和腰头/面料细节；锁定深酒红、直筒裤型、纵向微褶、中腰松紧腰头、中央黑色抽绳、两侧缝口袋、无工装口袋、无 Logo 和直筒裤脚。
- 待修 AI 模特图故意增加一个受控错误：画面左侧（模特右腿）大腿外侧出现商品真值不存在的矩形翻盖工装口袋；其余商品身份要求保持不变。
- 素材与事实契约位于 `data/synthetic_demo_sku_burgundy_trousers_v0.1/`，README 明确标记 `SYNTHETIC_INTERNAL_TEST_ONLY`，不得冒充真实客户、真实 SKU、模型准确率或商业证据。
- 商品真值板与待修图已写入本机 Project，图片来源确认为 AI 生成；第二次诊断失败状态已保存到 Project v30，当前停在问题诊断 Gate。
- 用户已批准首次合成样例诊断：仅发送上述两张合成图片与结构化事实，预算上限 2 元，恰好执行 1 次 `qwen3-vl-plus-2025-12-19` 真实诊断，不执行改图。对应本机 Canary 硬限制已收紧为 200 分 / 1 次请求 / 并发 1。
- 首次真实诊断请求进入 Provider 分发阶段，但没有形成有效结果。页面最终记录 `LIVE_MODEL_CANARY_LIMIT_REACHED`；该状态不是商品质量结论，也不能证明模型效果。
- 根因是路由仍允许 `maxAttempts=2`，而本机 Canary 硬上限已收紧为 1 次。第一次请求发生可重试错误后，第二次尝试被本地额度 Gate 拦截，并覆盖了首个错误；因此当前无法确认百炼是否完成推理，费用以阿里云账单为准，不宣称为 0。
- 已修正为付费本机 Canary `maxAttempts=1`，禁止自动重试；能力接口新增 `dispatched_requests / remaining_requests`，页面在剩余请求为 0 时禁用发送确认和诊断按钮。相关 Provider 测试 18/18、Lint 与生产构建通过。
- 用户随后明确批准第二次合成样例诊断：仍仅发送相同两张合成图片与结构化事实，只调用一次固定快照，累计测试预算目标仍为 2 元，不执行改图或重试。
- 第二次运行前能力接口确认 `configured=true / dispatched_requests=0 / remaining_requests=1 / budget_minor_units=200 / max_concurrency=1`。页面恰好点击一次后，服务端计数变为 `dispatched_requests=1 / remaining_requests=0`；45 秒后页面保存 `LIVE_MODEL_TIMEOUT`，没有形成诊断输出、Token 用量或 Provider Request ID。
- 超时不等于未计费：请求已经进入 Provider 分发，但本地在收到百炼响应前终止等待，因此当前只能记录“实际费用待阿里云模型监控／账单确认”。[阿里云模型监控文档](https://help.aliyun.com/zh/model-studio/model-telemetry/)说明单次用量日志存在分钟级延迟，普通调用统计可能约一小时后出现；未取得证据前不继续第三次调用。
- 第二次结束后已立即关闭 `VISION_LOCAL_CANARY_ALLOW_LOCALHOST / VISION_LOCAL_CANARY_ENABLED / VISION_PAID_CALLS_ENABLED / VISION_DATA_PROCESSING_APPROVED / EXPLICIT_RUN_APPROVAL`，重启后复验 `configured=false`；未执行改图。
- 当前结论：`TWO_LIVE_DIAGNOSIS_ATTEMPTS_NO_VALID_RESULT / SECOND_ATTEMPT_SINGLE_DISPATCH_TIMEOUT / ACTUAL_COST_PENDING_ALIYUN_BILLING_EVIDENCE / PROVIDER_GATE_CLOSED / THIRD_ATTEMPT_NOT_AUTHORIZED`。
- 产品负责人随后要求“全部重新开启，暂时不用锁定”，用于实际手动测试用户体验。诊断进程级上限由 1 调整为 15，并发继续为 1，自动重试继续关闭；千问改图四项授权 Gate 同步开启。
- 复验：诊断能力接口为 `configured=true / remaining_requests=15`；改图能力接口为 `live_ready=true / blockers=[]`。页面授权勾选框可点击，勾选后“开始 AI 问题诊断”可用；没有替用户触发新模型调用。
- 安全边界：当前 `budget_minor_units=200` 是授权记录与界面提示，不是阿里云实时账单止损器；人工连续调用可能产生超出记录值的费用，必须由产品负责人自行控制点击并核对控制台账单。人工终审、每次发送确认、自动发布关闭和自动放行关闭不变。
- 当前结论更新为：`LOCAL_MANUAL_TEST_MODE_ENABLED / DIAGNOSIS_ALLOWANCE_15_PER_PROCESS / QWEN_REPAIR_LIVE_READY / PER_SEND_CONSENT_REQUIRED / HUMAN_REVIEW_REQUIRED / AUTO_PASS_DISABLED`。
- 随后的人工诊断仍稳定在 45 秒处返回 `LIVE_MODEL_TIMEOUT`。只读排查确认 `dashscope.aliyuncs.com` DNS/TLS/443 正常，最小 HTTP 请求约 516ms 返回；当前进程已有请求进入 Provider 分发，因此不是按钮、基础网络或商品质量 Gate 导致。
- 根因收敛为本地 `attemptTimeoutMs=45_000` 对“两张视觉图片 + 严格结构化 JSON”过短。已建立 `live-evaluation-contract.ts`，将单次总等待调整为 180 秒，并固定 `max_completion_tokens=2400`；继续 `maxAttempts=1`，不自动重试付费请求。
- API 客户端现在在发送前生成 Request ID，并同时用于本地错误响应和 `X-DashScope-Request-Id`；成功或失败都可在本机 Project 保存请求编号、开始／结束时间、耗时、错误码、Provider Request ID 与 Token 用量。超时响应附 `PROVIDER_WAIT / timeout_ms=180000 / product_conclusion_formed=false`。
- 工作台将超时显示为“技术失败，不代表商品图不合格”，历史 45 秒超时记录也会迁移为该语义。按钮运行态说明“最长约 3 分钟”，每次完成或失败后自动取消发送授权，下一次必须重新勾选。
- 工程验证：生产构建通过，95 项测试全部通过，ESLint 0 error；未为验证触发新的付费模型调用。
- 当前结论：`TIMEOUT_ROOT_CAUSE_LOCAL_CUTOFF / WAIT_180_SECONDS / OUTPUT_TOKENS_2400 / REQUEST_TRACE_PERSISTED / NO_AUTO_RETRY / TECHNICAL_FAILURE_IS_NOT_PRODUCT_CONCLUSION`。
- 首次千问改图 Provider 请求成功并返回图片，但人工查看发现输出从全身 AI 模特图变成裤装局部特写，人物、镜头与整体构图均丢失；这是 Provider 输出漂移，不是前端裁切。对比区使用 `object-fit: contain`，已如实显示返回文件。
- 根因：旧请求把待修模特图放第一张、商品真值板放最后一张；[阿里云千问图像编辑 API](https://help.aliyun.com/zh/model-studio/qwen-image-edit-api)明确多图输入的输出宽高比以最后一张为准，商品真值板因此错误主导画幅和重构倾向。旧 Prompt 对“唯一构图母版”约束也不足。
- 已把输入顺序调整为“商品真值参考在前，待修 AI 模特母版最后”，并按图号明确：前序图片只校对服装事实，最后一张是唯一人物、画幅、镜头与构图依据；负向 Prompt 新增服装白底图、商品特写、裁切／移除人物、改变景别／姿态／背景等禁止项。
- 新增 `repair-output-gate-v0.1`：浏览器本机比较原图与输出的画幅比例、粗粒度像素差和变化区域占比。触发大幅漂移时 Provider Job 标记 `FAILED / REPAIR_OUTPUT_MAJOR_DRIFT`，图片可在对比区查看但不能进入人工确认、4K 或交付；该复验不外传图片、不增加模型费用。
- 验证：97 项自动化测试全部通过，生产构建通过，ESLint 0 error，修正工作台浏览器控制台 0 error / warning；本轮没有再次调用付费改图模型。
- 当前结论：`FIRST_REPAIR_OUTPUT_REJECTED_MAJOR_DRIFT / SOURCE_IMAGE_LAST / PRODUCT_TRUTH_REFERENCE_ONLY / LOCAL_COMPOSITION_DRIFT_GATE_ACTIVE / HUMAN_DELIVERY_BLOCKED_ON_DRIFT`。

## 2026-08-24 真实单图链与修正多智能体骨架

- 修复 P0 素材串线：项目存在客户候选图时，总览、诊断和修正页始终使用真实候选图；未诊断时建立 `NOT_RUN / scoreAvailable=false` 占位对象，不再回退内置示例图、问题、分数或 Prompt。
- 新增 `visionqa-repair-collaboration-v0.1`：商品真值守门员 → 问题诊断智能体 → 修正规划智能体 → 改图执行智能体 → 漂移复验智能体 → 清晰度交付智能体。六个职责共用同一 Repair Case、素材 SHA 和版本链。
- 当前协作执行模式是 `LOCAL_STATE_MACHINE_NO_MODEL`，用于验证职责与交接 Gate；`independentModelAgentsActive=false`，不把规则状态机冒充多个独立模型已经在线协作。
- 新增千问改图 Provider 适配层和 `/api/repair-jobs`，固定 `qwen-image-edit-max-2026-01-16`；完整 SKU 可保留多张真值图，每次由用户选择最多 2 张相关参考，第一张图为待修草图，总输入不超过 3 张；关闭 Prompt 扩写与水印，结果临时 URL 只允许阿里云域名并立即回存本机项目。
- 六项启用 Gate：API Key、百炼业务空间、Provider 批准、付费调用批准、`MODEL_DRAFT_AND_PRODUCT_REFERENCES` 数据范围、固定模型快照；任一缺失时 POST 在读取图片前返回 403。
- 每次真实发送仍要求页面单次确认，确认状态不持久化；没有自动重试付费生成、自动放行或自动发布。
- 缺少商品真值或真实诊断时，历史改图、人工勾选和 4K 文件继续保留但不得形成新的可交付结论。
- 验收：`npm test` 106/106、`npm run lint` 0 error；新增 Schema 严格编译通过；浏览器实测真实候选图保持 Blob 来源，桌面与 390px 无页面级横向溢出，控制台 0 error；`POST /api/repair-jobs` 在未授权状态返回 403，真实外部调用与新增费用均为 0。
- 当前 Gate：`REAL_ASSET_CHAIN_FIXED / REPAIR_CASE_CONTRACT_READY / QWEN_IMAGE_EDIT_ADAPTER_READY / REPAIR_PROVIDER_NOT_AUTHORIZED / LOCAL_MULTI_AGENT_STATE_MACHINE_READY / HUMAN_REVIEW_REQUIRED / AUTO_PUBLISH_DISABLED`。
- 说明：[`web/docs/model-image-repair-v0.1.md`](./web/docs/model-image-repair-v0.1.md)。

## 2026-08-24 AI 模特图修正与 4K 交付调整

- 产品主定位由“批量评审与营销交付”收缩为“服饰电商 AI 模特图修正与交付工作台”；目标用户是已经使用 AI 制图的美工、视觉负责人和运营验收人。
- 主流程调整为：商品真值 → AI 模特草图 → 问题诊断 → 修正与交付；营销智能体保留代码与契约，但退出当前主导航。
- 同一任务只处理同一 SKU、同一用途的 1–3 张 AI 模特母图；详情页和促销排版不与母图混入同一任务。
- 修复 P0 模板错配：默认模板变更为 `ai_model_image_repair@0.3.0`；非促销模板会过滤 `no_promotion_overlay / missing_promotion_overlay`，缺少价格、优惠、CTA 或商业贴字不能再形成低分、返工 Prompt 或 REJECT。
- 修正页新增本机 4K 尺寸交付：1280×720 输出 3840×2160，竖图保持比例以 3840 为长边；已达到 4K 的源图不降采样。
- 本机 4K 使用高质量分级重采样，不上传、不产生 API 费用，也不宣称 AI 重建了原图不存在的细节；处理凭证明确记录 `detailReconstruction=false`。
- 当前机器未发现 Real-ESRGAN、SwinIR 或其他可复用的本地真实超分运行时；外部 AI 超分 Provider 仍需用户确认 API Key、付费调用和图片发送范围。
- Project payload 继续向后兼容，并新增保存改图输出、人工复验项、4K 文件和超分处理凭证。
- 当前 Gate：`MODEL_IMAGE_REPAIR_FOCUS_READY / PROMOTION_FALSE_REJECT_FIXED / LOCAL_4K_RESAMPLE_READY / AI_SUPER_RESOLUTION_NOT_CONFIGURED / HUMAN_REVIEW_REQUIRED / AUTO_PASS_DISABLED`。
- 说明：[`web/docs/model-image-repair-v0.1.md`](./web/docs/model-image-repair-v0.1.md)。

## 2026-08-24 本机 Project 业务对象 v0.1

- 新增 `visionqa-project-v0.1`：工作台不再只依赖 React 临时状态，SKU 基准、候选批次、评审结果、人工记录和当前阶段归属于稳定 Project ID。
- IndexedDB 使用 `projects / assets / events` 三个对象仓库；素材以浏览器 `File` 保存，页面对象 URL 不写入持久层。
- 第一次进入内部预览会恢复最近项目或建立新项目；内容变化 800ms 自动保存，刷新后可恢复，内容版本使用乐观并发检查递增。
- 新增只追加事件：项目建立、恢复、阶段切换、素材变化和一般内容更新；项目总览显示项目 ID、版本和最近记录。
- 运行中状态会降级为安全可重试状态；阿里云图片发送授权不会跨刷新保留，避免把历史同意扩张为新一次外传授权。
- 仍保留内部测试登录，不接真实账户、租户、云同步、项目列表或支付；图片不会因项目自动保存发送到服务端或第三方。
- 当前 Gate：`LOCAL_PROJECT_PERSISTENCE_READY / REFRESH_RESTORE_READY / AUDIT_EVENT_READY / REAL_LOGIN_DEFERRED / CLOUD_SYNC_DISABLED / HUMAN_REVIEW_REQUIRED / AUTO_PASS_DISABLED`。
- 契约说明：[`web/docs/project-contract-v0.1.md`](./web/docs/project-contract-v0.1.md)。

## 2026-08-20 商品表达效能契约与本地营销智能体

- `product-expression-v0.1` 已具备固定六维权重、证据引用、来源引用、不可评估状态、SKU 一致性 Gate、未知项和人工终审运行时校验。
- 历史 `evaluation-result-v0.3` 采用诚实投影：只迁移有直接证据对应的字段，原商品一致性等缺失维度保持 `NOT_ASSESSABLE`，不把旧分数改名冒充新结果。
- 工作台第五阶段新增可交互智能体链路：商品事实守门员 → 商品表达评审员 → 营销策略生成员 → 证据审计员。
- 营销内容改为运行后生成，并附事实编号、来源和未知项；未运行前不再展示预置文案作为交付结果。
- 当前模式为 `LOCAL_RULES_NO_NETWORK`：没有外部 API、图片上传、付费模型、联网达人检索或自动发布。
- 新增测试覆盖固定权重、无证据分数拒绝、旧版不虚构 SKU 一致性、营销证据引用和缺失输入失败关闭。
- 最终回归：`npm test` 84/84，`npm run lint` 0 error / 0 warning；浏览器交互与 390px 移动端无横向溢出验收通过。
- 下一授权点：真实营销模型的供应商、预算、允许发送的数据范围、日志留存；改图模型继续单独授权。
- 当前 Gate：`PRODUCT_EXPRESSION_RUNTIME_READY / LOCAL_AGENT_ORCHESTRATION_READY / LIVE_MARKETING_MODEL_NOT_AUTHORIZED / HUMAN_REVIEW_REQUIRED / AUTO_PASS_DISABLED`。

## 2026-08-20 L2 领域智能体运行框架

- 新增最大 6 步的 Provider 决策循环、四项领域白名单工具、结构化观察轨迹和明确停止原因。
- 当前 `visionqa-local-l2-test-provider` 为非模型测试 Provider：不联网、不推理、不产生费用，仅验证 L2 运行机制，禁止把测试结果宣称为真实模型效果。
- 越权工具、Provider 超时、缺少草案和超过最大步数全部失败关闭；正式结果仍需人工终审。
- 桌面 `小宇电商图素材/服装类视觉主图` 66 张图片已生成本地 SHA-256 清单，0 组内容重复；原图未复制、未上传、未发送第三方。
- 用户授权边界已版本化：项目和桌面相关素材可自主本地测试；支付动作与 API Key 创建/保存/启用必须单独确认。
- 当前 Gate：`L2_RUNTIME_SCAFFOLD_READY / NON_MODEL_TEST_PROVIDER_ACTIVE / LOCAL_MATERIAL_MANIFEST_READY / EXTERNAL_MODEL_DISABLED / API_KEY_APPROVAL_REQUIRED / HUMAN_REVIEW_REQUIRED`。
- 本轮回归：`npm test` 88/88，`npm run lint` 0 error / 0 warning；浏览器 L2 工具循环成功，控制台 0 error，390px 与 1440px 均无页面级横向溢出。

## 2026-08-20 千问营销 Provider 适配层

- 首选营销模型确定为阿里云百炼 `qwen3.7-plus-2026-05-26`，使用 OpenAI 兼容 Chat Completions 与 Function Calling 协议。
- 新增 `lib/visionqa/agents/qwen-marketing-provider.ts`：只发送目标和结构化观察，关闭联网搜索、思考输出和并行工具调用，复用四项领域白名单工具。
- 启用必须同时满足 API Key、Provider 批准、付费调用、`STRUCTURED_FACTS_ONLY` 数据范围、固定模型快照和每次最多 6 次调用；任一缺失均在网络请求前失败关闭。
- 工作台能力条显示“千问 · 百炼 / 适配完成 · 等待授权”，当前活动运行仍为本地非模型测试 Provider，真实千问调用与新增费用均为 0。
- 模拟响应测试覆盖 Key 不进入请求体、搜索关闭、固定模型、完整停止与异常 JSON 失败关闭。
- POST 运行接口已接好受控切换：仅当六项 Gate 全部满足时使用千问，否则保持本地非模型 Provider；本轮没有设置任何启用变量。
- 本轮分组回归共 91/91（界面/契约 13、TypeScript 77、生产启动 smoke 1），构建与 lint 通过；浏览器 390px、1440px 均无页面级横向溢出，控制台 0 error。
- 当前 Gate：`QWEN_PROVIDER_ADAPTER_READY / QWEN_NOT_ACTIVATED / NON_MODEL_TEST_PROVIDER_ACTIVE / STRUCTURED_FACTS_ONLY_PENDING_APPROVAL / API_KEY_APPROVAL_REQUIRED / PAID_CALLS_DISABLED / HUMAN_REVIEW_REQUIRED`。

## 2026-08-13 RDS migration 与真实读写验收

- 阿里云账户已充值，RDS 实例 `pgm-2ze0uziz73r8abb8` 已恢复并复验为 `Running`。
- 原欠费锁定阻塞已解除；没有创建公网数据库地址、额外付费资源或新 API Key。
- 已通过 DMS 将两份 PostgreSQL migration 写入 `visionqa_staging` 的 `public` Schema。
- 验收结果：应用账号 `visionqa_app`、业务表 11 张、`assets.storage_provider` 默认值 `'aliyun_oss'::text`、持久化验收记录 1 条。
- 两份源 migration 已增加 `SET LOCAL search_path TO public`，不再依赖 DMS 当前选中的 Schema。
- 当前 Gate：`RDS_MIGRATION_APPLIED / REAL_DB_READ_WRITE_VERIFIED / PUBLIC_ENDPOINT_DISABLED / FC_RUNTIME_PENDING`。

## 2026-08-13 阿里云运行资源只读盘点

- OSS Bucket 列表为空：尚无可复用的 VisionQA 私有 Bucket。
- 北京区 FC 3.0 云函数列表为空：尚未部署 API Function 或异步评估 Function。
- 当前只读盘点未创建资源、未调用模型、未产生新增资源费用。
- 下一次需要用户明确批准的动作：创建私有 OSS Bucket、FC 两个函数、SLS 日志资源及 VisionQA 专用安全组，并设置 VPC/交换机、并发 1、无常驻实例和预算告警。
- 当前余额证据为约 `¥19.95`；RDS 已按量计费，正式创建其余运行资源前需确认续费/余额策略，避免再次欠费锁定。
- 当前 Gate：`RDS_READY / OSS_EMPTY / FC_EMPTY / RUNTIME_RESOURCE_APPROVAL_REQUIRED`。
> 当前阶段：**本地真实 MVP 已具备“历史参考与 SKU → 客户画像 → 多图真实评分 → 筛选下载”闭环；190 张语料完成 119 训练参考 / 40 人工校准 / 31 锁定盲测；当前模型 Gate 一致率 32.5%，继续禁止自动放行**

> 人工测试入口：`http://localhost:3141`；当前真实模型额度：最多 10 张、预算配置上限 20 元、单并发。只有用户勾选图片授权并点击“真实模型分析”才调用付费模型。

## 2026-08-06 首页 / 工作台 / 内核统一基线

- `/` 定位为产品首页；`/workspace` 定位为唯一真实评估工作台，两者不再混用。
- 首页删除模拟的 `0.42s / PASS 74% / CONF 0.84`，改为读取真实能力接口；当前显示 Qwen 模型快照、10 张批次上限、`HUMAN REVIEW`、`AUTO PASS OFF` 与 `IMAGE STORE NONE`。
- 首页“客观评分”改为“结构化评分”，商业价值说明改为“人工复核建议”，避免未完成盲测前作准确率或自动发布承诺。
- 修复首页视觉检测环在桌面端没有尺寸、状态区被固定导航遮挡、移动导航换行，以及工作台移动端 inspector 横向滚动条。
- 能力接口新增统一字段：`result_persistence=BROWSER_ONLY`、`review_policy=HUMAN_REVIEW_REQUIRED`、`auto_pass_enabled=false`。
- 当前真实内核：百炼评分链路可用；PostgreSQL、OSS、FC 各自端口与测试资产已存在；FC live composition root 软件层已接通，但经审查的云端 binding artifact 尚未部署，工作台真实结果当前仍以浏览器保存为主。
- 下一优先级：确认实际 OSS host 与 RDS 订单 → 生成并审查 live binding artifact → OSS 私有上传 → PostgreSQL 自动持久化 → 可恢复批次任务 → 正式账号与租户。
- 当前不需要用户新增授权、API Key 或费用操作。
- 统一说明：[`reports/CURRENT_SYSTEM_BASELINE_v0.2.md`](./reports/CURRENT_SYSTEM_BASELINE_v0.2.md)。

## 2026-08-06 阿里云 FC 真实组合根软件层 v0.1

- FC live 模式不再被永久写死为不可启动，改为从固定、可审查的 `generated/live-bindings.mjs` 加载真实绑定；构建物缺失或接口不合规时在网络请求前失败关闭。
- 完成 OSS + PostgreSQL + Qwen 组合根：候选图和最多 4 张历史参考图全部从 OSS 对象键解析，调用方自带 URL 会被覆盖。
- 图片送模前强制读取 OSS 可信 SHA-256/字节数，并生成 HMAC 私有图片信封；没有签名能力的 live provider 无法通过 readiness。
- 修正 Qwen provider ID；完整 FC Function Role 临时 STS 三元组可用，长期 AK、非 STS 或不完整凭证继续失败关闭，凭证值不进入配置对象或日志。
- 清除正式 Qwen registry 中 Cloudflare/R2 host 残留；实际 OSS Bucket host 未经审查写入 allowlist 前，正式私有 URL 路径保持关闭。
- 回归：FC 17/17 + lint/build/smoke；网站生产构建、页面 10/10、TypeScript 66/66 全通过；本轮云资源、上传、RDS 连接、付费模型调用均为 0。
- 当前 Gate：`SOFTWARE_COMPOSITION_READY / CLOUD_BINDINGS_NOT_DEPLOYED / HUMAN_REVIEW_REQUIRED / AUTO_PASS_DISABLED`。
- 详细报告：[`reports/ALIYUN_FC_LIVE_COMPOSITION_v0.1.md`](./reports/ALIYUN_FC_LIVE_COMPOSITION_v0.1.md)。

## 2026-08-06 阿里云 RDS PostgreSQL Serverless 实时核价

- 已在阿里云主账号购买页验证：华北 2（北京）、PostgreSQL 16、基础系列、高性能云盘 20 GB、0.5–1 RCU、不强制弹性、自动启停、单可用区、数量 1。
- 购买页优惠后预计 `¥0.10～0.18/小时`；全天持续运行粗略为 `¥73～131.40/月`，低于已批准的基础设施月上限 `¥300`。自动暂停后实际计算费取决于活跃时长，存储等费用仍持续产生。
- 页面显示 5 折活动；优惠与最终金额以下单确认页为准，不作为长期价格承诺。
- 当前页面仍是默认 VPC/交换机；正式订单前必须选择 VisionQA staging VPC/vSwitch 与资源组。
- 用户已明确确认创建两个 RDS SLR；PostgreSQL 服务关联角色与数据库代理服务关联角色均已创建，购买页复验均为“已授权”。
- 北京区购买页当前只显示默认专有网络，没有 VisionQA staging 专用 VPC；正式下单前需先创建项目专用 VPC 与交换机，不使用默认网络。
- 未点击立即购买，未创建订单、未付款、未创建实例。
- 当前 Gate：`QUOTE_VERIFIED / WITHIN_BUDGET / SLR_AUTHORIZED / DEDICATED_VPC_REQUIRED / NOT_ORDERED`。
- 证据报告：[`reports/ALIYUN_RDS_LIVE_QUOTE_v0.1.md`](./reports/ALIYUN_RDS_LIVE_QUOTE_v0.1.md)。

## 2026-08-10 RDS 实例创建与初始化状态

- 已按已批准配置创建并核验 RDS Serverless PostgreSQL 16 实例 `pgm-2ze0uziz73r8abb8`，当前状态 `Running`；订单号 `2000999122970135`。
- 实例使用 VisionQA staging 专用 VPC/交换机，未创建公网连接地址。
- 应用账号计划为 `visionqa_app`，应用数据库计划为 `visionqa_staging`；现有 PostgreSQL migration 尚未执行。
- 本轮发现 `D:\VisionQA\secrets\rds_app_password.txt` 为 0 字节空文件，因此没有创建账号、数据库或授权；上传至 Cloud Shell 的空文件已删除，未输出或记录任何密码。
- 当前 Gate：`RDS_RUNNING / APP_ACCOUNT_BLOCKED_EMPTY_PASSWORD_FILE / MIGRATION_NOT_STARTED`。

### 2026-08-10 RDS 密码规则复验

- 密码文件已由用户保存并通过安全输入方式提交；密码正文未写入聊天、日志或命令历史。
- 阿里云返回 `InvalidAccountPassword.Format`，当前密码不符合 RDS 账号密码格式，因此 `visionqa_app`、`visionqa_staging` 和授权均未创建。
- RDS Serverless 实例已按自动启停策略进入 `STOPPED`，没有异常丢失；修正密码后将先启动实例，再重试账号、数据库和 migration。
- 当前 Gate：`RDS_STOPPED / APP_ACCOUNT_BLOCKED_PASSWORD_FORMAT / MIGRATION_NOT_STARTED`。

### 2026-08-10 RDS 密码字符集复验

- RDS 实例已从自动休眠状态成功启动并复验为 `Running`。
- 新密码满足长度与复杂度要求，但本地脱敏审计确认包含阿里云 RDS 不允许的字符；阿里云再次返回 `InvalidAccountPassword.Format`。
- 未输出密码正文；失败响应临时文件已删除。应用账号、数据库、授权和 migration 均未创建/执行。
- 当前 Gate：`RDS_RUNNING / APP_ACCOUNT_BLOCKED_UNSUPPORTED_PASSWORD_CHARACTER / MIGRATION_NOT_STARTED`。

### 2026-08-10 RDS 应用数据库初始化完成

- RDS Serverless PostgreSQL 16 实例已启动并保持专用 VPC 私网访问，无公网连接地址。
- 已创建应用账号 `visionqa_app`，状态 `Available`、类型 `Normal`。
- 已创建数据库 `visionqa_staging`，状态 `Running`。
- PostgreSQL 云盘实例不支持通用 `ReadWrite` 授权，已按阿里云接口契约改用 `DBOwner`；复验返回数据库权限 `ALL`。
- Cloud Shell 到 RDS 私网连通性为 `BLOCKED`，符合 VPC 隔离预期，不能从公网 Cloud Shell 直接执行 migration。
- 已打开 DMS 作为无公网 migration 通道；首次使用需要创建免费服务关联角色 `AliyunServiceRoleForDMS`，当前等待用户授权确认。
- 密码正文从未输出；Cloud Shell 临时响应文件已清理。
- 当前 Gate：`RDS_ACCOUNT_DATABASE_READY / DMS_SLR_APPROVAL_REQUIRED / MIGRATION_NOT_STARTED`。

## 2026-08-10 RDS Serverless 已购买

- 用户在最终核价后明确确认创建真实 RDS 实例。
- 已提交 Serverless PostgreSQL 16、基础系列、20GB、RCU 0.5–1、自动启停、北京可用区 L、VisionQA 专用 VPC/vSwitch，数量 1。
- 阿里云支付完成页返回“开通成功”，订单号 `2000999122970135`。
- 阿里云资源概览已显示云数据库 RDS 实例数量为 1。
- 实例列表当前持续加载，尚未取得实例 ID、运行状态和连接地址；不得宣称数据库已可连接。
- 当前 Gate：`RDS_ORDER_SUCCESS / INSTANCE_COUNT_1 / PROVISIONING_DETAILS_PENDING`。
- 创建报告：[`reports/ALIYUN_RDS_CREATION_v0.1.md`](./reports/ALIYUN_RDS_CREATION_v0.1.md)。

## 2026-08-10 RDS 运行状态复验

- 新版控制台实例列表因跨域脚本错误持续加载，已改用阿里云主账号 Cloud Shell 进行只读复验。
- 实例 ID：`pgm-2ze0uziz73r8abb8`。
- 查询结果：`engine=PostgreSQL / version=16.0 / status=Running`。
- 项目 PostgreSQL migration 已存在于 `web/drizzle-pg/0000_visionqa_baseline.sql` 和 `0001_normalize_storage_provider.sql`。
- 当前缺口：创建应用账号 `visionqa_app`、数据库 `visionqa_staging`，取得内网连接信息并执行 migration。
- 当前 Gate：`RDS_RUNNING / DB_ACCOUNT_AND_MIGRATION_PENDING`。

## 2026-08-03 商用上线前视觉与数据状态审计

- 已按 `design-taste-frontend` 与 `impeccable` 两套视觉规范完成审查；当前视觉体系方向成立，保持克制浅色工作台、单一强调色、图片主导和“批次为主 / 证据为详情”的结构。
- 修复 P0 假评分风险：客户上传批次后不再映射示例结果；真实评分完成前仅显示待评分状态，示例分数不会进入客户批次。
- 12 张内置测试数据已收口为明确的“示例项目”；客户可见的 Fixture、Canary、原型、待标定、本地确定性回放等研发标注已移除。
- 清理写死批次名、无效“新建模板”和已下线试点指标逻辑；补齐真实来源、参考图数量、隐私授权、本地保存范围与触摸控件尺寸。
- 自动验收：生产构建通过；页面/生产启动 9/9；规则、模型、存储、持久化适配与下载 66/66；ESLint 0 error / 0 warning。
- 当前决定：`GO_LOCAL_REVIEW / NO_GO_PUBLIC_COMMERCIAL`。用户先在 `http://localhost:3141` 验收原型；未确认前不部署阿里云。
- 正式商用阻塞项：账号与租户隔离、OSS/RDS/FC 正式接线、服务端额度与限流、密钥管理、隐私政策/用户协议、正式域名 HTTPS 与监控备份。
- 审计报告：[`reports/COMMERCIAL_LAUNCH_AUDIT_v0.1.md`](./reports/COMMERCIAL_LAUNCH_AUDIT_v0.1.md)。

## 2026-08-03 客户四步真实操作路径 v0.1

- 第一步“历史参考与 SKU”：支持最多 4 张历史优秀参考图、SKU 链接逐行输入和 CSV 导入。真实评估时参考图会作为独立图像进入 Qwen 上下文；SKU 链接只作为文本上下文，明确不冒充已抓取远程商品图。
- 第二步“客户画像”：支持目标风格多选、价格区间和目标人群多选；画像写入商业模板评估范围，页面持续显示当前摘要。
- 第三步“批次评分”：支持一次选择最多 10 张 JPG、PNG 或 WebP；前端建立真实队列并按单并发逐张调用现有阿里云百炼链路，显示等待、评分中、完成、失败和批次汇总。每张结果继续保留综合分、Gate、四大 Skill、中文证据、优化 Prompt、人工改判与本地审计。
- 第四步“筛选下载”：队列提供逐张勾选；可下载选中原图的真实 ZIP，或导出带 UTF-8 BOM 的 CSV，内容含综合分、四大 Skill、Gate 和优化 Prompt。
- 治理保持不变：默认 Fixture；只有显式授权和能力就绪才调用真实模型；最大 10 次、20 元、单并发；`AUTO_PASS_DISABLED`；所有真实结果人工终审；图片不持久化。
- 产品和视觉上下文已修复并升级：`web/PRODUCT.md` 与 `web/DESIGN.md` 不再包含乱码或“只支持 Mock”的过时描述。
- 验证：本地页面 HTTP 200；能力端点返回 `configured=true`、阿里云百炼北京区、10 次、2000 分预算；生产构建通过；ESLint 0 error / 0 warning；页面、规则、模型、存储与下载测试已覆盖。浏览器可视化连接工具出现本机路径故障，因此本轮未把截图检查冒充为已完成。
- 当前用户动作：刷新 `http://localhost:3141`，先用 1 至 2 张候选图和 1 至 2 张历史参考图完成一次人工验收。该操作会产生真实模型费用；除此之外无需新增授权、API Key 或充值。

## 2026-08-03 人工上传实测 P1/P2 修复

- P1 综合分缺失：平台促销主图明确检测到“缺少促销信息层”时，促销层级和商业信息可读性不再错误标记为不适用；系统确定性记为 0 分并继续计算商业分与综合分，Blocker 只覆盖最终 Gate，不再清空评分。
- P2 英文证据：Qwen 提示词已强制所有用户可见字段使用简体中文；`no_promotion_overlay`、`garment_logo_visible`、`fabric_texture_visible` 增加服务端中文兜底；前端规则标题同步显示中文业务名称。
- 新增回归测试：缺少促销层仍有数值综合分且 Gate 为 REJECT；已知英文问题被本地化为中文；UI 规则码显示中文。
- 验证：Adapter 16/16、Contracts/平台 29/29、UI Adapter 3/3、production build 全部通过；本地页面 HTTP 200。

线上私有原型：<https://visionqa-prototype.dingchenhui0618.chatgpt.site>

## 一眼看懂

VisionQA 面向**服饰电商 AI 模特商品图生产与审核团队**。它不是只判断图片能不能发布的门禁工具，而应形成以下闭环：

```text
商品白底图 / 官方确认稿
→ 单张 AI 模特草图
→ 对照商品真值定位商品漂移、人体结构和生成痕迹
→ 形成可审计的修正边界与改图 Prompt
→ 外部工具或未来 API 产生改图候选
→ 修改前后对比与四项人工复验
→ 本机生成 4K 尺寸文件与处理凭证
```

当前不再使用一个总完成度百分比混合表达工程完成、模型有效与客户价值；三类证据分开记录。40 张历史 Qwen 校准证明评审链路可运行，但也证明评分不满足自动放行标准，不能直接外推为当前“模特图修正”场景的有效率。

| 证据面 | 当前状态 | 下一门槛 |
|---|---|---|
| 产品定位与主流程 | 已收缩并进入代码、界面和契约 | 用 3–5 个真实服饰 SKU 验证问题是否高频、修正是否被采用 |
| 本机项目对象 | 可保存、恢复、追溯 | 真实账户、租户和云同步暂缓 |
| 商品图问题诊断 | 既有 Qwen 适配层可用；已修复无促销信息误判 | 以 AI 模特图用途重新建立人工标签与小样本准确性验证 |
| 图片修正 | 可生成改图任务、导出 Prompt、上传候选并前后对比 | 选定并授权千问 / Seedream / GPT 图像编辑 API 后接自动执行 |
| 4K 尺寸交付 | 本机高质量分级重采样已跑通 | 若要真实纹理重建，需授权并评测 AI 超分 Provider |
| 客户价值与付费 | 尚无本轮真实客户证据 | 记录改图耗时节省、一次通过率、采用率、付款与再次提交 |

## 2026-08-03 真实 Qwen 校准批次 v0.1

- 40/40 张真实模型请求返回 HTTP 200；38 张 `SUCCEEDED`，2 张 `AESTHETIC_REFERENCE` 因商业维度整体不适用保持 `PARTIAL`，没有伪造综合分。
- 38 张可比总分：模型平均高估 3.84 分，MAE 6.18，RMSE 6.56，只有 8/38 落在 ±5 分内。
- Gate 一致率 13/40（32.5%）：人工 PASS→模型 PASS 2；人工 REVIEW→模型 PASS 26；人工 REVIEW→模型 REVIEW 11；人工 REVIEW→模型 REJECT 1。
- 关键结论：当前模型有明显高分宽松偏置，尤其生活方式广告平均高估 5.47 分；`≥90 自动放行` 保持关闭，所有结果继续 `HUMAN_REVIEW_REQUIRED`。
- 分项问题：商品突出度 MAE 9.89、渠道图位适配 MAE 8.05、卖点清晰 MAE 7.53；7 张图片错误地把非商业文字计入信息可读性。
- 已冻结提示词校准 v0.1：增加严格 90+ 证据门槛、82–91 优秀商业图锚点、生活方式图高分约束和信息可读性适用规则；暂不改四 Skill 权重与 90/70 Gate。
- 运行证据：输入 93,181 tokens、输出 46,678 tokens，平均延迟 29.5 秒/张；实际费用以阿里云账单为准。
- 报告：[`CALIBRATION_REPORT_v0.1.md`](./data/commercial_reference_corpus_v0.2/qwen_calibration_v0.1/CALIBRATION_REPORT_v0.1.md)、[`calibration_metrics_v0.1.json`](./data/commercial_reference_corpus_v0.2/qwen_calibration_v0.1/calibration_metrics_v0.1.json)、[`human_model_comparison_v0.1.csv`](./data/commercial_reference_corpus_v0.2/qwen_calibration_v0.1/human_model_comparison_v0.1.csv)。
- 当前 Gate：`REAL_CALIBRATION_COMPLETE / HUMAN_REVIEW_REQUIRED / AUTO_PASS_DISABLED / PROMPT_V0.1_READY_FOR_PAID_RETEST / HOLDOUT_LOCKED`。

## 2026-08-03 人工 Gold Score v0.1 收口

- 外部评审返回 40/40 张完整评分，素材、SHA、评审员签名和 `COMPLETED` 状态均完整；综合分范围 82–91，平均 86.58。
- 原表 `human_decision` 为 40 个 PASS，但其中 38 个综合分低于产品自动通过线 90。为避免把“优秀正向参考”与“系统自动放行”混为一谈，原决定以 `human_decision_raw` 保留，运行 Gate 新增 `threshold_gate_decision`：PASS 2、REVIEW 38、REJECT 0。
- 人工综合分作为评审员判断被冻结；另行输出 25%/20%/20%/35% 公式核查列，不反向覆盖人工分。
- 与 Qwen canary 仅重合 1 张，且人工用途为 `AESTHETIC_REFERENCE`，Qwen 当时按 `PLATFORM_PROMOTION_MAIN_IMAGE` 评估；可比样本为 0，当前不能计算 MAE、Gate 一致率或模型准确率。
- Gold 入口：[`data/commercial_reference_corpus_v0.2/gold_labels_calibration_v0.1.csv`](./data/commercial_reference_corpus_v0.2/gold_labels_calibration_v0.1.csv)。
- 验收与统计：[`human_review_validation_report_v0.1.md`](./data/commercial_reference_corpus_v0.2/human_review_validation_report_v0.1.md)、[`calibration_statistics_v0.1.json`](./data/commercial_reference_corpus_v0.2/calibration_statistics_v0.1.json)、[`qwen_human_gap_report_v0.1.md`](./data/commercial_reference_corpus_v0.2/qwen_human_gap_report_v0.1.md)。
- 当前 Gate：`HUMAN_GOLD_SCORE_READY / GATE_NORMALIZED / HOLDOUT_LOCKED / MODEL_CALIBRATION_PENDING / ACCURACY_CLAIM_BLOCKED`。

## 2026-08-03 真实 MVP Canary 收口

- 数据授权：用户明确允许“小宇电商图素材”和“枪王电商图素材”用于 VisionQA 训练、提示词校准、评测与阿里云百炼受控调用；API Key 仅从本地环境读取，未写入代码、日志或项目文档。
- 累计执行 15 次受控真实 Qwen 请求；另有 5 次本地 429 计数器拒绝，未到达阿里云、未计入真实请求。
- 修复三项真实链路问题：模型 JSON 包装/轻微结构漂移容错；缺少上下文不得把既有 REJECT 降为 REVIEW；完整参考声明不再无条件清空综合分。
- 大图预检已加入受控压缩：3.46 MB 样本压缩为约 106 KB 后成功评测，原图未修改，临时衍生文件调用后删除。
- 最终一轮 5/5 HTTP 200：
  - `gwang/6e977399dd360b69.jpg`：REVIEW / PARTIAL；
  - `gwang/700d190d8cf52b9e.jpg`：REJECT / PARTIAL；
  - `gwang/f5ddce3cb4b24e98.jpg`：REJECT / PARTIAL；
  - `xiaoyu/d5b064961a59c36a.jpg`：82 / REVIEW / SUCCEEDED；
  - `xiaoyu/fd7e3fb17988a2d7.jpg`：REJECT / PARTIAL。
- 业务结论：两组素材可以作为“优秀摄影/审美参考”，但不能无条件作为“天猫促销主图高分真值”；必须增加用途标签（摄影参考、生活方式图、商品主图、促销主图、详情页）后分别校准。
- 已合并形成 190 张商业审美参考语料 manifest：小宇 87 + 枪王 103，190/190 权利状态已记录；当前 5 张具有最终一轮真实模型暂定标签，人工 gold label 仍为 0。入口：[`data/commercial_reference_corpus_v0.1/corpus_manifest.csv`](./data/commercial_reference_corpus_v0.1/corpus_manifest.csv)。
- 验证：`npm test` 全部 70 项通过；`npm run lint` 0 errors / 0 warnings。
- 结果入口：[`data/mixed_commercial_reference_v0.3/live_results/canary_summary.csv`](./data/mixed_commercial_reference_v0.3/live_results/canary_summary.csv)。

## 2026-08-03 训练前数据工程 v0.2

- 190 张商业审美语料完成本地视觉指纹、联系表与组级复核；原图未移动、未重命名、未修改，未新增模型调用或费用。
- 完成 31 个拍摄/视觉组：小宇沿用 15 个冻结拍摄组，枪王经联系表复核收敛为 16 个拍摄系列。
- 用途分层：审美参考 34、生活方式广告 83、普通商品主图 65、平台促销主图 5、非服饰商业素材 3。
- 数据拆分：`TRAIN_REFERENCE` 119、`CALIBRATION_REVIEW` 40、`EVALUATION_HOLDOUT` 31。
- 防泄漏验证：SHA 重复组 0、跨拆分拍摄组 0、已调用 Qwen 的 7 张进入盲测集 0、待定用途 0。
- 13 张联系表与 190 张人工标注模板已生成；盲测集标记为 `LOCKED_NO_MODEL_CALL`。
- 40 张校准集已单独生成 3 张人工联系表，评审员无需浏览全部 190 张；入口：[`data/commercial_reference_corpus_v0.2/calibration_contact_sheets`](./data/commercial_reference_corpus_v0.2/calibration_contact_sheets)。
- 入口：[`data/commercial_reference_corpus_v0.2/README.md`](./data/commercial_reference_corpus_v0.2/README.md)、[`calibration_human_review_v0.1.csv`](./data/commercial_reference_corpus_v0.2/calibration_human_review_v0.1.csv)、[`evaluation_holdout_lock_v0.1.csv`](./data/commercial_reference_corpus_v0.2/evaluation_holdout_lock_v0.1.csv)。
- 当前 Gate：`DATA_SPLIT_READY / PLACEMENT_LABELS_PROVISIONAL / HUMAN_SCORES_PENDING / HOLDOUT_LOCKED / MODEL_TRAINING_NOT_STARTED`。

## 2026-07-29 CTO 团队执行归档

### 团队角色

第一波决策 Lead：

- 产品负责人兼项目经理 Lead：MVP 范围、角色契约、里程碑和外部审查权；
- 技术架构 Lead：模型观察/确定性策略/人工治理三层架构、API、D1/R2 与执行依赖；
- Data & Evaluation Lead：数据治理、LOW 单变量、B0/B1/B2 基准、盲测和防泄漏。

第二波实现与验收 Agent：

- 契约与规则运行时实现 Agent；
- AI 模型 Adapter 实现 Agent；
- 后端数据平台实现 Agent；
- Dataset Ops / Controlled Negative Implementation Agent；
- 前端集成与 UX 状态实现 Agent；
- 独立测试与发布质量 Lead。

各 Agent 的职责、输入、输出和独立验收详见：

- [`agents/cto_mvp_execution_summary_v0.1.md`](./agents/cto_mvp_execution_summary_v0.1.md)

### 第一波交付

- 完成 [`agents/product_program_lead_mvp_charter_v0.1.md`](./agents/product_program_lead_mvp_charter_v0.1.md)；
- 完成 [`agents/technical_architecture_lead_mvp_plan_v0.1.md`](./agents/technical_architecture_lead_mvp_plan_v0.1.md)；
- 完成 [`agents/data_evaluation_lead_mvp_plan_v0.1.md`](./agents/data_evaluation_lead_mvp_plan_v0.1.md)；
- 冻结 MVP 为真实模型参与、确定性门禁、四 Skill/商业模板评分、Repair Prompt、100% 人工复核和服务端审计的受控系统；
- 明确排除自动发布、CTR/CVR/ROI 声明、自训练模型、多场景扩张和 production 直接发布。

### 第二波交付

- evaluation-result 升级至 v0.3，商业模板升级至 v0.2；
- 四 Skill、商业六项、综合分、Gate、未评估和 Repair Prompt 已统一为服务端确定性规则；
- Fixture 和 OpenAI Responses API Provider Adapter 代码路径完成，真实调用由五项配置门硬阻断；
- 后端批次、完整评估、读取、追加式人工改判和审计 API 候选完成；
- D1 migrations 已扩展至 `0000–0005`，共 11 张表、4 个幂等唯一索引；
- 前端接入 v0.3 Data Adapter 和正式 evaluation/override API，显式区分 Fixture、loading、real 和 fallback；
- 8 项 LOW 单变量提案及来源/权利/锁定项完成，但仍是 `PLAN_ONLY`，图片数量为 0；
- 外部集中审查包已建立：
  - [`handoffs/MVP_EXTERNAL_REVIEW_v0.1/README.md`](./handoffs/MVP_EXTERNAL_REVIEW_v0.1/README.md)
  - [`handoffs/MVP_EXTERNAL_REVIEW_v0.1/external_review_decisions.csv`](./handoffs/MVP_EXTERNAL_REVIEW_v0.1/external_review_decisions.csv)

### 独立 QA 结果

- Web：**32/32 PASS**，lint 与 build 通过；
- Python 离线评估器：**12/12 PASS**，当前需设置 `PYTHONPATH=D:\VisionQA\src`；
- migration：`0000–0005` 在空内存 SQLite 顺序执行通过，得到 11 表、4 个幂等索引；
- API 负测：400/401/422/503 与稳定错误码符合预期；
- Provider 批准门：OpenAI 路径五项必要变量缺失时均在 fetch 前拒绝，真实付费调用为 0；
- production smoke：本地 `vinext start` 下 HTML、全部 JS/CSS、字体、关键商品图均为 200 且 MIME 正确，hydration 可交互；
- 已关闭 P1：
  - `P1-IDEMPOTENCY`；
  - `P1-DATA-01/02`；
  - `P1-FE-STATIC`；
- 当前无开放 P1；仍有不阻断代码候选的 P2。

> “production smoke 通过”只表示本地 production build/start 的静态资源与 hydration 通过，不表示已经部署 production。

### 当前 Gate

```text
内部代码候选：PASS
Cloudflare D1/R2 路线：STOPPED_FOR_MAINLAND_ACCESS
目标架构：cn-beijing OSS + RDS PostgreSQL + FC + Qwen
阿里云迁移代码：CODE_GO
阿里云授权准备：OWNER_DECISIONS_RECEIVED / EVIDENCE_PENDING
阿里云 Operator readiness：READY_FOR_WAVE1_EXECUTION
阿里云 Wave1 授权：APPROVED / SAFE_UI_CONTROL_BLOCKED
阿里云 Wave1 脚本：v0.1–v0.4 SUPERSEDED_DO_NOT_RUN；v0.5 READY_FOR_FINAL_INDEPENDENT_QA / NOT_EXECUTED
真实阿里云 staging：NO-GO
云端 smoke：NO-GO
Qwen 5 张真实 canary：HOLD / NOT_RUN_GOVERNANCE_HOLD（本地候选已选，外传与调用为 0）
LOW 计划外审：原始 8/8 ACCEPT；执行复核后 CN-001–007 TOOLING_BLOCKED、CN-008 REWORK_REQUIRED
原 OpenAI 四项决定：SUPERSEDED_NOT_ACTIVATED，历史保留、真实调用为 0
Qwen 北京固定快照实现：GO（默认锁定、40/40 + 7/7）
production 发布：NO-GO
自动发布 / ≥90 直接发：NO-GO
```

### 外审决策接入（2026-07-29）

- 已直接读取并校验 `external_review_decisions.csv`：实际 **15 行、15 个唯一 decision_id**，不是摘要所称 16 行；
- 8 项 LOW 为 `ACCEPT`，2 项 UI 为 `ACCEPT`，staging D1/R2 与 Provider/模型/付费/数据共 5 项为 `APPROVE`；
- LOW 决定由“产品负责人（代理外部审查）”签署，与表内要求的服饰电商视觉专家角色不完全一致；保留原始决定，但实际 PSD 制作前补视觉专家 cosign；
- 制作级复核发现 CN-001–CN-007 需要 PSD 图层级精确编辑，当前 imagegen 无法保证单变量与非目标像素锁定，状态为 `TOOLING_BLOCKED`，禁止用近似生成替代；
- 已独立核对 CT-014 原图，确认不存在 CN-008 计划描述的右下角“立即购买”CTA；外审 ACCEPT 不能覆盖源图事实错误，CN-008 状态为 `REWORK_REQUIRED` 并须重新外审；
- CN-007 的“裁切后促销组仍 ≥50% 可见”已固化为硬验收，低于 50% 必须返工且不得进入盲评；
- UI 外审提到的 Inspector 写死和 128/12 计数属于陈旧反馈，当前代码、测试和独立 QA 已证明修复，不重新开 bug；
- 原 OpenAI Provider 四项决定曾批准但组合门从未闭环，现统一为 `SUPERSEDED_NOT_ACTIVATED`；
- 用户已确认真实模型改走国产路线；首选阿里云百炼北京地域固定快照 `qwen3-vl-plus-2025-12-19`，备用 `glm-4.6v`，豆包/千帆保持 HOLD；
- 国产路线仍须等待独立外审、20 CNY 预算责任人批准，以及账户管理员对北京地域、不训练、留存天数、删除 SLA、人工审核和私网/短期 URL 的非敏感证明；
- 规范化执行台账：[`handoffs/MVP_EXTERNAL_REVIEW_v0.1/execution_ledger.csv`](./handoffs/MVP_EXTERNAL_REVIEW_v0.1/execution_ledger.csv)；
- 决策接入报告：[`agents/external_decision_intake_report_v0.1.md`](./agents/external_decision_intake_report_v0.1.md)。

### 外审后的实际执行状态（2026-07-29）

- UI：桌面和移动均为 `ACCEPTED_BASELINE`；移动端等 staging 真图出现后复核双滚动、Inspector 联动、按钮可达和水平溢出；
- Cloudflare staging：Sites 无隔离 staging 资源能力，转用 Wrangler；`wrangler whoami` 返回未认证，当前为 `APPROVED_BUT_BLOCKED_BY_CLOUDFLARE_AUTHENTICATION`；
- Cloudflare 本轮没有创建 D1/R2、没有远程 migration、没有 remote dev、没有部署或修改 production；
- LOW：实际为 `0 PRODUCED / 7 TOOLING_BLOCKED / 1 PLAN_REWORK_REQUIRED`；
- PSD 工具：源 RAR/PSD 可达，但本机没有已授权并登录的 Photoshop，CN-001–CN-007 不能开始精确图层制作；
- CN-008：已从不存在 CTA 的 CT-014 改为确有“立即购买 >>”CTA 的 CT-011，并重写为只降低 CTA 文字局部对比；
- CN-005、CN-006：已增加 bbox、字号、对比度、间距、元素数量和优惠事实 token 的机器可测容差；
- 数据 v0.2 复审包只需重看 `CN-005 / CN-006 / CN-008`，其他五项不重复审查；
- Provider：国产路线已经由用户确认，但 Qwen 的新外审和阿里云账户级数据治理证明尚未闭环；
- 任何国产 API key 与账户凭据都是全部非敏感证明通过后的后置动作，禁止在聊天、CSV、Markdown 或普通 `.env` 中传递；
- 不把公开“不用于训练”误写成零留存；精确保留期、删除 SLA、人工访问和备份淘汰必须由账户管理员、合同或工单证明。

最新证据：

- [`agents/cloudflare_staging_operator_report_v0.1.md`](./agents/cloudflare_staging_operator_report_v0.1.md)
- [`agents/controlled_negative_production_report_v0.1.md`](./agents/controlled_negative_production_report_v0.1.md)
- [`agents/psd_tooling_capability_report_v0.1.md`](./agents/psd_tooling_capability_report_v0.1.md)
- [`agents/openai_provider_governance_report_v0.1.md`](./agents/openai_provider_governance_report_v0.1.md)
- [`handoffs/controlled_negative_plan_review_v0.2/README.md`](./handoffs/controlled_negative_plan_review_v0.2/README.md)

### 阿里云国内迁移最终归档（2026-07-29）

- Cloudflare D1/R2 主路径已正式标记为 `STOPPED_FOR_MAINLAND_ACCESS`，不再要求用户完成 Wrangler OAuth；
- 唯一目标拓扑固定为 `cn-beijing OSS + RDS PostgreSQL + FC + Qwen`；
- 代码与本地验收结论为 `CODE_GO`：
  - OSS 专项测试：**9/9 PASS**；
  - PostgreSQL / D1 / 对抗测试：**28/28 PASS**；
  - FC 专项测试：**11/11 PASS**，lint、build、smoke 通过；
  - 主仓全量测试：**52/52 PASS**，lint、build 通过；
  - 开放 P0：**0**；开放 P1：**0**；
- 以上结论仅证明迁移代码和本地 fixture 可进入授权后的云端接入，不代表真实阿里云资源已经创建；
- 真实 `staging / cloud smoke / Qwen canary / production` 均为 `NO-GO`；
- 唯一有效授权包为 [`handoffs/ALIYUN_AUTHORIZATION_v0.2/`](./handoffs/ALIYUN_AUTHORIZATION_v0.2/)：
  - 共 12 项决定，12/12 owner 决定值、姓名、日期和角色声明结构有效；
  - 同目录未发现可读取的脱敏配置截图、工单、协议或撤销清单，12 项保持 `PENDING_EVIDENCE`；
  - 当前状态为 `NOT_AUTHORIZED_FOR_STAGING_RESOURCE_CREATION`；
  - `ALIYUN-OSS-001` 唯一口径为当前对象 14 天永久删除、未完成 Multipart 1 天清理；
  - [`ALIYUN_AUTHORIZATION_v0.1`](./handoffs/ALIYUN_AUTHORIZATION_v0.1/) 已被替代，只能用于历史审计，不得继续签署或作为资源配置依据；
- 授权完成后按固定顺序触发：授权接入 → 资源创建 → 云端 smoke → Qwen 5 张 canary；
- 用户当前唯一动作详见 [`handoffs/NEXT_ACTIONS_v0.1.md`](./handoffs/NEXT_ACTIONS_v0.1.md)。

迁移证据：

- [`agents/aliyun_staging_architecture_v0.1.md`](./agents/aliyun_staging_architecture_v0.1.md)
- [`agents/aliyun_migration_impact_v0.1.md`](./agents/aliyun_migration_impact_v0.1.md)
- [`agents/aliyun_authorization_governance_v0.2.md`](./agents/aliyun_authorization_governance_v0.2.md)
- [`agents/aliyun_oss_implementation_report_v0.1.md`](./agents/aliyun_oss_implementation_report_v0.1.md)
- [`agents/postgres_backend_migration_report_v0.1.md`](./agents/postgres_backend_migration_report_v0.1.md)
- [`agents/aliyun_fc_runtime_implementation_report_v0.1.md`](./agents/aliyun_fc_runtime_implementation_report_v0.1.md)
- [`agents/aliyun_migration_qa_report_v0.1.md`](./agents/aliyun_migration_qa_report_v0.1.md)

### 国产 Provider 切换与最新工程验证

- 原 OpenAI 四项审批保留历史，但统一为 `SUPERSEDED_NOT_ACTIVATED`；
- OpenAI 组合门从未闭环，OpenAI 真实网络调用为 0，原 50 USD 决定不得继承；
- 国产路线顺位：
  - 首选：阿里云百炼华北 2（北京）`qwen3-vl-plus-2025-12-19`；
  - 备用：智谱 `glm-4.6v`；
  - HOLD：豆包、百度千帆；
- Qwen Adapter 固定北京 endpoint 和 dated snapshot，旧 OpenAI 环境变量、浮动模型和未知 Provider 均无法触发网络；
- Provider 只产生观察草稿，v0.3、四 Skill、商业六项、Gate 和 Repair Prompt 仍由本地确定性规则处理；
- Canary 数据包已准备 5 张：CT-030 / CT-012 / CT-024 / CT-044 / CT-035，不包含图片副本，gold 不得外发；
- `npm test`：**40/40 PASS**；
- Qwen 独立负测：**7/7 PASS**；
- lint：PASS；
- `QWEN_REAL_CALLS_OBSERVED=0`；
- `OPENAI_REAL_CALLS_OBSERVED=0`；
- 当前 QA Gate：
  - 默认锁定 Qwen 实现：`GO`；
  - staging API 接线但保持 fetch=0：`CONDITIONAL GO`；
  - 运行 5 张真实 Qwen canary：`NO-GO`；
  - production：`NO-GO`。

国产 Provider 四项正式决定仍待外审/管理员证明：

1. `DOMESTIC-ROUTE-001`：国产路线；
2. `DOMESTIC-QWEN-001`：北京地域与固定快照；
3. `DOMESTIC-BUDGET-001`：20 CNY、5 张、最多 15 请求、并发 1；
4. `DOMESTIC-DATA-001`：账户地域、不训练、留存、删除、人工审核、日志回流、私网/短期 URL 和最小权限。

证据：

- [`agents/domestic_model_selection_report_v0.1.md`](./agents/domestic_model_selection_report_v0.1.md)
- [`agents/domestic_model_data_governance_v0.1.md`](./agents/domestic_model_data_governance_v0.1.md)
- [`agents/domestic_adapter_architecture_v0.1.md`](./agents/domestic_adapter_architecture_v0.1.md)
- [`agents/domestic_provider_change_control_v0.1.md`](./agents/domestic_provider_change_control_v0.1.md)
- [`agents/qwen_adapter_implementation_report_v0.1.md`](./agents/qwen_adapter_implementation_report_v0.1.md)
- [`agents/qwen_adapter_qa_report_v0.1.md`](./agents/qwen_adapter_qa_report_v0.1.md)
- [`agents/domestic_canary_dataset_report_v0.1.md`](./agents/domestic_canary_dataset_report_v0.1.md)
- [`handoffs/DOMESTIC_PROVIDER_REVIEW_v0.1/README.md`](./handoffs/DOMESTIC_PROVIDER_REVIEW_v0.1/README.md)

## 本轮已经确认的核心纠偏

以下不是讨论项，而是接下来所有 PRD、标准、契约和 UI 必须遵守的产品基线：

### 1. 必须有 0–100 分

- 每张图必须显示**综合分（0–100）**和分项分；
- 分数用于批量排序、阈值分级和规模化自动筛选；
- `PASS / REVIEW / REJECT` 继续保留，但它是发布处置状态，不替代分数；
- “综合分 ≥ 90 可直接进入发布流程”是当前产品目标示例，**具体阈值和是否自动发布仍须真实数据标定与人工批准**；
- 原型中的任何分数目前都是演示数据，不代表模型实测结果。

### 2. 硬门禁仍然优先

- 已确认的商品事实错误、严重人体结构问题、关键文字/Logo 错误、明确合规风险或不可评估情况，必须先触发门禁；
- Blocker 不能被商业价值或其他维度的高分抵消；
- 疑似 Blocker 或证据不足进入 `REVIEW`；
- 正确关系是：**门禁负责安全底线，评分负责质量等级、排序和优化**。

### 3. 回到四大 Vision QA Skill 框架

| Skill | 暂定权重 | 主要回答 |
|---|---:|---|
| 真人真实性 | 25% | 人脸、皮肤、头发、手部、肢体与姿态是否真实可信 |
| 摄影真实性 | 20% | 光影、镜头、透视、景深、曝光与摄影物理是否成立 |
| 材质真实性 | 20% | 皮肤、面料、褶皱、重力、反射与透明关系是否可信 |
| 商业价值 | 35% | 商品是否突出、卖点是否清晰、是否有点击欲望和品牌感 |

服饰专属规则码（如 `PF-03`、`HI-04`）继续作为底层证据和垂直规则，但必须映射回四大 Skill，而不是取代四大 Skill。

> 上述权重来自策划书 v0.1，是当前产品默认值；真实素材试标后允许调整，但调整必须有数据和版本记录。

### 4. 修复 Prompt 是核心输出

每张需要优化或返工的图片，除问题判断外，还必须输出：

- 可直接复制的修复 Prompt；
- 必须保持不变的商品信息；
- 需要修改的问题与区域；
- 建议的摄影、材质和人物真实感表达；
- 商业卖点强化建议；
- 必要时给出“局部修复”与“重新生成”两种策略。

这项能力需要被单独评测：Prompt 是否被采用、返工后问题是否解决、是否引入新问题。

### 5. “没有毛病”不等于“能卖”

商业价值是权重最高的核心维度。系统必须区分：

- 有明显缺陷、不可发布；
- 没有硬伤但平庸；
- 商品表达清楚、具有点击和转化潜力；
- 符合特定品牌与版位目标。

在品牌规范或目标渠道/图位缺失时，商业价值只能做有限评估，不能声称“符合品牌”。

## 当前阶段与已完成内容

### 已完成

- 冻结首个场景：服饰电商 AI 模特商品图发布前质检；
- 冻结首批品类默认值：女装上装、连衣裙；
- 建立多 Agent 职责、交接和验收规则；
- 完成策划书 v0.1 原始逻辑及 v0.2 执行版；
- 建立服饰缺陷 taxonomy、硬门禁、rubric 与正反例采集规范草案；
- 建立评估结果 JSON Schema 和示例；
- 建立双人标注协议、模拟 case manifest 和 baseline 计划；
- 完成离线模拟执行器、manifest 校验、静态 HTML 报告及单元测试；
- 完成“A 为主、B 为证据详情”的可点击 Web 原型 v0.1；
- 完成人工改判、批次网格、单图证据、响应式布局等原型交互；
- 用户已确认：v0.1 审美作为原型可接受，主流程符合业务习惯。

### 本轮新增完成

- Web 原型 v0.2 已实现：
  - 批次图片直接显示 0–100 综合分；
  - Inspector 显示总分、门禁、四大 Skill 与权重；
  - 商业价值 35% 作为最高权重维度；
  - 证据详情显示商业价值诊断；
  - 提供可选择、可复制的完整修复 Prompt；
  - 明确显示“策略演示分、待真实素材标定”；
- 新增 `docs/08_核心产品纠偏决定_v0.1.md`；
- 新增 `AI视觉质量评估系统_策划书_v0.3.md` 作为当前产品执行基线；
- 更新 Web 产品上下文和设计层级；
- UI v0.2 已通过构建、代码规范、自动测试和桌面/移动端浏览器检查。
- UI v0.2 已发布到私有线上原型地址。
- 用户已确认：
  - 总分、门禁和四大 Skill 的视觉优先级正确；
  - 商业价值语言接近真实电商判断方式；
  - 修复 Prompt 达到可复制标准；
- 修复网格 Inspector 写死问题，现在跟随选中图片更新；
- 12 张演示图的总数、状态计数和分数分档已经一致；
- 分数分档统一为 `90–100 PASS / 70–89 REVIEW / 0–69 REJECT`；
- 每张演示图拥有独立 Skill、商业判断、问题、Prompt、锁定项和证据坐标；
- 所有硬编码演示内容明确标注“非模型实时生成”；
- 证据坐标改为逐图数据字段，并明确后续由模型 evidence region 生成；
- 人工改判现可写入浏览器本地演示审计，刷新后仍可读取；
- 建立 D1 数据库表和迁移：素材、评估运行、图片评估、人工改判、审计事件；
- React multiple renderer 警告已诊断为旧 HMR 状态叠加真实引用错误；修复引用并重启后，新错误日志为空。
- 建立 `standards/skill_mapping_v0.2.md`，将四大 Skill、子指标与服饰规则码统一；
- 建立 `contracts/evaluation-result-v0.2.schema.json` 及配套示例，纳入综合分、分项分、商业判断、确定性门禁和结构化修复 Prompt；
- 建立 `/api/overrides` 人工审计写入接口：D1 可用时写入评估、改判与审计事件；
- 前端人工确认/改判已提交原因与业务证据；D1 未绑定或不可用时明确降级到浏览器本地，不再误报服务端成功；
- 增加服务端审计与降级路径的回归测试。
- 完成 53 套购买模板素材盘点：53 JPG、53 RAR、155 PSD，源压缩包约 1.60 GB；
- 用户已确认素材可用于内部研发和第三方视觉模型测试；
- 建立商业模板种子 `manifest.json` 与 53 行双人标注表；
- 冻结首个商业模板“天猫 / 平台促销主图”，建立六项指标及权重；
- 商业价值从无参照系的绝对判断改为“相对模板贴合度 0–100 + 等级 + 子项 + 差距”；
- 建立商业模板和校准事件 JSON Schema；
- 明确一次人工改判只进入校准日志，不能直接污染客户画像；
- 明确购买模板不是投放绩效数据，也不是四层准确率 gold set。
- 完成 UI v0.3：顶部可切换“天猫 / 平台促销主图”和“品牌旗舰主图”；
- 同一图片切换模板后，商业贴合度、六项子分、差距、综合分和状态统计可变化；
- 三个客观 Skill 保持不变，Blocker 可使 90 分图片继续 REJECT；
- 新建模板入口已预留，明确后续导入 brief、品牌指南和历史爆款图；
- 建立 `commercial_templates / commercial_profiles / commercial_recalibration_logs` D1 表和 migration；
- 人工确认与改判现在会携带模板版本、贴合度和子项，写入 `CAPTURED` 校准日志；
- UI v0.3 已通过构建、代码规范和 5 项自动测试。
- UI v0.3 已作为私有原型第 5 版发布到原有线上地址。
- 完成 53 张商业模板第一轮结构化初标：28 张 HIGH、13 张 MEDIUM、12 张 NOT_ASSESSABLE；
- 选出 15 张锚点候选：8 张高贴合、4 张边界、3 张不可评估；
- 建立带初始结论的锚点总览与无结论盲评总览；
- 建立独立第二评审 Brief，避免第二评审受到初始分数影响；
- 建立可直接转发的独立第二评审包，包含盲评图、口径说明和 15 行空白回填表；
- 建立商业模板评测协议：一致性、排序、不可评估识别、跨模板差异和校准日志指标；
- 完成初标表校验：53 个唯一素材号、15 个锚点、可评估与空分逻辑一致。
- 收到并原样归档 Reviewer B 的 15 张独立盲评；
- 完成一致性诊断：可评估性 κ -0.053、共同可评分样本 MAE 12.0、Spearman ρ 0.118；
- 识别 v0.1 评审表六项字段与正式商业模板不一致，以及等级阈值未写入 Brief 的协议缺陷；
- 基于图像事实完成 15 张适用性裁决：11 APPLICABLE、1 NOT_APPLICABLE、3 NOT_ASSESSABLE；
- 建立统一六项指标复评 Brief/CSV v0.2，Reviewer A 已完成 11 张复评；
- 生成可直接转发给 Reviewer B 的 11 张统一口径复评包。
- 收到并原样归档 Reviewer B 的 11 张统一口径复评，所有加权总分和等级校验通过；
- 同口径总分 MAE 5.73，达到 ≤10 目标；六项子分 MAE 为 6.45–8.55；
- 同口径总分 Spearman ρ 0.311，未达到 ≥0.75 的排序目标；
- 没有总分差 >15 或子项差 >20 的强制裁决项；
- 冻结 `anchor_gold_labels_v0.1.csv`：11 MEDIUM、1 NOT_APPLICABLE、3 NOT_ASSESSABLE；
- 建立评测协议 v0.2，固定六项字段、权重、等级阈值和适用性优先规则；
- 明确当前样本没有完整 HIGH/LOW 锚点，不能验证 ≥90 自动候选或稳定细粒度排序。
- 对剩余 38 张完成定向覆盖初筛，建立 9 张 HIGH 天花板候选和 5 张低分/跨渠道候选；
- 14 张候选经 Reviewer A 统一六项初筛后，高分方向为 82–87，完整低分方向最低约 72；
- 确认现有购买模板仍不能补齐真正 HIGH 与完整 LOW；
- 建立补图 Brief：用户以后只需优先提供 5–8 张公认优秀的完整促销主图；
- LOW 不再要求用户寻找，计划由项目使用授权模板制作并明确标记受控失败变体。

### 正在做

- 等待用户阅读阿里云授权包 v0.2 并完成 12 项 owner 决定；
- 在授权接入、真实资源创建和云端 smoke 前不提供 Key，继续保持 Qwen fetch=0；
- Cloudflare D1/R2 路线已因中国内地访问目标停止，不再等待 Wrangler OAuth；
- Photoshop/LOW 制作保留为可选支线，不再阻塞国产 Provider 主路径；
- 在阿里云 staging 与授权组合门满足前维持 Fixture、`NO_GO_REAL_STAGING` 和 `NO-GO_PRODUCTION`；
- 后续获得 5–8 张公认优秀平台促销主图后验证 HIGH 边界。

## 接下来的执行顺序

1. **用户完成阿里云 v0.2 授权表**  
   阅读 README，并由账户、预算、安全/数据和技术 owner 回填 12 项决定；一个人可兼任多个角色，但每行必须实名。

2. **授权接入 Agent 校验**  
   校验 12/12 决定、owner 权限、证据引用及 v0.2 唯一口径；旧 v0.1 不得接入。

3. **资源创建 Agent 执行**  
   仅在授权通过后，于 `cn-beijing` 创建私有 OSS、RDS PostgreSQL、FC 和最小权限 RAM/Secret；不得推进 production。

4. **云端 smoke Agent 验收**  
   验证私有对象、数据库 migration、FC 运行时、审计日志、成本保护和撤销路径。

5. **组合门满足后运行 5 张 Qwen canary**  
   凭据只由账户管理员写入 staging secret manager；首轮并发 1、最多 15 次请求、20 CNY 硬停且不自动续跑。

6. **正式 API 成功态**  
   用 staging evaluation 验证前端 real 状态、改判、跨浏览器审计。

7. **真实素材试标与 B2**  
   后续收集 20–30 组配对素材，双人独立标注并冻结 blind test。

8. **受控试点后再决定自动发布**  
   在真实误放率、Blocker 召回、审核效率和返工效果达标前，系统只作为人工审核辅助。

LOW/Photoshop 是可选支线：方便时安装授权 Photoshop，并让外部视觉审查者复审 `CN-005 / CN-006 / CN-008`；它不阻塞 staging 和 Qwen canary 主路径。

## 目前需要用户提供什么

### 现在不需要

- 暂时不需要再提供其他购买模板或 PSD；
- 不需要把 API key 发给 Agent、写入 CSV 或聊天；
- 不需要处理 OpenAI secret；原 OpenAI 路线已被替代且从未激活；
- 当前只需要 v0.2 的 12 项授权决定和非敏感证据引用，凭据必须后置；
- 暂时不需要批准自动发布；
- 暂时不需要确定正式产品名。
- 暂时不需要批准 production 部署；
- 暂时不需要准备 20–30 组真实客户 gold。

### 当前不需要额外确认

当前不需要补交 PSD、继续联系第二评审员或寻找 LOW 图片。Reviewer B 复评、15 项外审接入、代码候选和独立 QA 已完成。

当前用户按以下优先级执行：

1. 阅读 `ALIYUN_AUTHORIZATION_v0.2/README.md`；
2. 由相应 owner 填完 `authorization_decisions.csv` 的 12 项并回传；
3. 只回传非敏感证据引用，不提供 AK、Key、Token、数据库密码或签名 URL。

具体命令和边界见：

- [`handoffs/NEXT_ACTIONS_v0.1.md`](./handoffs/NEXT_ACTIONS_v0.1.md)

Photoshop 和 LOW 是后续可选支线，不属于当前用户行动清单，也不阻塞阿里云授权主路径。

后续非立即素材需求仍是：方便时提供 **5–8 张由设计师、运营或品牌方公认优秀的完整天猫/平台促销主图**，并说明目标图位与认可理由。

### 进入真实验证前必须提供或确认

- 20–30 组起步的配对素材：候选 AI 模特图 + 商品参考图 + SKU 不可变项；
- 每组素材的实际目标图位：主图、详情页、信息流广告或其他；
- 可选但很有价值：人工审核结论、返工原因、修复后版本；
- 品牌规范与禁用项；
- 真实客户素材的保存期限、访问角色和删除方式；
- 业务更不能接受哪种错误：危险误放还是过度拦截。

## 阻塞与风险

| 等级 | 事项 | 当前影响 |
|---|---|---|
| 高 | 没有候选 AI 图与商品参考图的配对 gold set | 阻塞四层准确率、门禁阈值和自动发布结论 |
| 高 | 53 套购买模板没有投放表现和负例 | 可建立商业判据，但不能证明点击或转化效果 |
| 高 | Phase 1 完整图片全部落在 MEDIUM | 缺少 HIGH/LOW 覆盖，排序和自动候选阈值无法验证 |
| 高 | 修复 Prompt 已有输出契约但尚无真实返工回归集 | 可能只生成听起来合理但无法执行的建议 |
| 高 | 阿里云 v0.2 的 12 项授权尚未回填 | 阻塞真实 OSS、RDS PostgreSQL、FC 和 Qwen staging 资源创建 |
| 高 | 真实阿里云 staging 与 cloud smoke 未执行 | 本地代码已 GO，但正式审计、资产、数据库和运行时尚未端到端验证 |
| 高 | Qwen canary 组合门未满足 | 授权、资源、数据治理、预算、撤销和云端 smoke 任一缺失都必须保持真实调用为 0 |
| 中 | LOW 图片为 0 | CN-001–007 受 Photoshop/PSD 工具阻塞；CN-005/006/008 还待复审 |
| 中 | 当前仅冻结平台促销主图 | 详情页、信息流和品牌旗舰模板尚未验证 |
| 中 | 品牌规范未提供 | 不能验证品牌感与品牌一致性 |
| 中 | 外部产品名未确定 | 不阻塞原型与标准工作，阻塞正式品牌发布 |

## 原型、模拟与真实验证的边界

| 内容 | 当前有无 | 可以说明什么 | 不能说明什么 |
|---|---|---|---|
| 可点击 Web 原型 | 有 | 页面结构、信息层级和审核流程可体验 | 模型真的能看懂图片或评分准确 |
| 内部 MVP 代码候选 | 有 | 契约、规则、Adapter、持久化、前端状态和本地 production smoke 可复现 | staging/production 已上线或真实模型已运行 |
| 演示图片与演示分数 | 有 | UI 呈现方式 | 客户图片质量、模型能力或商业收益 |
| 12 条模拟 case | 有 | JSON、规则分支、失败处理和报告链路可运行 | 真实准确率、召回率或自动发布安全性 |
| 53 套购买商业模板 | 有 | 建立平台促销主图判据、版式和信息层级种子 | 真实 CTR/CVR、客户偏好或端到端质检准确率 |
| Provider Adapter | OpenAI 为 SUPERSEDED；Qwen 北京固定快照实现与 QA 已完成 | 默认锁定实现可合并，40/40 + 7/7，缺门时 fetch=0 | Qwen 真实质量、成本、延迟或稳定性 |
| LOW 受控负例 | 0 张；有 8 项计划和 v0.2 复审包 | 源文件、计划、阻塞和机器容差可追溯 | 已有 LOW 图片、gold 或模型敏感性结果 |
| 真实视觉模型运行 | 无 | — | 当前不能声称已具备 AI 自动质检能力 |
| 授权 gold set / 盲测 | 无 | — | 当前不能标定 ≥90 等阈值或固定权重有效性 |
| 客户试点 | 无 | — | 当前不能声称节省人力、提高转化或可商业化 |

## 关键文件入口

建议每次审查先打开本文件，再按需要进入：

- 原始产品逻辑：[`AI视觉质量评估系统_策划书_v0.1.md`](./AI视觉质量评估系统_策划书_v0.1.md)
- 执行治理基线：[`AI视觉质量评估系统_策划书_v0.2.md`](./AI视觉质量评估系统_策划书_v0.2.md)
- 当前产品执行基线：[`AI视觉质量评估系统_策划书_v0.3.md`](./AI视觉质量评估系统_策划书_v0.3.md)
- CTO MVP 团队执行摘要：[`agents/cto_mvp_execution_summary_v0.1.md`](./agents/cto_mvp_execution_summary_v0.1.md)
- MVP 产品/项目章程：[`agents/product_program_lead_mvp_charter_v0.1.md`](./agents/product_program_lead_mvp_charter_v0.1.md)
- 技术架构与派工蓝图：[`agents/technical_architecture_lead_mvp_plan_v0.1.md`](./agents/technical_architecture_lead_mvp_plan_v0.1.md)
- 数据与评测团队计划：[`agents/data_evaluation_lead_mvp_plan_v0.1.md`](./agents/data_evaluation_lead_mvp_plan_v0.1.md)
- 独立 QA 发布验收：[`agents/qa_release_acceptance_report_v0.1.md`](./agents/qa_release_acceptance_report_v0.1.md)
- 外部审查说明：[`handoffs/MVP_EXTERNAL_REVIEW_v0.1/README.md`](./handoffs/MVP_EXTERNAL_REVIEW_v0.1/README.md)
- 外部审查决定表：[`handoffs/MVP_EXTERNAL_REVIEW_v0.1/external_review_decisions.csv`](./handoffs/MVP_EXTERNAL_REVIEW_v0.1/external_review_decisions.csv)
- 当前用户优先动作：[`handoffs/NEXT_ACTIONS_v0.1.md`](./handoffs/NEXT_ACTIONS_v0.1.md)
- 阿里云 v0.2 授权说明：[`handoffs/ALIYUN_AUTHORIZATION_v0.2/README.md`](./handoffs/ALIYUN_AUTHORIZATION_v0.2/README.md)
- 阿里云 v0.2 授权决定表：[`handoffs/ALIYUN_AUTHORIZATION_v0.2/authorization_decisions.csv`](./handoffs/ALIYUN_AUTHORIZATION_v0.2/authorization_decisions.csv)
- 阿里云最终迁移 QA：[`agents/aliyun_migration_qa_report_v0.1.md`](./agents/aliyun_migration_qa_report_v0.1.md)
- Cloudflare staging 阻塞报告：[`agents/cloudflare_staging_operator_report_v0.1.md`](./agents/cloudflare_staging_operator_report_v0.1.md)
- PSD 工具能力审计：[`agents/psd_tooling_capability_report_v0.1.md`](./agents/psd_tooling_capability_report_v0.1.md)
- LOW 制作执行报告：[`agents/controlled_negative_production_report_v0.1.md`](./agents/controlled_negative_production_report_v0.1.md)
- OpenAI Provider 治理报告：[`agents/openai_provider_governance_report_v0.1.md`](./agents/openai_provider_governance_report_v0.1.md)
- 国产模型选型：[`agents/domestic_model_selection_report_v0.1.md`](./agents/domestic_model_selection_report_v0.1.md)
- 国产数据治理：[`agents/domestic_model_data_governance_v0.1.md`](./agents/domestic_model_data_governance_v0.1.md)
- 国产 Adapter 架构：[`agents/domestic_adapter_architecture_v0.1.md`](./agents/domestic_adapter_architecture_v0.1.md)
- 国产 Provider 变更控制：[`agents/domestic_provider_change_control_v0.1.md`](./agents/domestic_provider_change_control_v0.1.md)
- Qwen Adapter 实现：[`agents/qwen_adapter_implementation_report_v0.1.md`](./agents/qwen_adapter_implementation_report_v0.1.md)
- Qwen 独立 QA：[`agents/qwen_adapter_qa_report_v0.1.md`](./agents/qwen_adapter_qa_report_v0.1.md)
- 国产 Canary 数据准备：[`agents/domestic_canary_dataset_report_v0.1.md`](./agents/domestic_canary_dataset_report_v0.1.md)
- 国产 Canary 数据包：[`datasets/domestic_provider_canary_v0.1/`](./datasets/domestic_provider_canary_v0.1/)
- 国产 Provider 最小外审包：[`handoffs/DOMESTIC_PROVIDER_REVIEW_v0.1/`](./handoffs/DOMESTIC_PROVIDER_REVIEW_v0.1/)
- 国产 Provider 决策接入报告：[`agents/domestic_provider_decision_intake_report_v0.1.md`](./agents/domestic_provider_decision_intake_report_v0.1.md)
- 国产 Provider 规范化执行台账：[`handoffs/DOMESTIC_PROVIDER_REVIEW_v0.1/execution_ledger.csv`](./handoffs/DOMESTIC_PROVIDER_REVIEW_v0.1/execution_ledger.csv)
- LOW v0.2 三项复审包：[`handoffs/controlled_negative_plan_review_v0.2/`](./handoffs/controlled_negative_plan_review_v0.2/)
- 核心纠偏决定：[`docs/08_核心产品纠偏决定_v0.1.md`](./docs/08_核心产品纠偏决定_v0.1.md)
- 批次工作流 PRD：[`docs/07_批次审核工作流_PRD_v0.1.md`](./docs/07_批次审核工作流_PRD_v0.1.md)
- 决策记录：[`docs/03_决策记录.md`](./docs/03_决策记录.md)
- 四大 Skill 的原始定义与权重：[`AI视觉质量评估系统_策划书_v0.1.md`](./AI视觉质量评估系统_策划书_v0.1.md)
- 服饰检查标准：[`standards/rubric_v0.1.md`](./standards/rubric_v0.1.md)
- 缺陷分类：[`standards/taxonomy_v0.1.md`](./standards/taxonomy_v0.1.md)
- 发布门禁：[`standards/gates_v0.1.md`](./standards/gates_v0.1.md)
- 当前评估结果契约：[`contracts/evaluation-result-v0.2.schema.json`](./contracts/evaluation-result-v0.2.schema.json)
- 契约示例：[`contracts/evaluation-result-v0.2.example.json`](./contracts/evaluation-result-v0.2.example.json)
- 四层 Skill 映射：[`standards/skill_mapping_v0.2.md`](./standards/skill_mapping_v0.2.md)
- 商业顾问原始 Brief：[`docs/09_商业价值评估模板_顾问Brief.md`](./docs/09_商业价值评估模板_顾问Brief.md)
- 商业模板化决策：[`docs/10_商业价值模板化决策_v0.1.md`](./docs/10_商业价值模板化决策_v0.1.md)
- 首个商业模板标准：[`standards/commercial_template_platform_promo_v0.1.md`](./standards/commercial_template_platform_promo_v0.1.md)
- 商业模板种子库：[`datasets/commercial_template_seed_v0.1/`](./datasets/commercial_template_seed_v0.1/)
- 53 张第一轮初标：[`datasets/commercial_template_seed_v0.1/initial_labels_v0.1.csv`](./datasets/commercial_template_seed_v0.1/initial_labels_v0.1.csv)
- 15 张锚点建议：[`datasets/commercial_template_seed_v0.1/anchor_set_v0.1.md`](./datasets/commercial_template_seed_v0.1/anchor_set_v0.1.md)
- 第二评审 Brief：[`datasets/commercial_template_seed_v0.1/second_reviewer_brief_v0.1.md`](./datasets/commercial_template_seed_v0.1/second_reviewer_brief_v0.1.md)
- 独立第二评审包：[`handoffs/VisionQA_商业模板第二评审包_v0.1_20260728.zip`](./handoffs/VisionQA_商业模板第二评审包_v0.1_20260728.zip)
- 第二盲评原始结果：[`datasets/commercial_template_seed_v0.1/reviewer_b_blind_v0.1.csv`](./datasets/commercial_template_seed_v0.1/reviewer_b_blind_v0.1.csv)
- 第二盲评一致性分析：[`evals/anchor_second_review_analysis_v0.1.md`](./evals/anchor_second_review_analysis_v0.1.md)
- 适用性裁决：[`datasets/commercial_template_seed_v0.1/anchor_categorical_adjudication_v0.1.csv`](./datasets/commercial_template_seed_v0.1/anchor_categorical_adjudication_v0.1.csv)
- Reviewer A 统一口径复评：[`datasets/commercial_template_seed_v0.1/reviewer_a_rescore_v0.2.csv`](./datasets/commercial_template_seed_v0.1/reviewer_a_rescore_v0.2.csv)
- Reviewer B 统一口径复评：[`datasets/commercial_template_seed_v0.1/reviewer_b_rescore_v0.2.csv`](./datasets/commercial_template_seed_v0.1/reviewer_b_rescore_v0.2.csv)
- Phase 1 共识标签：[`datasets/commercial_template_seed_v0.1/anchor_gold_labels_v0.1.csv`](./datasets/commercial_template_seed_v0.1/anchor_gold_labels_v0.1.csv)
- HIGH/LOW 覆盖候选初筛：[`datasets/commercial_template_seed_v0.1/coverage_candidate_shortlist_v0.1.md`](./datasets/commercial_template_seed_v0.1/coverage_candidate_shortlist_v0.1.md)
- 覆盖候选六项初筛：[`datasets/commercial_template_seed_v0.1/reviewer_a_coverage_screen_v0.1.csv`](./datasets/commercial_template_seed_v0.1/reviewer_a_coverage_screen_v0.1.csv)
- HIGH/LOW 补充 Brief：[`datasets/data_acquisition_high_low_brief_v0.1.md`](./datasets/data_acquisition_high_low_brief_v0.1.md)
- 统一口径最终报告：[`evals/anchor_rescore_final_report_v0.2.md`](./evals/anchor_rescore_final_report_v0.2.md)
- 机器可读评测结果：[`evals/anchor_rescore_metrics_v0.2.json`](./evals/anchor_rescore_metrics_v0.2.json)
- 商业模板评测协议 v0.2：[`evals/commercial_template_evaluation_protocol_v0.2.md`](./evals/commercial_template_evaluation_protocol_v0.2.md)
- Reviewer B 统一口径复评包：[`handoffs/VisionQA_商业锚点统一口径复评包_v0.2_20260728.zip`](./handoffs/VisionQA_商业锚点统一口径复评包_v0.2_20260728.zip)
- 商业模板评测协议：[`evals/commercial_template_evaluation_protocol_v0.1.md`](./evals/commercial_template_evaluation_protocol_v0.1.md)
- 商业模板契约：[`contracts/commercial-template-v0.1.schema.json`](./contracts/commercial-template-v0.1.schema.json)
- 商业校准事件契约：[`contracts/commercial-recalibration-event-v0.1.schema.json`](./contracts/commercial-recalibration-event-v0.1.schema.json)
- Baseline 计划：[`evals/baseline_plan_v0.1.md`](./evals/baseline_plan_v0.1.md)
- Web 原型源码：[`web/`](./web/)
- 旧进度记录（历史参考）：[`PROGRESS.md`](./PROGRESS.md)

## 最近更新记录

### 2026-07-29

- 接入阿里云 v0.2 owner 决定：12 行、12 个唯一 ID，决定值、姓名、日期和责任域声明均结构有效；
- 丁陈辉具名兼任账户、技术、预算、数据和安全 Owner；允许兼任但执行台账继续分离责任域；
- 核验授权目录没有新增脱敏截图、工单、服务协议或已签撤销清单，所有 evidence_reference 仍为自述或待补；
- 决定表当前 SHA-256 绑定为 `1d7b389c42781b90ad69ecd50380086727ccfd6dd94e937749add589b01c272b`；
- 生成 [`handoffs/ALIYUN_AUTHORIZATION_v0.2/execution_ledger.csv`](./handoffs/ALIYUN_AUTHORIZATION_v0.2/execution_ledger.csv) 与 [`agents/aliyun_authorization_intake_report_v0.1.md`](./agents/aliyun_authorization_intake_report_v0.1.md)；
- Gate 保持 `NOT_AUTHORIZED_FOR_STAGING_RESOURCE_CREATION`，Qwen `fetch=0`；
- 完成阿里云国内迁移最终归档：目标架构固定为 `cn-beijing OSS + RDS PostgreSQL + FC + Qwen`；
- Cloudflare D1/R2 路线更新为 `STOPPED_FOR_MAINLAND_ACCESS`，Wrangler OAuth 不再是用户下一步；
- 最终 QA 判定 `CODE_GO`：OSS 9/9、PG 28/28、FC 11/11、主仓 52/52，开放 P0/P1 均为 0；
- 真实阿里云 staging、云端 smoke、Qwen 5 张 canary 和 production 均保持 `NO-GO`；
- `ALIYUN_AUTHORIZATION_v0.2` 成为唯一有效授权包，12 项全部待 owner 回填；v0.1 标记为 `SUPERSEDED`；
- 项目整体成熟度保守更新为约 63%，不因本地迁移代码通过而高估真实云端和业务验证成熟度；
- 核验国产 Provider 实际返回 CSV：4 行、4 个唯一 ID、决定值与日期合法，所有基础 `evidence_ref` 文件存在；
- 接入路线级批准；因提交者仅声明“投资人+产品负责人代理外审”，Qwen 技术审查权限与预算责任人权限不做推定，继续保持 PENDING；
- 数据行仅记录为条件性产品批准；未发现阿里云账户管理员 Markdown/PDF、脱敏截图、合同或工单证据，管理员证明仍为 `NOT_FOUND`；
- 将审批 artifact 绑定为 `DOMESTIC_PROVIDER_REVIEW_v0.1`，SHA-256 为 `70b50cb4c5e2dbb493d1d32e70023b37191f92f0e3a7b0d3a72425bf55796dde`；registry 状态为 `PENDING_ROLE_AND_ACCOUNT_EVIDENCE`；
- 预算范围固定为 20 CNY、5 张、最多 15 请求、并发 1；真实网络请求与费用仍为 0；
- 用户正式决定真实模型从 OpenAI 切换为国产模型；
- 原 OpenAI 四项外审状态更新为 `SUPERSEDED_NOT_ACTIVATED`，保留审批历史并确认真实调用为 0；
- 确认 Qwen3-VL-Plus 北京固定快照为首选、GLM-4.6V 为备用，豆包与千帆保持 HOLD；
- Qwen 北京固定快照实现通过 40/40，独立负测通过 7/7；默认锁定实现 GO，真实 canary NO-GO；
- 国产 5 张 canary 数据控制面完成，Qwen 与 OpenAI 真实调用均为 0；
- 建立国产 Provider 最小外审/管理员证明包；明确公开“不训练”不等于零留存，保留期、删除 SLA、人工审核与网络路径仍由阿里云账户管理员举证；
- 由 CTO 编排完成第一波产品、架构、数据评测 Lead 交付；
- 完成第二波契约规则、模型 Adapter、后端平台、LOW 计划、前端集成和独立 QA；
- 实际 15 项外审决定已全部接入；UI 桌面/移动基线已接受，Provider 四项已批准但仍等待组合门；
- Cloudflare staging 执行已转到 Wrangler 路径，目前阻塞于本机未完成 OAuth，production 未修改；
- LOW 当前为 0 产出、7 项 PSD 工具阻塞；CN-008 已改用 CT-011 并重写；
- CN-005/006/008 已形成 v0.2 复审包，外部只需重看这三项；
- Qwen 治理与实现完成后，全量 Web 测试更新为 **40/40**，独立 Qwen 负测为 **7/7**，Python 仍为 12/12；
- 关闭 `P1-IDEMPOTENCY`、`P1-DATA-01/02`、`P1-FE-STATIC`，当前无开放 P1；
- 正式 Gate 为 `CONDITIONAL_GO_STAGING / NO_GO_PRODUCTION`；
- 历史阶段曾将用户优先顺序收敛为 Wrangler OAuth → 国产 Provider 四项外审；该顺序现已由阿里云 v0.2 的 12 项授权主路径替代；
- Photoshop 仅保留为 LOW 可选支线，不阻塞国产 Provider 主路径；
- 项目整体成熟度保守更新为约 61%，不因 Qwen mock/治理测试通过而高估真实模型和业务验证成熟度。

### 2026-07-28 17:59

- 完成剩余 38 张中的定向覆盖初筛；
- 9 张高分天花板候选经统一口径初筛后仅为 82–87；
- 完整低分候选最低约 72，另有两张应归为跨渠道而非 LOW；
- 确认当前购买模板无法提供真正 HIGH/LOW 覆盖；
- 制定 LOW 受控失败变体方案；
- 将用户后续补图需求收敛为 5–8 张公认优秀的完整平台促销主图。

### 2026-07-28 17:55

- 收到并校验 Reviewer B 的 11 张统一口径复评；
- 总分 MAE 从 v0.1 的 12.0 改善至 5.73，绝对分差目标通过；
- 总分 Spearman ρ 为 0.311，排序目标仍未通过；
- 六项子分没有任何 >20 分的强制裁决分歧；
- 冻结 15 张 Phase 1 共识标签：11 MEDIUM、1 NOT_APPLICABLE、3 NOT_ASSESSABLE；
- 保留 90 分 HIGH 假设，不因当前样本最高 86 就提前降低阈值；
- 下一步转向补齐完整 HIGH/LOW 样本，而不是继续反复复评同一批中档图片。

### 2026-07-28 17:36

- 收到并校验 15 张第二盲评，编号完整、文件已原样归档；
- 计算得到可评估性完全一致率 73.3%、κ -0.053、总分 MAE 12.0、Spearman ρ 0.118；
- 没有把未达标结果包装成通过，定位到六项字段不一致和等级阈值缺失两个协议 bug；
- 完成 #06/#21/#35 NOT_ASSESSABLE 与 #44 NOT_APPLICABLE 的证据裁决；
- 建立 v0.2 统一六项指标复评工具，Reviewer A 已完成，Reviewer B 待复评；
- 生成新的 11 张复评包，预计外部工作量 15–20 分钟。

### 2026-07-28 17:23

- 生成 15 行独立第二评审回填表；
- 打包盲评图、评审口径、回填表和转发说明；
- 当前用户只需转发评审包；暂时无需补充新图片或 PSD。

### 2026-07-28 17:20

- 完成 53 张购买模板的第一轮结构化初标；
- 得到 28 HIGH、13 MEDIUM、12 NOT_ASSESSABLE 的初始分布；
- 选出 8 个高贴合、4 个边界、3 个不可评估，共 15 张锚点；
- 生成带建议总览和独立盲评总览；
- 建立第二评审 Brief 和商业模板评测协议；
- 下一关键依赖为独立第二评审，而不是继续增加同类购买模板。

### 2026-07-28 17:00

- 完成商业价值模板化 UI v0.3；
- 实现模板切换、模板相对分、六项子分、优势和相对差距；
- 综合分随商业模板变化，但 Blocker 门禁保持独立；
- 建立商业模板、客户画像和校准日志 D1 表及 migration；
- 人工改判可捕获模板版本与商业评分，进入 `CAPTURED` 校准日志；
- 代码规范、生产构建和 5 项自动测试全部通过。
- 私有线上原型第 5 版发布成功。

### 2026-07-28 16:55

- 确认 53 套购买模板允许内部研发和第三方模型测试；
- 完成 53 JPG、53 RAR、155 PSD 的机器可读素材清单；
- 冻结“天猫 / 平台促销主图”为首个商业价值模板；
- 将商业价值重构为模板相对贴合度，并保留 0–100 分；
- 建立六项商业子指标、模板 Schema 和校准事件 Schema；
- 将下一阶段切换为 UI v0.3 模板化改造和 53 套素材初标。

### 2026-07-28 16:30

- 完成四大 Skill → 子指标 → 服饰规则码映射 v0.2；
- 完成评估结果数据契约 v0.2 和可验证示例；
- 接入人工改判服务端 API，提交改判原因、业务证据和模型评估快照；
- 加入 D1 不可用时的明确本地降级与存储位置提示；
- 将下一主线切换为评测协议、真实模型适配器和 D1 线上绑定。

### 2026-07-28 15:42

- 记录 UI v0.2 三项评审均通过；
- 修复选中图片与 Inspector 不联动的真实 bug；
- 统一 12 张演示数据的计数、分档和 decision；
- 将 Skill、商业判断、Prompt 和证据坐标改为逐图数据；
- 增加明确的演示数据标识和浏览器本地审计；
- 建立 D1 数据库 schema 和 migration，但尚未绑定生产数据库或接入写入 API；
- 清理开发进程并验证新的 `.devserver.err.log` 为空。

### 2026-07-28 15:15

- 完成 UI 原型 v0.2 的评分、四大 Skill、商业价值与修复 Prompt；
- 完成桌面与移动端浏览器检查，Prompt 复制有明确反馈；
- 新增产品执行基线 v0.3 和核心产品纠偏决定；
- 将下一主线切换为 UI 评审、Skill 映射和数据契约 v0.2。

### 2026-07-28 15:03

- 新建 `PROJECT_STATE.md` 作为统一项目状态入口；
- 记录用户对 UI v0.1 的评审：审美可接受，工作流符合业务习惯；
- 确认产品必须从“只有门禁”纠偏为“硬门禁 + 0–100 评分 + 四大 Skill + 商业价值 + 修复 Prompt”；
- 明确商业价值暂定 35%，四大 Skill 权重沿用策划书 v0.1；
- 明确综合分和 ≥90 阈值在真实标定前只能是产品假设/原型演示；
- 将 UI v0.2、PRD v0.3、Schema 升级和真实小样本验证列为后续主线。

## 2026-07-29 阿里云 Operator 只读就绪探针

- 用户已声明：RAM Operator + MFA 已登录、`VisionQAStagingOperatorBootstrapV01` 已绑定、AccessKey 数量为 0；
- 只读应用枚举观察到 Microsoft Edge 的窗口标题包含 `Cloud Shell`；
- Windows Computer Use 因无法高置信度识别当前 Edge 页面 URL 而按安全规则中止，没有继续点击或输入；
- 用户随后在 Edge Cloud Shell 手工执行脱敏只读探针，结果为 `STS=OK`、`POLICY=OK`、`OSS=OK`、`RDS=OK`、`FC=OK`、`ACTIONTRAIL=OK`；
- `VisionQAStagingOperatorBootstrapV01` 已通过 `ListPoliciesForUser` 复验为目标用户的直接自定义策略绑定；
- AccessKey 数量为 0 以用户声明记录，本轮没有读取、创建或修改 AccessKey；
- 当前 readiness 结论为 `READY_FOR_RESOURCE_PLAN`；
- 该结论仅允许进入资源计划与费用评审，不代表已经批准创建资源；
- 云资源创建/修改/删除为 0，订单/付费操作为 0，Qwen 真实调用为 0；
- 证据报告：[`agents/aliyun_operator_readiness_report_v0.1.md`](./agents/aliyun_operator_readiness_report_v0.1.md)。

## 2026-07-30 Agent 治理与用户沟通强制规则

- 新增项目级治理文件：[`AGENT_GOVERNANCE.md`](./AGENT_GOVERNANCE.md)。
- 创建任何新 Agent 前，CTO 必须先向用户清晰回答：
  1. 为什么不能由已有 Agent 完成？
  2. 是否存在独立且长期的职责？
  3. 是否会产生独立资产（代码、知识库或评估标准）？
- 任一答案为“否”时，默认不得创建新 Agent，必须复用现有 Agent；仅在重大风险、职责冲突或外部独立审查要求下，经用户确认后方可例外。
- 用户沟通默认只聚焦账号登录、权限授权、API Key/密钥安全配置、付费/订单/预算/钱包确认。
- 一般技术分工、脚本、测试和 QA 细节由内部 Agent 自行处理，不要求用户逐步推动。
- 只有出现重大安全、数据、成本、合规、不可逆风险，授权范围扩大，或外部审查明确要求时，才向用户升级技术细节或请求决策。
- 生效日期：`2026-07-30`。

## 2026-07-30 Agent 治理优先级补充

- 当前项目优先级：
  1. 跑通 VisionQA 端到端闭环；
  2. 验证视觉评分体系；
  3. 建立数据反馈机制。
- Agent 结构优化不得阻塞功能主线。
- 原有新 Agent“三问门”继续有效；此外，任何新增 Agent 必须同时证明：
  - 减少项目整体完成时间；
  - 产生归属明确的独立资产；
  - 降低实现、评审或运行错误率。
- 任一项不能证明时，默认复用现有 Agent。
- Wave1 完成后，可评估合并 `aliyun_wave1_policy_remediation` 与 `aliyun_staging_operator`。
- 独立 QA 必须保留，不与实现或 Operator 合并。
- `qwen_adapter_implementer` 暂不合并，继续独立维护模型适配资产。
- 完整规则见 [`AGENT_GOVERNANCE.md`](./AGENT_GOVERNANCE.md)。
## 2026-07-30 阿里云管理员前置执行

- 已创建免费管理对象资源组 `visionqa-staging`。
- 已复用并核验 FC Runtime Role `visionqa-staging-runtime`：信任主体仅为 FC，附加权限为 0。
- `VisionQAStagingOperatorBootstrapV01` 的 v0.2.3 对应策略版本已设为默认版本。
- `visionqa-staging-operator` 的指定策略绑定正常，AccessKey 数量为 0。
- 北京可用区已完成脱敏选定，具体值仅保存在受限私有证据文件中。
- 用户完成虚拟 MFA 绑定后，RAM `ListVirtualMFADevices` 只读复验确认 `visionqa-staging-operator` 已绑定；未读取或输出二维码、种子及验证码。
- 当前 Gate：`ADMIN_PREREQUISITES_COMPLETE / READY_FOR_WAVE1_EXECUTION`。
- Wave1 v0.5 已通过发布 QA，状态为 `AUTHORIZED_NOT_STARTED`；本轮没有执行 Wave1。
- 本轮未创建 OSS、RDS、FC 函数、NAT、EIP 或其他付费资源，未创建任何 AccessKey/API Key，未开通或调用 Qwen。
- 脱敏执行报告：[`agents/aliyun_admin_prerequisites_execution_report_v0.1.md`](./agents/aliyun_admin_prerequisites_execution_report_v0.1.md)。

## 2026-07-30 阿里云 Wave1 v0.5 云端预检

- 审定 ZIP 已上传，ZIP SHA-256 与包内 `SHA256SUMS` 全部通过；
- 受限私有 Zone、ResourceGroupId、FC Role ARN 已安全传入，未公开敏感值；
- `wave1_preflight.sh` 在创建资源前以 `static_access_key_env_present` 失败；
- 根因是 v0.5 无法区分 Cloud Shell 临时 STS 环境变量与长期静态 AccessKey；
- 失败后未重连、未执行 apply/verify/rollback；
- 新增云资源、费用、Qwen 调用、AccessKey 创建均为 0；
- 当前 Gate：`STOPPED_AT_PREFLIGHT / V0.5_DO_NOT_CONTINUE / V0.6_REMEDIATION_REQUIRED`；
- 证据：[`agents/aliyun_staging_wave1_cloud_execution_report_v0.1.md`](./agents/aliyun_staging_wave1_cloud_execution_report_v0.1.md)。

## 2026-07-30 阿里云 Wave1 v0.6 本地修复

- v0.5 已标记 `SUPERSEDED_DO_NOT_RUN`；
- v0.6 已安全区分 Cloud Shell 临时 STS 与长期静态 AccessKey；
- AK 无 Token、空 Token、假/过期 Token、STS 失败、身份不符和变量混用全部 fail-closed；
- 凭证门 Shell 测试 9/9、状态路径 8/8、I/O 故障 6/6、攻击测试 5/5、包内 SHA 全部通过；
- v0.6 ZIP SHA-256：`DF369258ADDD2D8BB5E153E5A0E9DD2B530503ECC56A60A383CA59D5FAE31601`；
- 当前 Gate：`V0.6_READY_FOR_INDEPENDENT_QA / NOT_EXECUTED`；
- 证据：[`agents/aliyun_staging_wave1_execution_report_v0.6.md`](./agents/aliyun_staging_wave1_execution_report_v0.6.md)。

## 2026-07-30 阿里云 Wave1 v0.7 本地修复

- v0.6 独立 QA 判定 `NO_GO`：无凭证环境错误地允许 profile/metadata fallback；
- v0.7 改为无完整临时 STS 环境一律 fail-closed，并禁用 profile fallback；
- 同一凭证链必须同时具备 ID、Secret、非空 SecurityToken，且 STS IdentityType/ARN 必须匹配批准身份；
- 凭证门 11/11、状态 8/8、I/O 6/6、攻击 5/5、SHA 全部通过；
- ZIP SHA-256：`07966CB55724F82C8232FBF39D8E82DC3DA313662E530EF69601A398D8629C4A`；
- 当前 Gate：`V0.7_READY_FOR_INDEPENDENT_QA / NOT_EXECUTED`；
- 新增云资源、费用、Qwen 调用、Key 均为 0。

## 2026-07-30 阿里云 Wave1 v0.8 本地修复

- v0.7 独立 QA 判定 `NO_GO`：`ALIBABA_CLOUD_IGNORE_PROFILE` 大小写不符合官方契约；
- v0.8 固定并验证大小写敏感 `TRUE`，新增 profile 优先级仿真；
- 未设、空值、小写 `true` 均不能证明同链，只有精确 `TRUE` 可使用临时 STS 环境链；
- 凭证/profile 测试 16/16、状态 8/8、I/O 6/6、攻击 5/5、SHA 全部通过；
- ZIP SHA-256：`1CD010C14BF7BB7C89C04868C7F5EF9702A5E5CEA1348E262A7AFEE14E4F037B`；
- 当前 Gate：`V0.8_READY_FOR_INDEPENDENT_QA / NOT_EXECUTED`；
- 新增云资源、费用、Qwen 调用、Key 均为 0。

## 2026-07-30 阿里云 Wave1 v0.8 云端恢复

- v0.8 独立 QA 已给出 `GO_FOR_MANUAL_CLOUDSHELL`；
- v0.8 ZIP 已上传，但 Cloud Shell 新 VM 不包含旧会话上传的策略制品与私有 runtime env；
- 全新目录准备在复制缺失制品时停止，随后连接断开；
- 未运行包内 SHA、preflight、apply、verify 或 rollback；
- 当前 Gate：`STOPPED_BEFORE_PREFLIGHT / REUPLOAD_PRIVATE_PREREQUISITES_REQUIRED`；
- 新增云资源、费用、Qwen 调用、Key 均为 0。
- 第二次已重新上传策略与私有 runtime env，但全新目录校验尚未返回结果时 Cloud Shell 再次断开；
- 自动重试已停止；需要稳定的新 Cloud Shell 会话后从头执行。
- 进一步定位：历史上传任务记录不会把文件带入新 VM；且直接执行含 `exit 1` 的检查会退出交互 shell；
- 后续修正为每个新 VM 重新上传三文件，并用子 shell 包装全部 fail-fast 编排命令。
- v0.8 已完成三文件、ZIP SHA、包内 SHA 与私有参数校验；
- 真实 preflight 以 `mixed_credential_environment` fail-closed：Cloud Shell 同时注入 modern/legacy 两套凭证变量；
- apply/verify/rollback 未运行，资源和费用仍为 0；
- 当前 Gate：`STOPPED_AT_PREFLIGHT / V0.9_MIRRORED_CREDENTIAL_NORMALIZATION_REQUIRED`。

## 2026-07-30 阿里云 Wave1 v0.9 本地修复

- modern/legacy 双链只有三项凭证逐字节完全相同才允许并规范化为单一 modern 链；
- 缺项、空值、ID/Secret/Token 任一不等、profile、metadata、额外 token 均 fail-closed；
- 凭证测试 23/23、状态 8/8、I/O 6/6、攻击 5/5、SHA 全部通过；
- ZIP SHA-256：`88ACBC7336CC4BE60E72F97F2F77A4AC454C39829DAE637C74200304FC7BE067`；
- 当前 Gate：`V0.9_READY_FOR_INDEPENDENT_QA / NOT_EXECUTED`；
- 新增云资源、费用、Qwen 调用、Key 均为 0。

## 2026-07-30 阿里云 Wave1 v0.9 云端预检

- v0.9 ZIP SHA、包内 SHA 与受限 runtime 参数格式均通过；
- 云端预检返回 `PREFLIGHT=FAIL reason=incomplete_modern_sts_environment`；
- 脱敏诊断显示 modern/legacy 两套 AccessKey 变量均非空，但两套 SecurityToken 均不存在；
- `GetCallerIdentity` 的身份类型为 `Account`，与批准的 `visionqa-staging-operator` 匹配结果为 `false`；
- 当前 Cloud Shell 实际运行在主账号身份，不满足最小权限与批准身份约束；
- 已保持停机，未运行 apply/verify/rollback，未创建任何云资源、未触发费用或模型调用；
- 当前 Gate：`STOPPED_AT_PREFLIGHT / WRONG_IDENTITY_ACCOUNT / DO_NOT_APPLY`；
- 脱敏证据：[`agents/aliyun_wave1_cloudshell_redacted_credential_diagnostic_v0.1.md`](./agents/aliyun_wave1_cloudshell_redacted_credential_diagnostic_v0.1.md)。

### Operator 正确身份复验

- 用户切换至 `visionqa-staging-operator` 后，全新 Cloud Shell 的只读身份验证为 `RAMUser` 且批准 Operator 匹配为 `true`；
- 但 modern 与 legacy 两套凭证均仅有 ID/Secret，SecurityToken 均不存在，实际状态为 `PARTIAL + PARTIAL`；
- 该形态按独立 QA 的 v0.9 失败审查必须 fail-closed，不能用 v0.10 三态修订绕过；
- 已请求现有独立 QA 基于真实形态重新裁决安全入口；
- apply/verify/rollback 均未运行，云资源、费用、Qwen 调用与 Key 创建仍为 0。
## 2026-07-30 Wave1 专用执行 Role 与 STS 入口

- 已创建 `visionqa-staging-wave1-executor`，最大会话时长 3600 秒。
- 信任策略仅允许 `visionqa-staging-operator` Assume，并要求 `acs:MFAPresent=true`。
- 已创建并附加 `VisionQAStagingWave1ExecutorV01`；Wave1 最小变更权限已从 Operator 迁移至专用 Role。
- `VisionQAStagingOperatorBootstrapV01` 已生成新的默认收紧版本：Operator 仅保留 Cloud Shell、只读探针和对唯一执行 Role 的 `sts:AssumeRole`。
- 静态核验：Role trust、唯一策略附件、执行权限禁止边界、Operator 唯一 Role Assume 边界、AccessKey=0 均通过。
- 当前唯一身份阻塞：Chrome Cloud Shell 为主账号，而官方禁止主账号调用 `AssumeRole`；第 5、7–13 项必须在 Operator Cloud Shell 会话中完成运行时复验。
- 17 项验收中的第 14–16 项仍需 Staging Agent 生成不可覆盖的新 wrapper/ZIP，并由独立 QA 放行。
- 当前 Gate：`ADMIN_ROLE_AND_POLICY_MIGRATION_COMPLETE / STS_RUNTIME_VERIFY_BLOCKED_OPERATOR_LOGIN / WAVE1_NO-GO`。
- 本轮未创建任何业务或付费资源，未创建 AccessKey/API Key，未调用 Qwen。
- 证据报告：[`agents/aliyun_wave1_executor_role_execution_report_v0.1.md`](./agents/aliyun_wave1_executor_role_execution_report_v0.1.md)。

## 2026-07-31 DISCOVERY_PILOT_v0.2 Phase 0 本地资产冻结

- 已基于 87 张客户素材脱敏 manifest 与受控 pilot manifest 生成 17 条 `pilot_sample_manifest.csv`。
- 17/17 条在原文件所在设备本地重新计算 SHA-256 并匹配；输出不记录原始文件名或原始绝对路径，项目内无图片二进制。
- 固定约束：`FIXTURE_REPLAY_NO_MODEL / LOCAL_ONLY / NO_IMAGE_COPY / NO_EXTERNAL_TRANSFER / REQUIRED_HUMAN_FINAL_REVIEW`。
- 运行台账与契约空表已就位：`pilot_run_ledger.csv`、`pilot_sessions.csv`、`pilot_review_events.csv`、`pilot_rework_rounds.csv`、`pilot_daily_metrics.csv`、`pilot_exceptions.csv`。
- 当前真实状态仍为 `PHASE_0_LOCAL_ASSET_FREEZE_COMPLETE / HOLD_EXTERNAL_DEMO`；未填人工分数、访谈、报价、付款、返工或模型输出。
- 资产入口：[`runs/discovery_pilot_v0.2/pilot_sample_manifest.csv`](./runs/discovery_pilot_v0.2/pilot_sample_manifest.csv)；运行约束：[`runs/discovery_pilot_v0.2/README.md`](./runs/discovery_pilot_v0.2/README.md)。

## 2026-07-31 DISCOVERY_PILOT_v0.2 Phase 1 本地 Fixture 预检

- 实际 MVP 路径为 `D:\VisionQA\web`（用户指定的 `D:\VisionOS\web` 当前不存在）；未创建或移动项目。
- 17 条 pilot 样本已通过本地读取契约：唯一 ID/SHA、`DEVELOPMENT_REFERENCE`、`LOCAL_SHA_MATCHED`、`binary_in_project=NO`、确定性 trace/fixture 映射均通过。
- `npm test` 通过 build 与 67 项测试（9 渲染/契约 + 58 TypeScript）；`npm run lint` 0 errors、0 warnings。
- 代码静态门确认：本地 fixture 默认 `FIXTURE_REPLAY_NO_MODEL` 且不走网络；缺少 reference/provenance 上下文时强制 `REVIEW`、分数置空；反馈保留 candidate SHA、trace、fixture、evaluation mode 和人工决定字段。
- 本轮未启动外部模型、云服务或付费资源，未上传/复制图片，未填人工分数或客户事件。
- 预检报告：[`runs/discovery_pilot_v0.2/phase1_local_fixture_preflight_report.md`](./runs/discovery_pilot_v0.2/phase1_local_fixture_preflight_report.md)；待现有 Lorentz 只读复核。

## 2026-07-31 Key 元数据检查与 Phase 1 QA 收口

- 已按用户授权只读定位桌面 `visionos key.txt`：文件存在，119 bytes，物理 2 行但仅 1 个非空行；非疑似 JSON，疑似纯 Token。
- 未输出、读取展示、计算 hash、记录前后缀、复制或上传任何密钥字符；真实模型调用继续 `HOLD_REAL_MODEL_CALL`。
- 不含值的受限引用：`D:\VisionOS\secrets\visionos_key_reference.md`。
- 清理 Qwen provider 未使用的 `buildPrompt` warning。
- 新增可独立测试的上下文门模块：缺少 SKU/参考声明或 AI 来源时强制 `REVIEW`、`overall_score=null`、`score_band=null`，并追加人工检查项。
- `npm test`：build + 58 tests 全部通过；`npm run lint`：0 errors、0 warnings。

## 2026-07-31 枪王电商图素材本地 Canary 预备

- 新目录实际 104 个文件：103 JPG + 1 PDF；103 张 JPG 可解码，SHA-256 完全重复 0；竖 84、横 19、方 1。
- 已本地选择 5 张候选，覆盖模特/商品生活方式、竖横方向、近景/全身、文字商业广告与不同分辨率；首轮执行前未上传，之后仅通过 staging UI 发送这 5 张。
- 用户已确认固定模型、5 张素材评测授权与 ¥20 预算上限；该确认已记录，但不替代运行时的合规配置证据。
- 真实 Qwen 仍保持 `HOLD`：用户确认已收到，但 `DOMESTIC-QWEN-001` 的显式运行批准变量、`DOMESTIC-DATA-001` 的私有传输/ZDR/删除 SLA 证据，以及 `DOMESTIC-BUDGET-001` 的可核验责任人记录仍未闭环。
- 预备清单与未执行占位标签：[`data/customer_gwang_v0.1/canary_manifest.csv`](./data/customer_gwang_v0.1/canary_manifest.csv)、[`provisional_labels.csv`](./data/customer_gwang_v0.1/provisional_labels.csv)、[`provisional_labels.json`](./data/customer_gwang_v0.1/provisional_labels.json)；报告：[`inventory_and_canary_report.md`](./data/customer_gwang_v0.1/inventory_and_canary_report.md)。
- 真实调用前配置检查仍 fail-closed：本地 readiness 可识别模型/Key/¥20/并发1，但 `QWEN_PROVIDER_APPROVED` 未显式为 `true`；当前 Base64 canary 不能证明私有短期 URL、`store:false`、ZDR 组合。详见 [`real_call_gate_check.md`](./data/customer_gwang_v0.1/real_call_gate_check.md)。首轮已发送 5 次 staging 请求，未继续追加。

## 2026-07-31 枪王素材首轮 staging Canary 已执行

- 通过 `http://localhost:3141/api/live-evaluate` 串行发送 5 张候选，未上传整批素材，未创建新 Agent。
- 结果：1 张 HTTP 200 且形成可用 `REVIEW/PARTIAL` 暂定结果；3 张 HTTP 502（模型结果未通过本地结构/规则校验）；1 张 HTTP 413（载荷过大）。
- 唯一可用结果为 `gwang/9785cfc4cf3440bc.jpg`，已产生视觉证据、商业维度证据和可复制 Repair Prompt；因缺少商品参考图上下文，综合分保持 null，必须人工复核。
- 结果目录：[`data/customer_gwang_v0.1/live_results_v0.1`](./data/customer_gwang_v0.1/live_results_v0.1)；汇总：[`canary_summary.csv`](./data/customer_gwang_v0.1/live_results_v0.1/canary_summary.csv)。
- 当前不要继续追加模型请求：先修复 502 的结构校验诊断、对 413 做受控压缩/尺寸预检，并将生产路径切换为阿里云 OSS 私有短期 URL后再补跑失败样本。
- 已新增 `web/lib/visionqa/providers/data-processing-contract.ts` 与契约测试：`store:false`、ZDR/不训练、删除 SLA、人工终审四项证据任一缺失即 fetch 前 fail-closed；`npm test` 69 项通过，`npm run lint` 0 errors/0 warnings；未修改批准环境、未发请求。

## 2026-07-30 客户真实商业素材只读盘点

- 已对客户提供的服饰商业素材完成本地只读盘点：实际 87 张，全部为 JPG，87/87 可解码，损坏 0，SHA-256 完全重复 0。
- 初步人工分类为含模特 75 张、商品静物 12 张；全部标记 `PENDING_REVIEW`，尚未形成 ground truth。
- 已按拍摄系列提出不复制文件的拆分建议：`DEVELOPMENT_REFERENCE` 49、`CALIBRATION_REVIEW` 19、`EVALUATION_HOLDOUT` 19。
- 当前数据状态：`LOCAL_ONLY / SPLIT_PROPOSED_NOT_MATERIALIZED`。未修改、移动或复制原图，未上传，未调用 Qwen 或其他外部模型。
- 素材用途限定为 VisionQA 内部评估与 benchmark；任何外部传输仍受现有数据治理、私有传输与运行审批门约束。
- 清单与报告：[`data/customer_xiaoyu_v0.1/asset_manifest.csv`](./data/customer_xiaoyu_v0.1/asset_manifest.csv)、[`inventory_report.md`](./data/customer_xiaoyu_v0.1/inventory_report.md)、[`README.md`](./data/customer_xiaoyu_v0.1/README.md)。
- 本次盘点不改变真实模型评测 0% 与 Qwen canary `NO-GO` 状态，也不提高项目整体完成度。

## 2026-07-31 阿里云 Wave1 v1.0 专用 Role + STS 发布

- 独立 QA 对无 Token Cloud Shell 链裁决 NO-GO；管理员已创建唯一执行 Role `visionqa-staging-wave1-executor`，信任仅 Operator + MFA，Operator AccessKey 仍为 0，策略边界禁止 RDS/NAT/EIP/Qwen/BSS/IAM 提权。
- 发布 v1.0 `wave1_sts_runner.sh`：Operator 只读身份确认后 AssumeRole，完整 STS 三元组与 Expiration 仅存于内存子 Shell；校验固定账号/角色/SessionName、Expiration 剩余 300–3660 秒，设置 `ALIBABA_CLOUD_IGNORE_PROFILE=TRUE`，清除其他凭证链，再运行原 preflight/apply/verify。
- 本地测试：STS runner PASS；credential 29 cases PASS；state 8/8；I/O 6/6；attack 5/5。
- ZIP SHA-256：`C1C8D0CDA62148BB44CDF73990B723BC06E08A1C992087F8B7FDC955B913046C`；目录 SHA256SUMS 文件 SHA-256：`6C37FF86F11409F6FA0E76FC44AC9B7ADF0A5C2949E5D7409C035606059940D2`。
- 当前 Gate：`V1.0_READY_FOR_INDEPENDENT_QA / DO_NOT_RUN_UNTIL_QA_GO`；Chrome Operator Cloud Shell 已确认身份但未 AssumeRole、未运行 preflight/apply/verify；云资源、费用、Qwen 调用、Key 创建仍为 0。
- 交接报告：[`agents/aliyun_wave1_v1_execution_handoff_v1.0.md`](./agents/aliyun_wave1_v1_execution_handoff_v1.0.md)。

## 2026-08-06 阿里云 staging 专用网络已创建

- 用户已明确批准创建 VisionQA staging VPC 与交换机。
- 已创建 VPC `visionqa-staging-vpc`：`vpc-2zemfydacq5kqa6ssqoon`，北京地域，IPv4 `10.90.0.0/16`，状态可用。
- 已创建交换机 `visionqa-staging-vsw-a`：`vsw-2zee61oe1pjr1t0z1m9gw`，北京可用区 L，IPv4 `10.90.1.0/24`，状态可用。
- 控制台未显示专用资源组选项，因此本次归属默认资源组 `rg-acfmvsz2wmavpra`；网络隔离和后续 RDS 选网不受影响。
- 当前交换机内 ECS=0、RDS=0；没有创建数据库、订单或付款。
- 当前 Gate：`STAGING_NETWORK_CREATED / VERIFIED / RDS_NOT_ORDERED`。
- 证据报告：[`reports/ALIYUN_STAGING_NETWORK_v0.1.md`](./reports/ALIYUN_STAGING_NETWORK_v0.1.md)。

## 2026-08-10 RDS 真实选网核价复核

- 已在阿里云售卖页恢复并确认 MVP 基线：Serverless PostgreSQL 16、基础系列、高性能云盘 20GB、RCU 0.5–1、自动启停开启、单可用区。
- 已选中 staging 专用 VPC `vpc-2zemfydacq5kqa6ssqoon` 与交换机 `vsw-2zee61oe1pjr1t0z1m9gw`（北京可用区 L）。
- 页面最终显示 `¥0.10～0.18/小时`，全天粗略 `¥73～131.40/月`，仍低于批准的 ¥300/月基础设施上限。
- 本次没有点击立即购买、没有创建 RDS 实例、订单或付款。
- 当前 Gate：`RDS_QUOTE_FINAL / DEDICATED_NETWORK_SELECTED / NOT_ORDERED`。
- 证据报告：[`reports/ALIYUN_RDS_LIVE_QUOTE_v0.1.md`](./reports/ALIYUN_RDS_LIVE_QUOTE_v0.1.md)。
## 2026-08-10 RDS migration 历史阻塞（已于 2026-08-13 解除）

- DMS service-linked role `AliyunServiceRoleForDMS` was created successfully.
- RDS `pgm-2ze0uziz73r8abb8` was registered in DMS and the configured connection fields passed validation.
- DMS permission order `27189097` for query/export/change was approved successfully.
- RDS 当时因欠费显示 `锁定中`；该阻塞已在充值后解除。
- 两份 migration 已于 2026-08-13 成功写入 `public` Schema，并通过 11 表与真实持久写入验收。
- No public endpoint was opened and no credential value was logged.
- Resolved Gate: `RDS_MIGRATION_APPLIED / REAL_DB_READ_WRITE_VERIFIED`.
- Evidence: [`reports/ALIYUN_RDS_MIGRATION_v0.1.md`](./reports/ALIYUN_RDS_MIGRATION_v0.1.md).

## 2026-08-21 VisionQA Dionysus 公网演示发布

- 公网地址：`https://visionqa.dionysusding.cn/`，工作台：`https://visionqa.dionysusding.cn/workspace`。
- 当前服务器 release：`3fc8dc6`；GitHub 分支：`codex/visionqa-phase3-qwen`。发布包来自该提交的 `web` Git archive，未包含 `.env`、API Key、客户图片或本地素材。
- 实际权威 DNS 位于 DNSPod；已创建并启用 `visionqa A 139.196.123.28`，TTL 600 秒。阿里云 DNS 控制台中存在一条同值但非权威的记录，不参与公网解析。
- Let's Encrypt 证书已签发并由 Nginx 启用，证书到期日为 2026-11-19；`certbot-renew.timer` 已启用。HTTP 自动 301 跳转 HTTPS。
- 独立 `visionqa-demo` systemd 服务监听 `127.0.0.1:3210`，状态 active；Qwen 与付费调用仍由 service unit 显式关闭，自动放行关闭，正式结果要求人工终审。
- 生产验收：根页面 200、`/workspace` 200、主站 `dionysusding.cn` 200、`dionysus-api` active；桌面与 390×844 移动视口无横向溢出、浏览器控制台 0 error/warn。
- 公网验收发现 Vinext `next/link` 预取异常会阻断首页进入工作台；已用可靠的原生站内链接修复并重新发布。修复后真实点击可进入 `/workspace`。
- 本地验证：14/14 渲染、Schema 与 production smoke 测试通过；77/77 TypeScript 契约、规则、Agent、Provider、存储与持久化测试通过。
- 当前对外边界：这是内部预览演示，不提供真实账户认证，不代表模型准确率、客户采用、商业成功或自动发布能力。

## 2026-08-24 工作台信息架构收敛（本地原型）

- 工作台新增 `00 项目总览`：根据真实输入状态计算唯一下一步，展示基准输入、候选素材、评审完成和人工记录；示例素材继续明确标注，不补造客户事实。
- 商品基准页保留 SKU 链接与历史确认图为主任务；目标风格、价格带、年龄、性别、城市、人群、场景和决策驱动统一收进右侧商品策略栏，默认显示摘要，编辑项按需展开。
- 质量评审改为结论优先：首屏先回答发布判断、最大问题、适用范围和下一步；综合分、四项维度、问题详情、修复 Prompt 与审计记录进入折叠层。移动端把结论 Inspector 排在图片批次之前。
- 营销交付拆为 `生成概览 / 人群与策略 / 平台文案 / 视频制作` 四个内部视图，保留 L2 运行状态、事实 Gate、人工终审与未授权外部调用边界。
- 视觉继续使用黑白灰单色基底，真实商品图是主要颜色来源；未引入渐变、玻璃拟态、装饰图表或新增同级卡片堆叠。
- 本地验证：14/14 渲染、Schema 与 production smoke 测试通过；77/77 TypeScript 契约、规则、Agent、Provider、存储与持久化测试通过；ESLint 0 error/warning；桌面与 390×844 移动端无横向溢出，浏览器控制台 0 error/warn。
- 本轮尚未发布到 `visionqa.dionysusding.cn`；公网仍对应上一里程碑 release，后续单独决定发布时间。

## 2026-08-27 合成修图案例库与智能边界路由（本地原型）

- 以内置 ImageGen 基于同一灰色开衫真值和同一虚构模特母版生成 5 张受控缺陷图：多一颗纽扣、手指与袖口融合、额外手臂、袖子罗纹断裂、领口/口袋/拉链多项结构冲突。
- 案例库为 `SYNTHETIC_INTERNAL_TEST_ONLY`，目录：[`data/synthetic_repair_case_library_v0.1`](./data/synthetic_repair_case_library_v0.1)；已记录统一 SKU 事实、文件 SHA-256、主问题、允许修改区、禁止变化区与推荐策略。它不是客户、模型效果、采用或付款证据。
- 工作台左侧新增可折叠“缺陷案例库 · 5”，每例可离线载入并让用户选择“AI 识别”或“直接描述问题”；载入本地案例不调用 Provider、不产生项目 API 费用。
- 新增 `repair-boundary-v0.1`：根据问题类型与可观察描述输出 `LOCAL_REPAIR / DETERMINISTIC_COMPOSITE / LOCAL_REPAIR_OR_REGENERATE / REGENERATE / BLOCKED`，同时生成允许修改区、必须锁定区、停止条件与理由。边界只提供建议，仍需用户确认和人工终审。
- 大错路由已实测：额外手臂会显示“整体重生成”，不生成局修 Prompt，“建立改图任务”保持禁用；多一颗纽扣会开放受控局修任务。
- 浏览器验收发现并修复侧栏案例展开后不可达问题：桌面侧栏现可独立纵向滚动；1280×720 与 390×844 均无横向溢出、图片完整、控制台 0 error。
- 自动放行继续关闭；Logo/字标仍优先授权资产确定性合成，缺真值时 `BLOCKED`，整体人体或多关键结构错误时 `REGENERATE`。
- 本地验证：`npm run lint` 通过；`npm test` 通过 15 项页面/Schema/production 检查与 114 项 TypeScript/runtime 测试。
- 策展契约：[`agents/repair_benchmark_curator_v0.2.md`](./agents/repair_benchmark_curator_v0.2.md)；模拟客户发现 Day 2：[`reports/SIMULATED_DAILY_DISCOVERY_REPAIR_WORKFLOW_DAY2.md`](./reports/SIMULATED_DAILY_DISCOVERY_REPAIR_WORKFLOW_DAY2.md)。

## 2026-08-28 第五阶段公开试用收口与发布

- 公开入口已移除模拟邮箱/密码登录，只保留单一“开始试用”动作；根域名直接 307 进入 `/workspace`，不再经过长篇营销页。
- 工作台主流程收敛为选择案例或图片、确认问题与修改边界、查看处理建议、人工放行；商品真值与客户画像不再在问题页重复出现，AI Provider、内部证据和项目历史默认折叠。
- 桌面保留稳定侧栏与判断 Inspector；手机端改为商品图优先，再展示判断与操作。公开试用仍明确本机保存、无需账户、人工终审、自动放行关闭。
- 已发布 `https://visionqa.dionysusding.cn/`，服务器 active release 为 `4f7a035`；旧版本 `c119de7` 与 `3fc8dc6` 保留为回滚点。GitHub 分支 `codex/visionqa-phase3-qwen` 已同步。
- 工程验证：完整 `npm test` 118/118 通过；根路由补丁的生产构建、production smoke 与渲染测试 12/12 通过；ESLint 通过。
- 公网验收：根域名自动进入 `/workspace`；桌面“开始试用”可进入项目总览；390×844 无横向溢出；浏览器 console 0 error/warning；主站 `dionysusding.cn` 未受影响。
- 当前 Gate：`PHASE5_TRIAL_LIVE / HUMAN_REVIEW_ON / AUTO_PASS_OFF / COMMERCIAL_EVIDENCE_NOT_RUN`。
- 当前目标：以 3 名真实服饰美工或运营做小规模试用，每人处理 2–3 个脱敏案例，记录 60 秒内是否理解流程、边界建议接受率、完成/放弃节点、人工收尾分钟数，以及是否愿意提交一个有授权的真实 SKU。不得把合成案例、访问量或内部测试当作付款、采用和复购证据。

## 2026-08-28 受控试用账号登录发布

- 按产品负责人决定，公开试用入口改为两个固定受邀账号的手机号与密码登录；不接短信验证码、注册或找回密码，也不把它表述为正式手机号认证。
- 账号只在服务端校验；浏览器端不包含预设手机号或明文密码。成功后写入 12 小时 `HttpOnly`、`Secure`、`SameSite=Lax` 会话 Cookie，失败提示保持统一，并设置单 IP + 手机号 10 分钟 10 次的进程内尝试限制。
- 两个账号使用不同本地 IndexedDB 存储域，减少同一浏览器上的项目串用；这仍不是正式租户隔离、跨设备云同步或生产级身份系统。
- 登录界面维持单一焦点：手机号、密码和“登录并开始试用”，不增加短信、注册、重置密码或预设账号说明。
- 已发布 `https://visionqa.dionysusding.cn/`，服务器 active release 为 `8c6512d`；`4f7a035` 等旧 release 保留为回滚点。发布包 SHA-256 为 `BF5B419768121AADD8710D603FCCAFD1EA95E47D25A873A39722D0A765E2273D`。
- 验证：完整测试 15/15 页面/契约组与 120/120 TypeScript/运行时通过；lint、生产构建通过；公网登录、工作台、退出均返回 200；桌面与 390×844 均无横向溢出，浏览器 console 0 error/warning。
- 当前目标收敛为先让这两个受邀账号各完成 2–3 个脱敏案例，记录理解时间、边界接受率、完成/放弃节点、人工收尾时间和真实 SKU 提交意愿；需要第三名参与者时再新增独立受控账号。真实客户采用、付款、发布和再次提交仍无证据。

## 2026-08-28 首页、登录与工作台路由修正

- 恢复原 VisionQA 产品首页，根域名 `/` 不再直接跳入工作台；首页的“进入 VisionQA”统一打开独立 `/login` 页面。
- 未登录访问 `/workspace` 会服务端跳转 `/login`；登录成功后进入 `/workspace`。已登录访问 `/login` 会直接进入工作台，避免重复登录。
- 工作台桌面侧栏左上角 VisionQA 标志和小屏顶栏 VQ 图标均返回 `/`；登录页品牌标志也可返回首页。
- 已发布 `https://visionqa.dionysusding.cn/`，active release 为 `6f1ab23`，上一版本 `8c6512d` 保留为回滚点。发布包 SHA-256 为 `A57227604BD966BB45354715C9C5F35626C2172E57575168A7F03423D51DA7E7`。
- 验证：17/17 页面与契约测试、120/120 TypeScript/运行时测试、lint 和生产构建通过；公网首页、登录、未登录重定向和登录后工作台均符合预期；桌面与 390×844 无横向溢出，console 0 error/warning。
