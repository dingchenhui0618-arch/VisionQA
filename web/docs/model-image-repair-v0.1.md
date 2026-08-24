# VisionQA AI 模特图修正流程 v0.1

## 阶段定位

VisionQA 当前定位为“服饰电商 AI 模特图修正与交付工作台”。它位于 AI 美工生成模特草图之后、详情页与促销排版之前：

`商品白底真值 + AI 模特草图 → 问题诊断 → 修正 → 前后复验 → 4K 交付 → 详情页/促销排版`

当前不以替代专业美工、批量打分、营销文案或达人推荐作为主要价值。

## 四步主流程

1. 商品真值：白底正面、背面、侧面、关键细节、官方 Logo 与 SKU 输入；
2. AI 模特草图：同一 SKU、同一用途，每个任务建议 1 张，最多 3 张；
3. 问题诊断：商品漂移、明显人体异常、遮挡、材质失真和非目标区域变化；
4. 修正与交付：改图任务、修改前后对比、人工四项复验、本机 4K 文件与处理凭证。

## 促销信息 P0 修正

- 默认模板改为 `ai_model_image_repair@0.3.0`；
- AI 模特母图不承担促销表达，缺少价格、优惠、CTA 或商业贴字不得成为观察、差距、低分、返工动作或 Gate 原因；
- Provider 即使错误返回 `no_promotion_overlay / missing_promotion_overlay`，规则层也会在非促销模板下过滤；
- 历史本机项目中的旧 `platform-promotion` 前端模板在恢复时迁移为 `model-image-repair`；
- 旧模板错误导致的 REJECT 不得作为图片质量证据。

机器契约：[`../contracts/model-image-repair-brief-v0.1.schema.json`](../contracts/model-image-repair-brief-v0.1.schema.json)

## 真实素材链与示例隔离

- 一旦项目存在客户上传候选图，总览、问题诊断与修正页只使用该候选图的对象 URL；
- 尚未完成模型诊断时建立 `NOT_RUN / scoreAvailable=false` 占位对象，不从内置示例复制图片、问题、分数或 Prompt；
- Repair Case 同时绑定候选图 ID、SHA-256、商品真值图、诊断结果、Provider Job、改图输出、人工复验和 4K 输出；
- 缺少商品真值或真实诊断时，即使历史项目存在改图或 4K 文件，也不能形成新的交付结论。

## 千问改图 Provider v0.1

首选改图适配器为阿里云百炼千问图像编辑，固定模型快照 `qwen-image-edit-max-2026-01-16`。适配器遵循以下边界：

- 第一张输入始终是需要修正的 AI 模特草图，后续最多 4 张是商品真值参考；
- `prompt_extend=false / watermark=false / n=1`，不让 Provider 自动扩写商品事实；
- 输出临时 URL 只允许阿里云域名，并立即下载回当前浏览器 Project；
- 不自动重试付费生成，避免重复扣费；
- API Key、业务空间、Provider 批准、付费调用、数据范围和固定模型六项 Gate 全部满足前，POST 在读取图片前返回 403，网络请求为零；
- 每次真实发送仍需要页面内单次确认，确认状态不写入 Project。

当前没有配置或启用真实千问改图调用。机器接口：`GET/POST /api/repair-jobs`。

API 参数依据：阿里云百炼《千问-图像编辑 API 参考》：<https://help.aliyun.com/zh/model-studio/qwen-image-edit-api>。

## 多智能体协作骨架

当前 Repair Case 使用六个稳定职责：商品真值守门员、问题诊断智能体、修正规划智能体、改图执行智能体、漂移复验智能体、清晰度交付智能体。它们共用同一个事实账本和版本链。

当前实现是 `LOCAL_STATE_MACHINE_NO_MODEL`，用于验证职责、输入、产物和交接 Gate，不冒充六个独立模型正在自主对话。未来接入多个模型时继续沿用同一 Repair Case 契约，而不是让各 Agent 自由复制商品事实。

机器契约：[`../contracts/repair-case-v0.1.schema.json`](../contracts/repair-case-v0.1.schema.json)

## 4K 与真实 AI 超分边界

本机能力 `visionqa-browser-resample-v0.1` 使用浏览器高质量分级重采样：

- 1280×720 → 3840×2160；
- 720×1280 → 2160×3840；
- 其他比例保持长宽比，长边提升到 3840；
- 已达到或超过 3840 长边的图片不静默降采样；
- 不上传第三方，不产生 API 费用；
- 生成的是 4K 像素尺寸文件，不宣称重建了原图不存在的纹理细节。

真实 AI 细节重建需要 Real-ESRGAN/SwinIR 等本地模型，或外部超分 API。当前机器未发现可复用本地运行时；外部 Provider 仍需单独确认 API Key、费用和图片发送范围。

机器契约：[`../contracts/upscale-job-v0.1.schema.json`](../contracts/upscale-job-v0.1.schema.json)

## 持久化

改图输出、人工复验勾选、4K 输出和处理凭证写入当前本机 Project 的 `assets` 与版本化 payload。清除当前站点的浏览器数据会同时清除这些本机文件。
