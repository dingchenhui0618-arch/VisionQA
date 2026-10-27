# VisionQA Web Plugin

这是 VisionQA 的网页宿主与本地运行时。它只提供视觉评审插件，不再包含旧的登录、商品批次、修图额度或营销工作台入口。

## 本地运行

```powershell
npm ci
npm run dev:local
```

打开 `http://localhost:6300/plugin`。`start-local.mjs` 会保持本地 fail-closed 边界；桌面 shell 在端口被占用时选择备用端口。

## 适配器

- `scripts/visual-review-cli.ts`：`capabilities`、`validate`、`review` 命令行。
- `scripts/visual-review-mcp.ts`：本地 MCP 工具。
- `host/chrome/`：Chrome MV3 Host adapter，采集截图、DOM 摘要、computed style、元素几何与 revision。
- `app/api/visual-review/host/route.ts`：localhost-only Host evidence route。
- `lib/visionqa/plugin-runtime.ts`：Visual/Code/Linked 的统一运行时和 Mock/真实 Provider 边界。

CLI、MCP、网页和 Electron 共用根目录 `contracts/` 中的 VisualReview、CodeReview、Host Capture 和 Observation Envelope 契约。没有产物或真实 Provider 授权时，返回 `NEEDS_CONTEXT`、`MANUAL_REVIEW` 或 fixture，并明确说明证据限制。

## Provider 与密钥

Provider 配置只在本地服务端或 Electron 主进程读取。API key 不进入 Renderer、浏览器 URL、仓库或日志。公开环境默认关闭真实调用；真实模型质量必须另行做有预算的回归，不能由 Mock 结果替代。

## 测试

```powershell
npm run lint
npm run test:plugin
npm run desktop:test
npm test
```

本地验收记录见 [`../docs/LOCAL_PLUGIN_ACCEPTANCE_2026-10-27.md`](../docs/LOCAL_PLUGIN_ACCEPTANCE_2026-10-27.md)。
