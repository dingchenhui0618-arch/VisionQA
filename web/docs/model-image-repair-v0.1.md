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
