# 安全模型 / Security model

这份文档说明 **VisionQA** 接收哪些数据、把它们送到哪里、存在哪里，以及哪些"门"
是真的、哪些只是默认值。它从实现（`web/app/api/**`、`web/lib/visionqa/**`、
`web/host/chrome/**`、`desktop/**`、`web/scripts/start-local.mjs`）里读出来；
**如果文档和代码不一致，以代码为准，那说明这份文档是个 bug。**

> 一句话：这是一个**只在本机跑**的视觉评审插件——默认 Provider 是离线 Mock，
> 只有你显式打开桌面开关、把密钥写进仓库外的文件、并且宿主在请求里声明
> `can_call_model=true` 时，截图才会被发到你自己的多模态模型端点。
> 它**没有账号体系**：本机 6300 端口上的接口没有任何令牌，能访问 localhost 的本地进程都能调用。

## 信任边界

| 表面 | 跑在哪 | 谁能用 | 鉴权 |
| --- | --- | --- | --- |
| 网页插件 `/plugin` | 本地 `vinext` dev/start，`localhost:6300`（桌面便携版可退到 `6301`） | 本机浏览器 | 无 |
| `POST /api/visual-review` | 同上，multipart（candidate + references + request JSON） | 本机任意 HTTP 客户端 | 无；真实 Provider 另有 localhost + 环境开关 |
| `POST /api/visual-review/host` | 同上，Host Capture JSON | 本机浏览器 / Chrome 扩展 | 无；校验 hostname 与 `NODE_ENV`，CORS 白名单 |
| `GET /api/health` | 同上 | 任何人（只回 `status/service/releaseMode/paymentProvider`） | 无 |
| Chrome 扩展（MV3） | 你的浏览器 | 你点插件按钮 | Chrome 的 `activeTab` 授权 |
| CLI / MCP | 本机进程 | 调用者自己 | 无 |
| Electron 桌面 Alpha | 本机 | 你 | 无；靠 `contextIsolation` + 包外密钥文件 |

**视为不可信输入**的：

- **截图与参考图**（PNG/JPEG/WebP，单张 ≤10 MB，参考图 ≤4 张，总量 ≤14 MB）；
- **Host Capture 里的 DOM 文本与对话**（`dom.text` ≤12000 字符、标题 ≤80 条、
  landmarks ≤40、互动摘要 ≤4000 字符、对话 ≤24 条每条 ≤4000 字符）——这些是**网页内容**，
  可能带指向模型的指令（prompt injection）；
- **`page.url` / `title` / `revision`**——由宿主采集，中继不核对其真实性；
- **`request` JSON**（goal / audience / must_keep / permissions）——调用方想怎么填就怎么填，
  但 `can_write_source` 必须为 `false`，schema 层面的 `refine` 会拒绝任何 `true`
  （`host-adapter-contract.ts`）；
- **Provider 的响应**——模型返回的 JSON 只按契约解析，解析失败即错误，不执行其中代码；
- **仓库外的 secrets 文件**——按 `NAME=value` 解析，只接受白名单变量名。

## 会调用哪些模型 / 接口

默认 `provider=mock`：**不发任何网络请求**，结果明确标为 fixture/不可评估。
真实 Provider 只有在你显式配置后才可能被选中：

| Provider | 端点 | 凭证变量 | 发什么 |
| --- | --- | --- | --- |
| 本地 canary（Qwen 百炼） | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`，模型快照 `qwen3-vl-plus-2025-12-19` | `VISION_CN_ALIYUN_BAILIAN_API_KEY` 或 `DASHSCOPE_API_KEY` | 截图 + 参考图（data URL）+ DOM/意图上下文 |
| 用户自有多模态 | `VISION_MULTIMODAL_ENDPOINT`（必须 `https:` 或 localhost），OpenAI 兼容 `/chat/completions` | `VISION_MULTIMODAL_API_KEY` | 同上 |
| OpenAI 适配器 | 默认 `https://api.openai.com/v1/responses` | 由调用方传入 | `input_image` + 文本 |
| Qwen Image 3 修复执行器 | `https://<workspaceId>.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation` | `VISION_REPAIR_QWEN_API_KEY` + `VISION_REPAIR_QWEN_WORKSPACE_ID` | 修复草稿与产品参考图（按 `VISION_REPAIR_QWEN_DATA_SCOPE`） |
| DeepSeek 编排器 | 结构化修复规划 | `VISIONQA_ORCHESTRATOR_DEEPSEEK_API_KEY` | **只发结构化事实，不发图片字节**（`.env.example` 写明 `STRUCTURED_REPAIR_FACTS_NO_IMAGES`） |

真实调用前的门（缺一条就失败关闭）：

1. URL 的 hostname 是 `localhost` / `127.0.0.1` / `[::1]`，且服务不是 `NODE_ENV=production`；
2. `VISION_LOCAL_CANARY_ALLOW_LOCALHOST=true`（桌面 `real` 模式会由
   `start-local.mjs` 注入；网页模式默认关闭）；
3. 请求里 `permissions.can_call_model=true`；
4. Provider readiness 通过：本地 canary 还要求 `VISION_LOCAL_CANARY_ENABLED`、
   `VISION_PAID_CALLS_ENABLED`、`VISION_DATA_PROCESSING_APPROVED`、`EXPLICIT_RUN_APPROVAL`
   都精确等于 `true`，模型在白名单内且 key 存在；桌面 `off` 模式会从服务端阻断真实路径；
5. 请求预算：本地 canary 要求 `VISION_BUDGET_CURRENCY=CNY`、`VISION_BUDGET_LIMIT_MINOR_UNITS=200`、
   `VISION_LOCAL_CANARY_MAX_TOTAL_REQUESTS=15`、`VISION_MAX_CONCURRENCY=1` 精确匹配；
   用户多模态 `VISION_MULTIMODAL_MAX_TOTAL_REQUESTS` 默认 15、上限 100。

## 数据与副作用（图存哪）

- **不落盘**：网页插件路径里，图片以内存中的 `File`/`ArrayBuffer` 与
  `URL.createObjectURL()` 预览存在，**不写 `uploads/`、不写数据库、不上传对象存储**。
  仓库里虽然有被 gitignore 的 `web/public/uploads/`，但当前 `main` 没有任何代码写它。
- **示例素材与导出**：桌面端"导出评审"由用户选路径，只写**评审 JSON**（不含图片、不含密钥），
  由 `desktop/main.mjs` 的 `visionqa:export-review` 完成。
- **真正离开机器的数据**：只有你启用真实 Provider 时，截图 + 参考图 + DOM 摘要 + 意图/对话
  会发到上表那个端点；Mock 路径为零网络请求。
- **仓库里有一个未被引用的 IndexedDB 模块** `web/lib/visionqa/project-store.ts`
  （`visionqa-project-store`，assets 存浏览器 IndexedDB）。当前 `main` 没有页面导入它；
  如果将来启用，素材会留在**本机浏览器**存储里，不会上传。
- **没有遥测、没有埋点、没有崩溃上报。**

## 权限现状（照实写）

- **没有账号、没有 token、没有 API key 校验**：`/api/visual-review` 与 `/host` 对本机调用者
  完全开放。所谓"安全边界"是 localhost + 默认 Mock + 环境开关，不是身份认证。
- **Host 路由的 CORS**：只对 `http://localhost:6300`、`chrome-extension://<VISIONQA_CHROME_EXTENSION_ID>`
  回 `Access-Control-Allow-Origin`；未设置该变量时默认值是字符串 `audit`——**这是一个占位默认值，
  不是真实扩展 ID**，装扩展后应当显式设置。
- **Chrome 扩展**声明 `activeTab`、`scripting`、`tabs` 权限，host 权限只到
  `localhost:6300`；`tabs` 让它能读标签页标题/URL，采集范围由你点击按钮触发。
- **桌面端**：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，
  Renderer 只通过白名单 IPC 通道访问主进程；API Key 只经 IPC 进入主进程并写包外
  `provider.env`，**不回传页面、不进 localStorage/导出结果/日志**。
- **没有"看起来像门禁其实不是"的东西之外的门**：上面 5 条真实调用门是代码里逐条判断的；
  预算计数器在进程内存里，重启即清零（见已知限制）。

## 已知限制（都是设计取舍，不是 bug——但你应该知道）

1. **本机接口没有认证**：任何能访问 `localhost:6300` 的本地进程（或你浏览器里被允许跨域的
   页面）都能 POST 评审请求。它对"本机其他程序"不做隔离。
2. **Mock 不是准确率**：默认结果是 fixture，页面会标 `NEEDS_CONTEXT` / `MANUAL_REVIEW`；
   任何"评审通过"的结论都只代表实现能跑，不代表视觉质量或客户采纳。
3. **启用真实 Provider 就是数据出境**：截图、DOM 摘要、对话会发到第三方端点；本仓库不提供
   加密、脱敏、留存策略或零数据保留（ZDR）保证——`.env` 里的 `VISION_ZDR_CONFIRMED` 等
   只是**声明**，不是运行时强制。
4. **Prompt injection 没有硬拦截**：网页 DOM/对话文本会进入提示词，模型可能被页面内容带偏。
   契约要求证据锚点、Mock 也要求 evidence，但这降低不了"模型被诱导"的类别风险。
5. **预算与并发只在进程内**：重启服务即重置计数；多实例并发跑等于多份预算。
6. **`VISIONQA_CHROME_EXTENSION_ID` 默认 `audit`**：占位值，部署时必须改成真实扩展 ID。
7. **本地 HTTP 无 TLS**：localhost 明文；浏览器扩展与本地服务之间没有加密层
   （同机回环，风险主要是本机其他进程）。
8. **桌面 Alpha 未签名**：安装包不具备生产分发所需的签名与公证；`provider.env` 的权限检查
   只在类 Unix 上生效（Windows 依赖 ACL）。
9. **历史遗留的试用账号常量**：`web/lib/visionqa/trial-auth.ts` 里还留着旧试用账号的
   电话掩码、密码摘要与固定会话令牌；当前 `main` 没有任何路由或模块引用它（已验证无 import），
   它们不构成可用的登录通道，但**也不应该继续存在于公开仓库**——按凭据处理，不要复用。
10. **没有 LICENSE、没有版本号**：仓库没有 `LICENSE`、没有 tag，`main` 即最新。

## 明确不算漏洞的

- 本机任意进程调用 `/api/visual-review`（这是"本地工具"的设计，见第 1 条）；
- Mock 结果看起来"没给出结论"（fixture 明确不评估真实像素，见第 2 条）；
- 打开真实 Provider 后图片被发送到你自己配置的端点（那是功能本身，见第 3 条）；
- Chrome 扩展读取当前标签页标题/URL（`tabs` 权限 + 用户点击触发）；
- 桌面渲染进程拿不到 API Key、导出的 JSON 里没有密钥（这是设计并有测试覆盖）；
- 仓库里的 fixture 名称/示例图片不含真实客户数据。

## 报告漏洞

用 GitHub 的私密渠道：<https://github.com/dingchenhui0618-arch/VisionQA/security/advisories/new>

这是一个人维护的项目，**我不承诺响应时限**；但我会读、会修，修完会在 commit 说明里写清
影响范围。请不要把还在生效的问题直接发到公开 issue 里。

## 支持范围

只维护 `main` 上的最新提交（`web/` 当前 `version: 0.1.0`）。没有发布分支、没有回补；
复现请基于 `main` 的 `npm ci` + `npm run test:release`。
