# VisionQA Visual Review Plugin

[![CI](https://github.com/dingchenhui0618-arch/VisionQA/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/dingchenhui0618-arch/VisionQA/actions/workflows/ci.yml)

VisionQA 是一个可嵌入宿主智能体的视觉评审插件。它接收宿主传入的截图/产物、DOM 摘要、对话目标和 revision，输出可追溯的视觉判断、证据锚点、人工确认动作和有界修正方向。

当前仓库的唯一产品边界是插件与桌面宿主，不是旧的电商 SaaS、批次修图工作台或通用营销系统。旧阶段内容已经从当前 `main` 快照移除，恢复入口见 [`docs/PRODUCT_RELEASE_SCOPE.md`](./docs/PRODUCT_RELEASE_SCOPE.md)。

> 用着还行的话，点个 ⭐ 就够了——插件市场的「搜插件」按 GitHub star 排序，star 是这个插件能被人翻到的唯一杠杆。

安全模型——默认 Mock、真实 Provider 的五道门、截图发到哪、图有没有落盘：
[SECURITY.md](SECURITY.md)。

## 当前状态

- 本地网页插件 `/plugin` 可运行，支持本地产物缩略图、证据锚点和离线 fixture 评审。
- Chrome/MCP Host 能采集截图、DOM 摘要和 revision；Host route 具备本地安全边界。
- Electron Windows Alpha 与 macOS developer bundle 脚本已保留，portable shell 在 `6300` 被占用时可切换到 `6301`。
- 默认 Provider 为 Mock/fixture。真实多模态 Provider 仅在本地显式配置时启用；任何 fixture 结果都不代表模型准确率或客户采用。
- 本次本地验收记录见 [`docs/LOCAL_PLUGIN_ACCEPTANCE_2026-10-27.md`](./docs/LOCAL_PLUGIN_ACCEPTANCE_2026-10-27.md)。

## 本地启动

要求 Node.js `>=22.13.0`。

```powershell
cd D:\VisionQA\web
npm ci
npm run dev:local
```

访问 `http://localhost:6300/plugin`。若端口被占用，桌面 portable shell 会选择备用端口；也可以直接设置 `VISIONQA_DESKTOP_PORT`。

## 本地 CLI / MCP

```powershell
npm run visual:capabilities
npm run visual:validate -- examples/visual-review-request.json
npm run visual:review -- examples/visual-review-request.json
npm run visual:mcp
```

CLI、MCP、网页路由和桌面端共用 VisualReview Contract。没有可用产物或真实模型授权时，结果会明确标记为 `NEEDS_CONTEXT`、`MANUAL_REVIEW` 或 fixture，不伪造像素结论。

## 桌面 Alpha

```powershell
cd D:\VisionQA\web
npm run desktop:portable
npm run desktop:test
npm run desktop:builder:portable
npm run desktop:mac:bundle
```

桌面端只允许 localhost/受控本地 Provider，Renderer 不拥有任意文件、命令或源码写入权限。Alpha 未签名，不是生产安装包。

## 文档入口

- [`PROJECT_STATE.md`](./PROJECT_STATE.md)：当前状态、证据边界和下一步。
- [`PROGRESS.md`](./PROGRESS.md)：按阶段记录的进度与验收结果。
- [`docs/VISUAL_PLUGIN_PRODUCT_CHARTER.md`](./docs/VISUAL_PLUGIN_PRODUCT_CHARTER.md)：产品章程。
- [`docs/REVIEW_CONTRACTS_V0.2.md`](./docs/REVIEW_CONTRACTS_V0.2.md)：Visual/Code/Linked 评审契约。
- [`docs/VISUAL_PLUGIN_LOCAL_ADAPTER.md`](./docs/VISUAL_PLUGIN_LOCAL_ADAPTER.md)：CLI/MCP 本地适配器。
- [`docs/desktop-provider-boundary.md`](./docs/desktop-provider-boundary.md)：桌面 Provider 与密钥边界。
- [`docs/PRODUCT_RELEASE_SCOPE.md`](./docs/PRODUCT_RELEASE_SCOPE.md)：本次从旧 SaaS 快照收敛到独立插件的范围。

## 安全与证据边界

源码仓库不保存 API key、`.env`、客户图片或开发日志。工程构建与点击验收只能证明实现可运行；真实模型有效性、客户采用、付款和生产可靠性必须分别用独立证据验证。
