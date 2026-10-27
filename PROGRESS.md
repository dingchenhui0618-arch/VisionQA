# VisionQA 当前产品与项目进度

## 2026-10-27：本地插件验收与产品快照收敛

- 本地 `/plugin` 完成真实点击验收：选择本地产物后显示缩略图、文件名、大小和证据状态；点击评审返回 fixture/人工判断结果，并明确未调用真实模型。
- portable shell 已验证默认端口被占用时切换到备用端口；Electron 窗口正常加载插件，原生标题栏使用 C3 品牌图标。
- `npm run build`、`npm run lint`、`npm run test:plugin`（34/34）、`npm run desktop:test`（9/9）通过。
- 公开 `main` 与 `codex/visionqa-phase3-qwen` 已重建为独立根提交 `e909816`；远程旧 archive 分支和历史 tag 已删除。
- 旧 SaaS/电商工作台、客户/商业素材和历史运行数据已从公开可达 refs 清除。完整旧历史仅保留在本机 `D:\Projects\VisionQA-local-archive-20261027.git`，不属于公开发布内容。

## 当前产品边界

VisionQA 是宿主智能体的视觉评审插件，不是独立的生图、修图、营销或电商运营系统。宿主负责创建产物和执行修改；插件负责读取证据、形成结构化评审、提出需确认的修正方向，并在 revision 变化后复验。

## 已有实现

- VisualReview v0.1/v0.2、CodeReview v0.1、Review Profile 和 Observation/Host Capture 契约。
- Visual、Code、Linked 三条离线 Mock 流程与 Host fixture。
- Chrome/MCP Host adapter：截图、DOM 摘要、元素几何、computed style、对话上下文和 revision。
- Web 插件悬浮窗口、当前证据预览、评审/上下文/版本视图和本地 Provider 设置边界。
- Electron Windows Alpha、macOS developer bundle、portable 启动和 Provider 密钥不入 Renderer 约束。

## 验收边界

- 当前已验证的是工程运行、合同解析、离线 Mock 和本地点击链路。
- Host capture 已能产生截图/DOM/revision；截图原图尚未直接注入网页证据缩略图槽位，需后续通过安全消息桥补齐。
- 真实多模态模型调用、模型质量、问题定位率、建议采纳率、客户付费和线上生产稳定性均未由本次验收证明。
- 公开仓库禁止提交 API key、`.env`、客户图片、素材 manifest、开发日志和构建产物。

## 下一步

1. 完成 Host capture 截图到插件证据槽位的安全消息桥。
2. 在本地显式 Provider 配置下做小预算真实多模态回归，并分别记录工程与模型证据。
3. 为 Windows/macOS Alpha 做签名、安装和卸载测试，再讨论生产发布。
4. 若将来发现新的受限内容，先更新本地归档并审计所有公开 refs；不要把删除当前文件误认为已清除 Git 历史。
