# VisionQA Qwen 3.0 / Wan 2.7 图像修正 Provider 接入计划

日期：2026-08-27。范围仅为服饰电商商品图与 AI 模特图的**问题发现后的局部修正、前后对比与高清尺寸交付**；不把模型宣传语、API 支持项或内部样例当作修正成功率、Logo 准确率或商业效果证据。

本报告未读取 API Key、业务空间、环境变量或账单，未调用任何模型接口，因此没有新增网络模型费用。地域、账号可用性、邀测资格、额度与实际价格均必须由主 Agent 在获得授权后从北京业务空间控制台与账单再确认。

## 结论与推荐路由

1. 保留现有 `qwen-image-edit-max-2026-01-16` 路线作为已落地、受 Gate 保护的兼容 Provider；不要静默把它替换成浮动别名。
2. 新建可选且固定模型 ID 的 `qwen-image-3.0-pro` Provider，作为**无 BBox、最多 3 图、需要通过正/负提示词严控全图构图与图案/文字视觉修正**的默认试验路线；`qwen-image-3.0`只作为同契约的成本/速度对照，不应在未做盲审评测前自动降级使用。
3. 新建 `wan2.7-image-pro` Provider，作为**人工已确认局部框（BBox）**或需更明确定位商品图案/Logo/贴花区域的受控路线；官方接口可接受最多 9 图，但产品第一版仍保持主图加至多 2 张真值参考。只将 BBox 视为“模型注意区域”输入，不视为像素级遮罩或不漂移保证。
4. 所有带图编辑统一请求 `2K`（或限定在 2K 上限的候选画幅）；高清交付继续使用既有本机高质量重采样。**`qwen-image-3.0-pro` / `qwen-image-3.0` 不支持原生 4K 编辑；`wan2.7-image-pro` 的 4K 仅适用于无输入图且非组图的文生图，图像编辑和组图最高 2K。**因此不得把 Wan 文生图 4K 宣称为“4K 修图”，也不得把本机放大说成模型细节重建。

官方依据：[图片生成与编辑模型矩阵](https://help.aliyun.com/zh/model-studio/image-model)、[千问图像编辑指南](https://help.aliyun.com/zh/model-studio/qwen-image-edit-guide)、[万相图像编辑指南](https://help.aliyun.com/zh/model-studio/wan-image-edit)、[万相 2.7 API 参考](https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference)。

## 能力与边界矩阵

| Provider（固定 ID） | 官方接口能力与输入约束 | 对 VisionQA 的推荐用法 | 不应承诺 / 必须人工复验 |
| --- | --- | --- | --- |
| 现有 Qwen Edit Max（`qwen-image-edit-max-2026-01-16`） | 编辑；1--6 输出，最大 2048×2048；既有实现限制为“待修图 + 至多 2 张真值图”。 | 保持兼容与基线回归，不扩大现有授权范围。现有代码把真值图放前、待修 AI 模特主图放最后，以避免旧模型把真值板主导为画幅。 | 旧实测曾出现从全身模特漂移到裤装特写；不把单次返回视为可交付。 |
| Qwen 3.0 Pro（`qwen-image-3.0-pro`） | 同一模型 ID 支持生成与编辑；编辑 `messages` 中 1--3 图、单图 ≤10MB、建议各边 384--3072px；输出 PNG；`n=1..6`；`size` 总像素 512²--2048²、宽高比 1:8--8:1；支持 `negative_prompt`、`prompt_extend`、`watermark`、`seed`。 | 无 BBox 的单一服装局部（颜色、版型、接缝、褶皱、图案视觉修复）或短文本/贴花的**候选图生成**；默认 `n=1`、`prompt_extend=false`、`watermark=false`、显式 2K 内 `size`。 | **无原生 4K 编辑**；官方文档未给出 Mask/BBox 参数，不假设支持；不能保证商标字形、贴花、胶印或非目标区域逐像素不变。 |
| Qwen 3.0（`qwen-image-3.0`） | 与 Pro 同为编辑/生成、1--3 输入与最高 2048×2048输出；官方定位为质量与速度平衡。 | 仅在同一盲审集证明其“结构/Logo/人物/背景”结果不低于 Pro 且成本门批准后，作为可选对照或降本路线。 | 同样不支持原生 4K 编辑、没有官方 Mask/BBox 支持证据；不能以“更快”替代可交付验证。 |
| Wan 2.7 Image Pro（`wan2.7-image-pro`） | 编辑可传 1--9 图（0 图为文生图）；JPEG/JPG/无透明 PNG/BMP/WEBP，单图 ≤20MB、边长 240--8000px、比 1:8--8:1；编辑 `1K/2K` 或自定义至 2048²；`n=1..4`；`bbox_list` 与每张图一一对应，单图最多 2 框，使用原图绝对像素 `[x1,y1,x2,y2]`。 | 人工框定 Logo、贴花、胶印、口袋、领口、袖口、衣物破损等局部。第一版仅主图加至多 2 张明确编号的真值参考；目标 AI 模特图必须是最后一张以保持其输出画幅；框只加在目标图。 | **4K 仅无图、非组图文生图；带图编辑最高 2K。**BBox 不是 Mask、分割图或“只改框内”保证；不得把其用于未经授权的人脸身份替换。 |
| Wan 2.7 Image（`wan2.7-image`） | 与 Pro 的 0--9 图和 BBox 交互结构相同，但所有场景最高 2K。 | 只作 Pro 的受控成本/速度对照，不作为默认上线模型。 | 同样没有原生 4K 编辑或 Mask 参数。 |

Qwen 输入/参数依据：[千问图像编辑](https://help.aliyun.com/zh/model-studio/qwen-image-edit-guide)；Wan 输入、尺寸与 BBox 限制依据：[万相图像编辑](https://help.aliyun.com/zh/model-studio/wan-image-edit)。表中“推荐用法”是工程路由假设，须经标注盲审验证，不是官方效果保证。

## 请求输入顺序、尺寸与 BBox

### Qwen 3.0 Pro / Standard

* `content` 固定为：**图1 = 待修 AI 模特/商品候选主图**；图2--图3 = 用户本次明确选择的商品真值参考；最后一条 `text` 显式按“图1/图2/图3”引用。Qwen 官方规定多图顺序即图号，且只接受 1--3 图；与当前 Edit Max 的“主图最后”顺序不可混用。
* 根据图1长宽比计算显式 `size`，总像素不超过 `2048*2048` 且比值在 1:8--8:1；先用 `2K` 上限作为候选，再由既有本机 4K 尺寸交付生成最终文件。不得依赖模型自动推荐尺寸来维持构图。
* 单图在服务端预检为 ≤10MB，并保留原始 SHA-256、尺寸、MIME、图号与提交顺序。可接受格式以官方接口为准；产品第一版继续仅 JPEG/PNG/WebP，避免扩大浏览器/上传面。
* 不传未经官方文档支持的 `bbox_list` 或 `mask`。若诊断只有“局部”但没有人工确认的目标区域，先 `BLOCKED` 或改走现有人工修复，不把自然语言定位伪装成精确遮罩。

### Wan 2.7 Pro

* `content` 固定为：图1..图N-1 = 本次选择的真值/纹理/Logo参考；**图N = 待修 AI 模特/商品候选主图**；最后文本精确引用图号。该顺序既保留当前 Edit Max 的“候选主图最后”的画幅策略，也符合 Wan 官方“多图以数组顺序编号、带图时输出比例跟随最后一张输入”的规则。
* 第一版仍限制“主图 + 至多 2 张真值参考”（共 3 图），即使 Wan API 可接受 9 张；9 图仅在新增“每张参考的用途、授权、优先级、编号”字段及专项测试后开放，避免参考相互冲突造成衣物/人物漂移。
* 主图的人工 BBox 放在 `bbox_list` 最后一个位置，前面参考图均为 `[]`；每张最多 2 个框，坐标必须为主图原始像素绝对值，`0 <= x1 < x2 <= width`、`0 <= y1 < y2 <= height`。拖拽框时应直接从浏览器图像的显示坐标反算原图坐标，并保存框、原尺寸、缩放比与人工确认时间。
* `size="2K"`、`n=1`、`watermark=false`。不要发送 `negative_prompt` 或 `prompt_extend`：官方文档说明 Wan 2.7 不支持这些参数；排除项写入正向文本（“不要改变……”）。不要将 `4K` 用于带图任务。

## Prompt 策略

所有路线使用本地确定性模板，而不是让 Provider 扩写需求；模型只接收最小必要图像与结构化诊断，不能自行扩展为营销信息或未授权商品细节。

1. 先声明“图N/图1 是唯一待修主图”；分别声明参考图只用于核对哪些 SKU 事实（颜色、版型、口袋、面料、图案，或官方 Logo 资产），不得借用背景、镜头、人物或构图。
2. 只描述一个诊断结论和一个可验收的局部动作，例如“仅修正左胸框内贴花的颜色和轮廓，使其与图2核对一致”；对于 Wan 再写“仅在图N第1个框的区域内执行该动作”。
3. 锁定属性：人物身份、五官/发型、姿势、手脚、镜头、构图、画幅、背景、光线、衣物其他结构、非目标纹理不变；禁止商品白底化、局部裁切、无人物、替换品类、加入促销文字/价格/折扣/未提供品牌信息。
4. Qwen 3.0：`prompt_extend=false`；用 `negative_prompt` 只承载可观察的反向项（裁切、额外肢体、错误文字、背景替换等）。Wan 2.7：将同样的禁止项放在正向文本，因其不支持 `negative_prompt`。
5. Logo/字标：生成模型只能给出候选，不能作为权威文字/商标重绘路径。对于需要精确 Logo、贴花或胶印的订单，优先要求官方可用资产并用确定性后处理；模型输出必须经放大人工核对、非目标区漂移检测和品牌/授权 Gate。

## 付费、重试与授权 Gate

沿用并扩展当前六项 Gate：`API_KEY_CONFIGURED`、`WORKSPACE_CONFIGURED`、`PROVIDER_APPROVED`、`PAID_CALL_APPROVED`、`MODEL_DRAFT_AND_PRODUCT_REFERENCES` 数据范围批准、`MODEL_SNAPSHOT_LOCKED`。新增：`PER_SEND_CONSENT`、`HUMAN_BBOX_CONFIRMED`（Wan BBox 路由）、`SKU_TRUTH_AND_LOGO_RIGHTS_CONFIRMED`、`BUDGET_REMAINING`、`NO_CONCURRENT_DUPLICATE_JOB`、`HUMAN_FINAL_REVIEW_REQUIRED`；任一缺失均须在读取上传图片和网络派发前返回 403/本地阻断。

* 每次请求固定 `n=1`、并发 1、用户逐次确认；禁用“自动再试”。阿里云计费按输入图与成功生成的输出图计费；请求失败通常不计费，但超时/客户端中断后是否已派发必须以 Provider Request ID 和模型监控/账单证据确认，不能假定免费。官方价格与免费额度会变动，运行时应只显示已审批预算，价格页只作复核：[模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)。
* 可保留“人工重新提交”而非自动重试：429/5xx/网络中断进入 `RETRY_REQUIRES_USER_CONFIRMATION`，显示是否已获得请求 ID、是否已下载结果、已派发计数和预算占用状态。429 不自动重发；重复请求可能产生第二次费用。
* 保存非敏感审计字段：provider/model/region、请求 UUID、Provider Request ID/task ID、图号与 SHA-256、尺寸、BBox、参数、发起/结束时间、输出 SHA-256、下载状态、人工复验结果与失败码。绝不保存 Key、带签名的临时 URL 或原始 Base64 到日志。
* 结果临时 URL 应立即下载至本机项目；按官方文档其有效期为 24 小时。当前 `*.aliyuncs.com` 规则可覆盖官方动态 OSS 域名，但应保留 HTTPS、响应 MIME/大小校验、禁止重定向、下载后剥离 URL 的限制。

## 现有实现审查与需修改文件

当前 `web/lib/visionqa/providers/qwen-image-edit.ts` 已具备 10MB 单图、主图最后、最多 2 参考、`n=1`、`prompt_extend=false`、`watermark=false`、临时结果下载与六项授权 Gate。`web/app/api/repair-jobs/route.ts` 在解析表单前执行 `liveReady` Gate，符合“未授权不读图”的失败关闭要求。当前 `RepairProviderCapability`、`RepairProviderJobSnapshot` 和 REST 响应却把 Provider、模型、输入数量、2K 上限写死为旧 Qwen Edit Max，不能直接复用为多 Provider 路由。

按以下顺序实施；以下均为建议修改，**本报告不修改这些文件**：

1. `web/lib/visionqa/repair-provider-contract.ts`：把单一 Qwen 常量改为有版本的 Provider registry 类型；给 capability/job 增加 `routeId`、`inputImageLimit`、`inputImageCount`、`outputSize`、`bboxList`、`requestParameters`、`providerTaskId`、`dispatchAttempt` 和 `retryRequiresFreshConsent`。维护旧 `qwen-image-edit-max-2026-01-16` 反序列化兼容。
2. `web/lib/visionqa/providers/qwen-image-edit.ts`：不改旧 Provider 的请求语义；抽出共享的 Base64、HTTPS 临时 URL 下载、输出 MIME/字节与审计方法，作为后续 Qwen3/Wan 公用底座。修正任何新 Provider 的 usage 映射：Qwen 3 官方示例为 `output_width`、`output_height`、`output_image_count`，不能沿用现有 `width`/`height` 猜测字段。
3. 新增 `web/lib/visionqa/providers/qwen-image-3.ts`：固定仅允许 `qwen-image-3.0-pro` 或 `qwen-image-3.0`（每个 route 仍锁定一个 ID）；实现 1--3 图的“主图第一”请求、2K 显式 size、`negative_prompt`、无 BBox/Mask，以及和旧 Provider 等价的六项 Gate 与“手动重试”状态。
4. 新增 `web/lib/visionqa/providers/wan2-7-image.ts`：固定 `wan2.7-image-pro`（`wan2.7-image` 作为显式试验 route）；实现主图最后、第一版总 3 图上限、2K、`bbox_list` 完整长度校验、每图最多 2 框、绝对坐标边界校验与同步/异步任务状态适配。禁止发送 Qwen 专属 `negative_prompt`/`prompt_extend`。
5. `web/app/api/repair-jobs/route.ts` 与 `web/lib/visionqa/repair-provider-client.ts`：根据经过 Gate 的 `routeId` 分派而非默认旧 Qwen；在 `FormData`/字节读取前完成所有非图像 Gate，在图像读取后但网络前完成 SHA、尺寸、序号、BBox、总数/总大小与 `size` 预检；对 Wan 异步返回保留 task ID 和后续轮询，不以 HTTP 202/任务创建当作“修正成功”。
6. `web/app/workspace-repair.tsx`：Provider 选择仅展示已批准 route；为 Wan 显示人工画框与原图像素复核，为 Qwen 显示“无精确选区能力”；任何切换 Provider、变更参考图/框/Prompt/尺寸都清空本次同意并重建 job。界面明确“2K 模型候选 + 本机 4K 尺寸交付”，而非“4K AI 修图”。
7. `web/lib/visionqa/agents/repair-orchestrator.ts`、`web/contracts/repair-job-v0.1.schema.json`、`web/contracts/repair-case-v0.1.schema.json`、`web/app/workspace.tsx`：让 repair case 记录实际 route、参数、BBox 与输出来源，且继续要求 `REPAIR_OUTPUT_MAJOR_DRIFT` 失败关闭和四项人工复验；schema `provider` 枚举需增加明确 Provider ID 或 `routeId`，不可用模糊的 `qwen-image` 泛称掩盖模型版本。
8. `web/tests/qwen-image-edit-provider.test.ts`、`web/tests/repair-orchestrator.test.ts`、`web/tests/rendered-html.test.mjs`：保留旧回归测试并新增以下清单。

## 测试与验收清单（全部使用 mock/fake fetch，不产生模型费用）

- Qwen 3 请求只接受 1--3 图、单图 ≤10MB、主图为图1、显式 2K 内 size、`n=1`、`prompt_extend=false`、`watermark=false`；4K、Mask、BBox 和第四图均在网络前拒绝。
- Wan 请求接受第一版 1 主图 + 0--2 参考，主图最后；单图 ≤20MB、原始尺寸/比率合法；`bbox_list.length === imageCount`，主图最多 2 框、坐标严格在原图边界内、参考无框；4K 带图编辑和 Qwen 参数均在网络前拒绝。
- 逐模型 fake fetch 断言：不满足每一项授权 Gate、预算 Gate、逐次 consent、SKU/Logo 权利或 BBox 人工确认时 `fetch` 调用数为 0；环境中没有输出 Key。
- 返回解析：Qwen 的 `output_width/output_height/output_image_count`；Wan 同步 image URL 与异步 task ID/SUCCEEDED/FAILED；非 2xx、429、5xx、空 URL、非 HTTPS/非阿里云 OSS 输出、错误 MIME、过大结果、下载失败全部失败关闭。
- 重试：429、网络错误、超时后不自动派发第二次；新发送需要 fresh consent、预算重新核对与唯一 job ID。模拟“请求已派发但响应丢失”时状态为费用待核验，不触发重试。
- UI：390px/桌面画框坐标映射、Provider 切换清除 consent、明示 2K/本机 4K 边界；前后对比能显示失败输出，但 `REPAIR_OUTPUT_MAJOR_DRIFT` 不能进入交付。
- 质量评测（获得单独调用授权后）：固定同一批已获授权的服饰 SKU、诊断标签、盲审规则与预算，分别报告结构、Logo/贴花/胶印、人物、背景、非目标漂移、可交付率和人工返工率；结果按 Provider/模型/Prompt/尺寸/BBox 分层。没有足够人工标签与真实样本时，只报告“工程可运行”，不报告模型有效或客户价值。

## 仍未知且必须后续验证的项目

1. 北京业务空间是否已开通 `qwen-image-3.0-pro`、`qwen-image-3.0`、`wan2.7-image-pro`；阿里云官方指向控制台按地域查看，且文档中部分页面标注 Qwen 3 Pro 为邀测，不能由代码或当前历史模型 ID 推断可用。
2. 对应地域 API Key、业务空间专属 endpoint、付费权限、免费额度、限流配额和当前价格；北京与新加坡 Key/端点不可混用。此项需主 Agent 获授权后在控制台最小验证，不能在本次研究中登录或调用。
3. Qwen 3.0 的固定 dated snapshot/弃用策略与账户实际可选 ID；在官方目录未提供可锁定快照前，不能假装已具备生产级不可变模型版本。
4. Qwen 3/Wan 2.7 对真实服装材质、微小 Logo、贴花、胶印、手部、人物身份与背景锁定的有效性；必须通过上述授权小样本盲审，不能从官方能力描述推导。
5. Wan BBox 的实际局部保真度、框过小/跨衣物边界时的漂移率，以及异步任务取消/超时后的计费与状态语义；均需要经授权的最小真实调用和模型监控/账单证据。

## 官方事实来源

* [阿里云：图片生成与编辑模型选择和最大分辨率](https://help.aliyun.com/zh/model-studio/image-model)
* [阿里云：千问图像编辑输入顺序、1--3 图、10MB、参数与 2K size](https://help.aliyun.com/zh/model-studio/qwen-image-edit-guide)
* [阿里云：万相图像编辑输入规格、2K 编辑、异步任务与临时 URL](https://help.aliyun.com/zh/model-studio/wan-image-edit)
* [阿里云：万相 2.7 API、4K 仅文生图与交互式 BBox 请求格式](https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference)
* [阿里云：图像模型计费规则与当前价格页](https://help.aliyun.com/zh/model-studio/model-pricing)
* [阿里云：模型限流](https://help.aliyun.com/zh/model-studio/rate-limit)
