# VisionQA 本地插件版本验收记录

日期：2026-10-27（Asia/Shanghai）
范围：本地 Chrome/IAB 预览、Electron Windows Alpha、离线 Mock 评审与 portable 冷启动。

## 结论

本地插件版本已达到“可交付开发者 Alpha”的工程验收线：页面可以从本地宿主进入插件，选择本地产物后生成真实缩略图，点击评审得到带证据边界的结果；Electron portable 在默认 `6300` 被占用时可切换到备用 `6301`，窗口能够打开并加载插件页面。

这不是模型质量、客户采用或生产发布证明。当前评审结果仍明确标记为离线 fixture/人工判断，未把本地 Mock 结果解释为真实视觉模型结论。

## 已验收路径

1. 本地启动 `web` 服务，并由 portable shell 探测端口。
2. `6300` 已被占用时自动使用 `6301`；`GET /api/health` 返回 `status=ok`，`releaseMode=local`，支付保持关闭。
3. 打开 `/plugin`，选择一张本地产物图；“当前证据”区域显示真实文件缩略图、文件名、大小和等待评审状态。
4. 输入评审目标并点击“开始评审”。结果显示“需要人工判断”，provider 显示 `fixture-visual-review-v0.1`，并说明未调用真实模型、未完成像素级判定。
5. Electron 窗口标题为 `VisionQA · 视觉评审插件`，原生窗口使用 C3 品牌图标；页面内部使用同一套 C3 资产。

## 自动化证据

- `npm run build`：通过。
- `npm run lint`：通过。
- `npm run test:plugin`：34/34 通过。
- `npm run desktop:test`：9/9 通过。
- `git diff --check`：无 whitespace 错误。

## 仍然明确未完成

- 当前插件前端已验收“本地产物缩略图”路径；Chrome/MCP Host 的截图原图尚未直接注入该缩略图槽位。Host capture 已能产生截图、DOM 摘要和 revision，下一步应建立安全的截图缓存/消息桥。
- 未启用真实 Provider，未记录真实模型费用，也未执行线上部署。
- Electron Alpha 未签名、未做自动更新，不是客户生产安装包。
- `web/artifacts/` 中的开发日志和本地素材 JSON 不属于公开发布内容；它们已加入忽略规则。

## 发布边界

公开仓库只应包含源码、契约、测试、脱敏文档和可复现脚本；不得提交 API key、`.env`、客户图片、真实素材清单、开发日志或 portable/build 产物。历史业务代码和旧阶段文档仍保留在 Git 历史与归档分支，除非另行确认明确的删除清单，不做不可逆的整库清空。

## GitHub 同步记录

- 远程仓库：`https://github.com/dingchenhui0618-arch/VisionQA.git`
- 当前 `main` / `codex/visionqa-phase3-qwen`：`6f30ee7`（独立插件快照）。
- 清理前归档分支：`archive/pre-plugin-release-20261027`，指向清理前的 `origin/main`，用于恢复和历史审计。
- 当前 `main` 不含旧 `data/`、`datasets/`、`agents/`、`handoffs/`、`reports/`、`standards/`、`src/`、旧工作台路由、旧商品图和旧商业评测契约。
- 这次删除只改变当前分支树；如果需要从 public Git 历史彻底清除受限素材，仍需单独完成历史重写、转私有或新建干净仓库的安全决策。
