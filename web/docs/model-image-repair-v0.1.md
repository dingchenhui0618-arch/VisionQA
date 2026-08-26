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

## 诊断运行与超时契约

- 单次视觉诊断总等待上限为 180 秒；这是请求级总等待，不是自动重试间隔；
- 输出固定 `max_completion_tokens=2400`，关闭思考模式，返回严格 JSON；
- 付费诊断固定 `maxAttempts=1`，超时、网络失败或限流均不得自动重试；
- 浏览器在发送前生成 Request ID，并透传为 `X-DashScope-Request-Id`；Project 记录请求时间、耗时、错误码、Provider Request ID 和 Token 用量（若返回）；
- `LIVE_MODEL_TIMEOUT` 属于 `PROVIDER_WAIT` 技术失败，`product_conclusion_formed=false`，不得映射为商品图不合格、REWORK 或 REGENERATE；
- 每次请求结束后撤销图片发送确认，下一次必须重新人工勾选。

## 模特母版与改图输出 Gate

- 千问多图编辑的输入顺序固定为：最多 2 张商品真值参考在前，待修 AI 模特母版最后；千问以最后一张输入图决定输出宽高比；
- 前序商品真值图只用于核对颜色、版型、口袋、图案、Logo 与材质，不得成为背景、裁切、镜头、商品摆放或构图参考；
- 最后一张 AI 模特图是唯一人物身份、姿势、画幅、镜头、景别、人物大小、背景和构图母版；只允许修改诊断明确指出的服装局部；
- 禁止输出服装白底图、商品特写、局部裁切、无人物图、重新摆拍或改变人物／背景／镜头；
- Provider 返回图片后先运行本机 `repair-output-gate-v0.1`。画幅漂移或粗粒度构图差异过大时标记 `REPAIR_OUTPUT_MAJOR_DRIFT`；
- 被拦截图片只用于排查，不成为 `outputFile`，人工复审勾选、4K 和交付继续禁用；本机 Gate 不产生外部调用或额外费用。

## 合成受控样例与 ImageGen 金标准

- `SYN-VQA-BURGUNDY-TROUSERS-001` 是内部合成案例，唯一目标问题为画面左侧（模特右腿）多出的翻盖工装口袋；
- `imagegen-repair-gold-v0.1.png` 使用内置 ImageGen 的 `precise-object-edit` 路线生成，模特母图是唯一编辑底图，商品真值板只校验裤装结构；
- 金标准输出保持 1024×1536 完整模特画幅，并已在真实工作台上传路径通过本机构图漂移 Gate；它仍需四项人工复验，不自动成为终稿；
- “载入受控样例真值”同时校验候选数量、源图 SHA-256 和真值板文件名。它只把已知人工缺陷写入 Repair Case，不调用模型、不生成商业分数，普通客户图不能使用；
- 该内部模式用于在 Provider 诊断失败时验证本地状态机与交付链，不能替代真实模型有效性或客户采用证据。

## 千问改图 Provider v0.1

首选改图适配器为阿里云百炼千问图像编辑，固定模型快照 `qwen-image-edit-max-2026-01-16`。适配器遵循以下边界：

- 完整 SKU 可以在 Project 中保留多张商品真值图；每次调用由用户选择最相关的最多 2 张参考图并放在前序，待修 AI 模特草图始终作为最后一张输入和唯一构图母版，总输入不超过 3 张；
- `prompt_extend=false / watermark=false / n=1`，不让 Provider 自动扩写商品事实；
- 输出临时 URL 只允许阿里云域名，并立即下载回当前浏览器 Project；
- 不自动重试付费生成，避免重复扣费；
- API Key、业务空间、Provider 批准、付费调用、数据范围和固定模型六项 Gate 全部满足前，POST 在读取图片前返回 403，网络请求为零；
- 每次真实发送仍需要页面内单次确认，确认状态不写入 Project。

当前本地人工测试模式已配置千问改图能力，但每次真实发送仍要求单次页面确认，失败不自动重试。机器接口：`GET/POST /api/repair-jobs`。

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
