# VisionQA 架构重构方案 v0.2

状态：M0–M2 已在本地落地；本文件是本地重构基线，不代表线上已部署。

当前阶段已经完成以下基础分层，并作为后续桌面化工作的本地基线：

1. VisionQA 的核心不再是“服饰电商商品图评分器”，而是可被不同宿主调用的视觉与产出质量评审引擎。
2. 服饰电商仍保留为一个兼容 profile，但不会因为输入是一张图片就被自动套用。

本阶段不修改官网、不部署线上、不接入真实 Provider。现有 `visual-review-v0.1` Contract 保持兼容，同时新增 `VisualReview v0.2`、`CodeReview v0.1`、`ObservationEnvelope v0.1` 和 `ReviewProfile v0.1`。本文件描述这些 Contract 如何与 Profile、Provider、Host Adapter 和本地 Electron Shell 分工。

## 1. 目标边界

```text
Host Adapter
  Chrome / MCP / Desktop
       │  capture: screenshot, DOM, source, AST, diff
       ▼
Review Request Contract
       │  artifact + intent + constraints + permissions
       ▼
Profile Resolver
       │  visual-baseline / code-quality / linked-review / ecommerce-apparel
       ▼
Provider Adapter
       │  Mock / BYOK multimodal / managed provider
       ▼
Observation Envelope
       │  issues + evidence anchors + actions + verification
       ▼
Review Response Contract
       │
       ├─ report / export
       └─ user-approved executor (未来)
```

Profile 只决定“评审什么、需要哪些证据、采用哪些维度”，不负责：

- 调用哪一个模型；
- 管理 API Key；
- 读取浏览器或本地文件；
- 直接修改源码；
- 把评审结果变成商业承诺；
- 绕过人工确认写回。

## 2. 当前落地的 Profile 层

实现位置：

- `web/lib/visionqa/review-profiles.ts`（唯一的 runtime registry）
- `web/lib/visionqa/review-contract-v0.2.ts`（`reviewProfileDefinitionSchema` 与 `ReviewProfileRef` 的契约层）

Profile 定义只在 `review-profiles.ts` 保存一次，并在注册时通过
`reviewProfileDefinitionSchema.parse(...)` 校验。不要再创建第二份包含同一维度数据的
`profiles.ts` 或其他 runtime registry；如果未来需要旧 API 名称，只能做不持有定义数据的兼容 re-export。

Profile registry 当前包含四个版本化 profile：

| ID | 用途 | 默认输入 | 是否自动选择 |
| --- | --- | --- | --- |
| `visual-baseline@0.1.0` | 网页、图片、PPT、文档渲染等通用视觉评审 | screenshot | 是 |
| `code-quality@0.1.0` | 源码、AST、Diff、测试上下文的代码质量评审 | source | 仅 source/diff 默认 |
| `linked-review@0.1.0` | 将视觉问题关联到 DOM 与源码 | screenshot + source | 需要 v0.2 resolver 显式组合 |
| `ecommerce-apparel@0.3.0` | 服饰电商商品图真值、材质和交付约束 | screenshot + product truth | 否，必须显式选择 |

每个 profile 定义目前声明：

- `id`、版本和类型；
- 评审模式、标题和说明；
- 可审查维度；
- 确定性检查清单；
- 禁止模型推断的结论；
- 来源和更新时间（如有）。

源码写入权限不属于 Profile 定义：它仍由 request 的 `permissions` 控制，当前 Host Adapter 默认强制 `can_write_source: false`，所有修改计划都必须要求用户批准。

### 2.1 Visual Baseline

默认维度：层级、构图、间距与对齐、字体与可读性、对比与色彩、交互可见性、系统一致性、审美完成度。

规则：截图是视觉证据，DOM、computed style 和对话上下文只是辅助证据。缺少视觉产物时只能返回 `NEEDS_CONTEXT` 或人工复核，不能生成“审美分数”。M2 的 fixture 已把这些输入标准化为结构化 capability，但它们仍然是离线证据，不代表真实浏览器采集已经完成。

### 2.2 Code Quality

默认维度：可读性、模块边界、正确性线索、错误处理、可测试性、无障碍实现、性能风险、可维护性。

规则：不允许根据截图推断代码质量。至少要有源码引用，AST、Diff、测试或静态规则结果可作为增强证据。后续实现应区分“标准问题”和“规格问题”，避免模型把偏好写成缺陷。

### 2.3 Linked Review

默认维度：视觉问题定位、DOM 与源码关联、修改局部性、修改后验证。

规则：它是 VisualReview 与 CodeReview 的关联层，不是一个全能评分器。每一个建议都应该尽量带 `pixel_bbox`、`dom_selector` 或 `source_range` 等 evidence anchor；不能定位时明确标为不可定位。

### 2.4 Ecommerce Apparel

这是现有电商能力的兼容 profile，包含商品真值、材质与细节、商业表达、人物与穿着、摄影真实感和交付可用性。

它按产品策略是 opt-in：

- 图片输入不会自动触发；
- 通用网页评审不会自动注入商品图问题；
- 只有明确选择该 profile，且提供商品真值时，才允许使用旧电商规则；当前 registry 通过精确的版本化 `ReviewProfileRef` 保持显式选择，resolver 测试覆盖“图片默认不会选中电商 profile”；
- 旧的营销/商业指标不得进入通用视觉评审输出。

## 3. Contract 分工

当前仓库的 `visual-review-v0.1` 仍然承担请求/响应校验和兼容路径。v0.2 迁移应增加以下概念，而不是继续把字段塞进 candidate/reference：

```text
ReviewRequest
  review_mode: visual | code | linked
  profile: profile id + version
  artifacts: screenshot / DOM / source / AST / diff / references
  intent + constraints + permissions

ReviewResponse
  decision
  summary
  issues[]
    category + severity + confidence
    evidence[]
    suggested_fix
  evidence_anchors[]
  repair_plan (requires approval)
  verification
  usage
```

建议的新类型：

- `EvidenceAnchor`：像素区域、DOM selector、源码范围、slide object、文档页区域；
- `ObservationEnvelope`：统一承载模型观察，不与某一垂直场景绑定；
- `CodeReviewRequest/Response`：允许 source、AST、Diff 和规则结果独立存在；
- `ProfileRef`：包含 `id` 与 `version`，用于复现同一套评审规则。

兼容原则：

- v0.1 请求仍可由旧 Plugin runtime 处理；
- profile 先通过 `constraints.rubric_profile` 或 v0.2 `ProfileRef` 传递；
- 迁移期间不得把电商字段删除后直接改名；应保留 adapter 并记录转换警告；
- 缺少必要证据时失败关闭，不得把默认 profile 当成事实。

## 4. Provider 分工

Provider 只负责：

1. 接收标准化输入；
2. 调用 Mock、BYOK 或 managed provider；
3. 返回标准化 observations；
4. 记录 provider、model、请求 ID、耗时和用量。

Provider 不负责：

- 决定宿主权限；
- 直接写入源码；
- 把 `ecommerce-apparel` 当作默认规则；
- 以一次调用结果宣布模型质量或客户价值。

Profile registry 的定义在注册时经契约 schema 校验，可在 Provider 调用之前解析。这保证同一份输入和 profile 能复现提示词和报告结构。`linked-review` 已作为独立 profile 注册，但后续 v0.2 resolver 仍需根据同时存在的视觉与源码证据决定是否启用它；不得隐式启用电商 profile。

## 5. Host Adapter 分工

### Chrome

当前 `web/host/chrome` 作为第一版适配器，后续应增加：

- 全页截图；
- DOM selector 与 bounding box；
- computed style；
- 当前选中元素；
- 页面来源和 revision；
- 明确的读取/写入权限状态。

### MCP

MCP 适配器应传递与 Chrome 相同的 artifact envelope，不另造电商专用请求。MCP 只负责宿主能力，Profile 由核心 resolver 决定。

### Desktop

桌面端已进入本地 Windows Alpha Shell 阶段：`desktop/main.mjs` 启动或复用 `localhost:6300`，`desktop/preload.cjs` 仅通过 allow-list 暴露状态、能力和导出 IPC。Provider Key 必须留在服务端或操作系统凭据存储，不能进入 Renderer。

## 6. 迁移计划

### M0：Profile 分层（已完成）

- 建立 profile registry；
- Profile 显式版本化；
- 电商 profile opt-in；
- 增加 profile resolver 测试；
- 保持现有 Contract、官网和线上不变。

### M1：Contract v0.2（已完成）

- 新增 `review_mode`、`ProfileRef`、`EvidenceAnchor`；
- 新增 CodeReview v0.1 独立请求/响应；
- 保留 v0.1 运行时作为兼容路径；
- 为缺失证据建立统一 `NEEDS_CONTEXT` / `NOT_ASSESSABLE` 规则；
- 为 TypeScript 解析器和四份 JSON Schema 增加离线验证。

### M2：Runtime 接入（已完成）

- `plugin-runtime.ts` 解析 v0.2 Profile 与 `review_mode`，并保留 v0.1 兼容路径；
- 旧的 e-commerce 输入仍需显式 `ecommerce-apparel` profile，不会被通用视觉路径自动套用；
- `runVisualReviewV02Mock`、`runCodeReviewV01Mock`、`runLinkedReviewMock` 统一返回对应 Contract，`runReviewMock` 提供模式分派；
- Mock 明确标记 fixture-only / no-network，不调用 Provider、不读写宿主资源，不伪造审美、代码或商业结论；
- `m2-host-fixtures.ts` 提供截图、DOM、源码、AST、Diff 以及 Screenshot → DOM → Source 的离线证据链；
- `test:plugin` 与 release-check 已纳入三条 Mock 流程和 Host fixture 回归。

### M3：Host evidence（本地适配与真实 Chrome 标签页证据链已完成）

- Chrome collector 已在真实扩展权限下采集 DOM geometry、selector、受限 computed style、当前选中元素与页面 revision；
- `visionqa-host-capture-v0.2` parser 和 JSON Schema 已加入，保留 v0.1 兼容路径；
- MCP 已增加结构化 source、AST、Diff、revision envelope，并提供 Code/Linked 本地 Mock 入口；
- v0.2 host route 与 MCP 工具输出可定位的 `dom_selector` anchors；
- 默认仍不允许写入，v0.2 本地入口固定为离线 Mock，不声称真实模型质量。

主线程已使用已连接的真实 Chrome `http://localhost:6300/plugin` 标签页取得截图（74,082 bytes）、DOM evidence（9 个元素、1 个选中元素）和 revision（`f6a209f7d6b5b8d137d3d3081430dd2a`），并将同一份 evidence 发送到 localhost Host route，收到 HTTP 200、`visual-review-v0.2`、`NOT_ASSESSABLE`、`fixture` 结果，route 回显相同 revision 与 evidence 数量。原生工具栏弹窗点击受当前浏览器控制层 URL 检测限制，未将其冒充为已完成；这不阻塞 localhost evidence 链路，但仍是扩展发布前的独立人工验收项。

M2 的 Host fixture 仅用于验证输入/契约/权限边界；不能替代 M3 的真实 Chrome/MCP 采集验收。

### M4：Electron Windows Alpha（本地 Shell 已启动）

M3 已完成真实 Chrome 标签页证据链验收后，已加入本地 Electron Shell
scaffold：`desktop/main.mjs`、`desktop/preload.cjs`、`desktop/export.mjs` 和
`desktop/renderer/` 边界说明。它只允许本地 `localhost:6300`，默认启动 Mock，
并将 Provider 调用、源码写入和任意文件/命令 IPC 保持关闭。

本地运行时已锁定 Electron `38.2.0`，已验证桌面进程能加载 `/plugin` 并由 Alpha 自己启动 localhost 服务；窗口标题、尺寸、Mock 评审点击反馈已完成 smoke。已生成不含依赖与密钥的可复现开发者 portable shell 目录包：`web/dist/visionqa-desktop-alpha-portable`。同时已锁定 `electron-builder@26.18.0`，并生成 Windows x64 portable exe：`web/dist/electron/VisionQA-Desktop-0.1.0-portable.exe`。该 exe 未签名、只适用于本地开发者 Alpha，且不包含完整 `web/node_modules`，不能直接当作客户生产安装包：

- `desktop:dev`；
- Windows portable zip / exe（Alpha 已生成，需补充签名和运行时打包后才可交付客户）；
- 客户安装包与自动更新；
- 本地服务生命周期；
- Mock 离线启动；
- Provider 配置和日志隔离；
- 导出 Markdown/JSON/SARIF；
- 用户批准后执行、可撤销、可审计。

## 7. 验收门槛

工程证据、模型证据和商业证据必须分开：

### 工程可运行

- profile resolver 测试通过；
- v0.2 request/response 能校验；
- Mock Visual/Code/Linked 流程可运行；
- M2 fixture 输入能被标准化；真实 Chrome/MCP 输入仍需在 M3 验收；
- 构建和 lint 通过。

### 模型有效

- 每个 profile 有固定样本和人工基准；
- issue 必须带证据；
- 不可评估样本不得被判为 PASS；
- 真实 Provider 的费用和调用次数可追踪。

### 用户价值

- 用户能定位问题并知道下一步；
- 修改建议能减少实际返工；
- 用户愿意重复使用；
- 真实客户采用或付费证据出现后，才讨论商业扩张。

## 8. 本阶段明确不做

- 不改官网首页；
- 不部署线上；
- 不清理现有工作树或删除旧电商页面；
- 不复制完整第三方桌面应用；
- 不把截图审美与代码质量合成一个总分；
- 不默认启用源码写入；
- 不在 Electron 之前引入支付、订阅或公开客户入口。

