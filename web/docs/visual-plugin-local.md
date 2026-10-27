# VisionQA 视觉评审插件：localhost 运行说明

`/plugin` 是独立于官网首页的插件运行面板。它保留当前的深色浮窗形态，用一份 `VisualReview Contract` 接收宿主上下文、图片和约束，再返回评审结论、证据与人工确认前的修正计划。

## 本地入口

启动 `web` 后访问：

```text
http://localhost:6300/plugin
```

服务端接口：

```text
GET  /api/visual-review       # 能力、Provider 和预算状态，不返回密钥
POST /api/visual-review       # multipart/form-data
POST /api/visual-review/host  # Chrome/MCP JSON Host Capture
```

表单字段：

- `request`：JSON 编码的 `visual-review-v0.1` 请求；
- `provider`：`mock` 或 `auto`；`auto` 代表唯一的用户多模态 API 配置，开发环境没有该配置时才回退到已批准的 Qwen canary；
- `candidate`：需要评审的 JPG、PNG 或 WebP；
- `references`：可选参考图，最多 4 张。

Mock 和 Qwen 都通过 `runVisualPluginReview` 进入同一份请求/响应契约。Mock 永远标记 `usage.mode=mock`，明确说明没有真实像素证据；它不能被当作准确率或客户结果。Qwen 结果由既有 `local-canary` 适配器转成统一响应，并在服务端做 Contract 校验。

当 Host Capture 的 `artifact.type` 为 `web_page` 时，当前截图就是待评视觉产物，DOM 摘要和对话只作为辅助上下文，参考图可选。此模式不使用服饰真实性或商品促销六项评分，旧评分字段会固定为 `NOT_APPLICABLE`；网页结论只来自可见的层级、对齐、可读性、对比度、交互可见性和响应式风险。这样网页没有 SKU 真值图时不会被误报为 `missing_candidate_image` 阻断，但目标区域不明确仍会进入人工复核。

## 真实 Provider 的安全边界

Qwen 的密钥只允许出现在服务端环境变量中：

```text
VISION_CN_ALIYUN_BAILIAN_API_KEY   # 或 DASHSCOPE_API_KEY
```

本地真实调用同时要求以下环境门控均为 `true`，并固定使用既有 15 次、总预算 200 分（人民币分）的 hard cap：

```text
VISION_LOCAL_CANARY_ENABLED
VISION_LOCAL_CANARY_ALLOW_LOCALHOST
VISION_PAID_CALLS_ENABLED
VISION_DATA_PROCESSING_APPROVED
EXPLICIT_RUN_APPROVAL
VISION_MODEL=qwen3-vl-plus
VISION_BUDGET_CURRENCY=CNY
VISION_BUDGET_LIMIT_MINOR_UNITS=200
VISION_LOCAL_CANARY_MAX_TOTAL_REQUESTS=15
VISION_MAX_CONCURRENCY=1
```

这版本地适配器的请求计数与去重缓存保存在进程内；重启 localhost 会重置它们，不能把它当作生产计费账本。真正上线前必须把调用记录、预算和幂等键移到持久化服务端账本。

接口只接受 localhost/127.0.0.1 的真实 Qwen 请求；生产或可公开访问的主机不会因为拥有环境变量就自动开放。单图最大 10 MB、总图片最大 14 MB、参考图最大 4 张；不满足条件时不会发出 Provider 请求。

## Provider 分工

当前视觉评审路径可以使用一套 OpenAI-compatible `chat/completions` 多模态 API。它可以指向用户自己的 Qwen、DeepSeek-VL、Seed 或其他兼容端点，前端不展示多个 Provider，也不接触密钥。下面这些变量属于同一个服务端配置档：

```text
VISION_MULTIMODAL_ENABLED=false
VISION_MULTIMODAL_ENDPOINT=https://your-compatible-endpoint.example/v1/chat/completions
VISION_MULTIMODAL_API_KEY=<server-only-secret>
VISION_MULTIMODAL_MODEL=<your-vision-model>
VISION_MULTIMODAL_PROVIDER_ID=user-multimodal
VISION_MULTIMODAL_MAX_TOTAL_REQUESTS=15
```

如果用户的 API 不是 OpenAI-compatible Chat Completions，不能安全地“自动猜”协议；应为该协议增加一个很薄的服务端映射，而不把 Key 放到浏览器。DeepSeek 在这套插件里也不伪装成图像 Provider：它可以作为宿主侧的文本/规划模型，整理意图、补齐上下文和结构化约束；只有真正接受图片输入的多模态模型才进入视觉证据链。

Chrome Host Adapter 位于 `web/host/chrome/`：它采集当前可见截图、DOM 文本/标题/交互摘要，以及宿主主动声明的 `window.__VISIONQA_HOST_CONTEXT__.conversation` 对话上下文，然后发到本地 `/api/visual-review/host`。截图会在扩展内缩放到最长边 1800px，并优先压成 JPEG，避免高 DPI 页面把 JSON 请求撑过本地体积上限。MCP 启动方式为 `npm run visual:mcp`，工具名为 `review_host_context`。Host Capture 的跨语言契约位于 `contracts/host-capture-v0.1.schema.json`。

Chrome 扩展需要让 Vinext 的开发源检查允许自己的扩展 ID。先在 `chrome://extensions` 打开开发者模式并加载 `web/host/chrome/`，复制扩展 ID，然后在 `web/.env.local` 设置（只写 ID，不写 API Key）：

```text
VISIONQA_CHROME_EXTENSION_ID=<chrome-extension-id>
```

重启 `npm run dev` 后再点扩展按钮。没有设置时，本地冒烟测试默认允许 ID `audit`；真实加载的扩展若 ID 不同，预检会被拒绝，这是刻意的本地来源白名单。
MCP 到本地 Host route 的调用默认 60 秒超时，可用 `VISIONQA_HOST_REQUEST_TIMEOUT_MS` 调整（范围 5–120 秒）。

## 当前未自动做的事

- 插件不会写回宿主文件；`repair_plan.requires_approval` 固定为 `true`；
- 插件不会把 Mock 结果升级成真实质量结论；
- Host Capture 的 DOM 是摘要（正文、标题、地标、交互元素），不是可直接定位到节点的完整布局树；评审应以截图为主、DOM 为辅助证据；
- 同一 `capture_id + provider` 在当前进程内 5 分钟内会复用结果，避免重复点击造成重复计费；这不是生产账本，重启后不保留；
- 插件暂不执行图像修正本身；它先返回带证据的修正计划，后续再接独立 image-edit Provider；
- 真实 Qwen 调用每次都受本地次数、并发、图片大小和预算门控约束，失败不会自动重试。

推荐验证顺序：先用 Mock 跑通 UI，再用仓库内非客户示例素材做单次 Qwen 调用，最后再接宿主 MCP/Chrome adapter。每次真实调用都要记录 provider request id、耗时和账本信息，但不要把图片或 API key 写入日志、Git 或公开 URL。
