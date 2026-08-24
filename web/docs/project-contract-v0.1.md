# VisionQA Project 契约 v0.1

状态：本地原型已实现

契约：`visionqa-project-v0.1`

工作台负载：`visionqa-workspace-project-payload-v0.1`

机器可读 Schema：[`../contracts/visionqa-project-v0.1.schema.json`](../contracts/visionqa-project-v0.1.schema.json)

## 目标

把工作台中的一次 SKU 任务从 React 临时状态提升为可保存、可恢复、可追溯的业务对象。Project 是以下内容的共同主键：

1. 商品基准：SKU 链接、历史确认图、目标人群和使用场景；
2. 待评审批次：候选文件、渠道、图位和 AI 生图确认；
3. 质量评审：模型结果、失败状态和人工终审记录；
4. 改图复审：当前阶段仍使用已有原型状态，后续版本再纳入独立 Repair Version；
5. 营销交付：当前阶段沿用既有交付契约，不新增生成能力；
6. 项目事件：建立、恢复、阶段变化、素材变化和一般内容更新。

## Project 记录

| 字段 | 说明 |
|---|---|
| `projectId` | 本机生成的稳定项目标识 |
| `projectName` | 当前项目名称 |
| `scenario` | 固定为服饰电商 AI 模特商品图场景 |
| `storageMode` | 当前固定为 `LOCAL_INDEXED_DB` |
| `revision` | 每次持久化内容更新递增；初始版本为 1 |
| `stage` | `overview / baseline / intake / review / repair / delivery` |
| `payload` | 版本化工作台状态，不包含对象 URL 和上传授权勾选状态 |
| `materialCounts` | 基准图、候选图、评估完成数和人工记录数 |
| `createdAt / updatedAt` | ISO 8601 时间 |

## 本机存储

IndexedDB 数据库 `visionqa-project-store` 包含三个对象仓库：

- `projects`：Project 主记录与最新内容版本；
- `assets`：当前项目工作集中的原始 `File`，区分商品真值、AI 模特草图、改图输出和 4K 输出；
- `events`：只追加的项目事件，使用项目内连续序号。

图片不会因为项目自动保存而发送到 VisionQA 服务端或第三方模型。当前存储只属于同一设备、同一浏览器、同一站点来源；清除站点数据会清除项目。

## 保存与恢复规则

- 第一次进入内部预览时读取最近更新的本机项目；不存在时建立新项目；
- 内容变化后 800ms 防抖自动保存；
- 保存使用 `expectedRevision` 乐观并发检查，避免另一个标签页静默覆盖新版本；
- 刷新后从 `projects + assets` 恢复工作状态，并重新创建仅当前会话有效的对象 URL；
- `running / processing / live-loading` 等瞬时状态不会原样恢复，而会回到可安全重试的稳定状态；
- 阿里云发送授权 `liveConsent` 永不持久化，刷新后必须重新确认；
- 改图输出、人工漂移复验项、4K 输出和处理凭证随 Project 恢复；
- 项目事件记录恢复与内容修改，但不把技术失败写成业务质量结论。

## 当前边界

- 当前只恢复最近一个本机项目，还没有项目列表、归档、导入或导出；
- 仍保留测试登录界面，不建立用户、租户或跨设备身份；
- 不把 IndexedDB 成功等同于云端备份；
- 不宣称已有模型准确率、客户采用、付款或商业效果证据；
- 真实登录启用后，保持 Project 契约不变，新增带租户身份的服务端 Repository 适配器，并执行明确的本机迁移流程。

## 进入真实登录的触发条件

出现以下任一业务需求时，应从本机 Repository 升级为服务端持久化：跨设备继续、多人协作、客户数据隔离、评审员身份签名、云备份恢复、付费交付或正式留存策略。该升级需要用户确认身份方案、数据范围和部署成本。
