# VisionQA 递归修正架构 v0.1

日期：2026-09-01
状态：工程底座已实现；真实 DeepSeek 调度与新增百炼路线尚未启用。

## 第一性原理

VisionQA 的目标不是“让多个模型聊天”，而是让客户更稳定地得到可采用的服饰商品图。模型对话只是可解释的过程投影；商品真值、客户确认、服务端 Gate、额度账本与最终人工复验才是裁决依据。

递归单位固定为一次 `RepairEvolutionEpisode`：读取已验证证据 → 规划白名单路线 → 执行一次 → Gate/人工反馈 → 有新证据才进入下一轮。最多 3 轮；没有新证据、路线未授权或达到上限即停止，不重复付费碰运气。

## 模型分工

- `deepseek-v4-flash`：总调度与策略反思。只接收结构化事实，不接收客户原图；只能从服务端提供的路线白名单中选择，不得改 Gate、额度、权限或经验库。
- `qwen-image-3.0-pro`：当前已实现的高质量图像编辑执行器。
- `wan2.7-image-pro`：候选路线。官方说明支持边界框交互编辑与多图参考，适合定向局部修正；接入前必须完成独立 Provider、成本与漂移回归。
- `qwen-image-edit-max-2026-01-16`：候选高质量专用编辑路线。
- `qwen-image-edit-plus-2025-10-30`：候选成本优先路线。

模型注册表只描述能力，`CANDIDATE` 不等于可调用。生产调用仍需要 API Key、Provider、付费、数据范围、固定模型和预算全部通过服务端 Gate。

## 经验写回

成功经验只有同时满足以下条件才能晋升：基础 Gate 通过、人工确认、客户接受或下载、至少一项可追溯证据。失败轨迹进入独立失败模式库，不能作为“成功范例”。客户纠正优先于模型判断，但不能覆盖不可变 SKU 真值与安全规则。

## 前端事件边界

客户只看到角色标签、公开摘要、状态、轮次和下一步；不得显示隐藏思维链、Prompt、模型名、Provider、请求 ID、原始响应或内部错误码。开发者版可查看结构化审计，但同样不保存 Key、图片内容、临时 URL或原始 Provider payload。

## 当前实现

- `web/lib/visionqa/agents/recursive-repair.ts`
- `web/lib/visionqa/agents/repair-model-registry.ts`
- `web/lib/visionqa/agents/deepseek-repair-planner.ts`
- `web/lib/visionqa/agents/repair-planning-service.ts`
- `GET /api/projects/:id` 新增 `agent_events`

真实调度启用前需要轮换已在聊天中出现的 Key，并通过服务端 Secret 设置以下非公开变量：`VISIONQA_ORCHESTRATOR_DEEPSEEK_API_KEY`、`VISIONQA_ORCHESTRATOR_DEEPSEEK_APPROVED`、`VISIONQA_ORCHESTRATOR_DEEPSEEK_PAID_CALLS_APPROVED`、`VISIONQA_ORCHESTRATOR_DEEPSEEK_DATA_SCOPE=STRUCTURED_REPAIR_FACTS_NO_IMAGES`、`VISIONQA_ORCHESTRATOR_DEEPSEEK_MODEL=deepseek-v4-flash`。
