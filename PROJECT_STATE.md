# VisionQA 项目状态

更新时间：2026-10-27（Asia/Shanghai）

## 一句话

VisionQA 是一个可嵌入 Chrome、MCP 或桌面宿主的视觉评审插件：宿主提供截图/产物、DOM 摘要、上下文和 revision，VisionQA 返回有证据的视觉评审、人工确认动作和有界修正建议。

## 当前发布快照

- 本地网页入口：`http://localhost:6300/plugin`
- 桌面开发入口：`D:\VisionQA\desktop\main.mjs`
- VisualReview/Host 契约：`contracts/` 与 `web/lib/visionqa/`
- Chrome Host adapter：`web/host/chrome/`
- 当前默认 Provider：fixture/Mock；真实 Provider 只有显式本地配置才可用。
- 本地历史归档（不上传）：`D:\Projects\VisionQA-local-archive-20261027.git`

## 本地验收证据

- 产物选择后，插件“当前证据”区域显示真实缩略图、文件名、大小和等待状态。
- 点击“开始评审”后显示 `需要人工判断`，provider 为 `fixture-visual-review-v0.1`，并明确未调用真实模型和未完成像素级判定。
- portable shell 在默认端口被占用时切换到备用端口；Electron 窗口加载插件并显示 C3 图标。
- `npm run build`、`npm run lint`、`npm run test:plugin`（34/34）、`npm run desktop:test`（9/9）通过。

## 证据边界

工程运行、合同测试和本地点击只证明实现可运行。它们不代表真实视觉模型准确率、客户采用、节省时间、付款或生产稳定性。Host capture 当前已能获得截图、DOM 摘要和 revision，但截图原图还需通过安全消息桥直接进入插件证据槽位。

## 产品边界

当前 `main` 只保留独立插件、桌面端、契约、测试、品牌资源和脱敏文档。旧 SaaS/电商工作台、历史修图业务、客户/商业数据和运行报告已从公开可达 refs 移除；恢复入口是本机离线 bare mirror，不是公开分支。公开 refs 目前仅为 `main` 与 `codex/visionqa-phase3-qwen`，均指向独立根提交。

## 安全边界

不得把 API key、`.env`、客户图片、原始素材 manifest、开发日志、`node_modules`、`.next`、`dist` 或 portable bundle 提交到 public repository。桌面 Renderer 不拥有任意文件、命令或源码写入权限；真实 Provider 只在本地显式启用。

## 下一步

1. 安全地把 Host capture 截图传入插件证据槽位。
2. 用明确预算完成真实多模态 Provider 小样本回归。
3. 完成 Windows/macOS Alpha 安装、签名和卸载验收。
4. 若继续扩展公开仓库，先做完整 secret/material exposure audit，并保持本地归档与公开 refs 分离。
