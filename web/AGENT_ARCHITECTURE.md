# VisionQA 智能体架构 v0.2

> 状态：L2 领域智能体运行框架与千问百炼营销 Provider 适配层已实现；当前运行仍使用非模型测试 Provider，外部调用尚未授权启用。

## L2 运行循环

`Provider 决策 → 白名单工具调用 → 结构化观察 → 下一步决策 → 证据审计 → 明确停止 → 人工终审`

- 最大 6 步，避免无限自主循环。
- 白名单工具仅包含事实账本、商品表达、受控草案生成和证据审计。
- 越权工具、Provider 超时、未生成草案即结束、超过最大步数全部失败关闭。
- 当前 `visionqa-local-l2-test-provider` 按固定序列验证运行机制，`model_inference_used=false`，不能作为真实模型质量证据。
- 首选外部 Provider 已确定为阿里云百炼千问，固定模型快照为 `qwen3.7-plus-2026-05-26`；适配器不会改变业务工具和审计 Gate。
- 千问适配器仅发送目标与结构化观察，关闭联网搜索和并行工具调用；Key 只允许进入服务端 Authorization Header。

## 目标

营销内容不能从一张图直接自由发挥。当前链路先建立可追溯事实账本，再让角色按职责生成和审计内容：

`用户输入 / 质量证据 / 商品表达契约 → 事实守门 → 表达评审 → 营销生成 → 证据审计 → 人工终审`

## 当前四个角色

1. `fact-guard` 商品事实守门员：只登记用户输入、评审证据、契约结果和系统边界。
2. `expression-reviewer` 商品表达评审员：读取 `product-expression-v0.1`，旧版结果只允许诚实投影。
3. `marketing-strategist` 营销策略生成员：生成痛点、平台文案、逐字稿与视频提示词，每项附证据编号。
4. `evidence-auditor` 证据审计员：拦截折扣、库存、销量、评价、材质、功效等无来源事实型承诺。

当前不是“多个聊天框扮演角色”，而是有固定输入输出契约、受限工具、观察轨迹和失败关闭规则的领域运行时。确定性工具位于 `lib/visionqa/agents/local-orchestrator.ts`，L2 循环位于 `lib/visionqa/agents/l2-runtime.ts`，接口为 `GET/POST /api/agent-runs`。POST 仅在六项千问 Gate 同时满足时切换到千问，否则继续本地测试 Provider。

## 运行边界

- `L2_RUNTIME_TEST_PROVIDER_NO_NETWORK`：不联网、不上传图片、不调用付费模型，测试 Provider 不是模型。
- `aliyun-bailian-marketing-agent`：软件适配完成，但需 API Key、启用批准、付费调用、`STRUCTURED_FACTS_ONLY` 数据范围、固定模型与 6 次调用上限六项同时成立才可实例化。
- 输出状态只有 `READY_FOR_HUMAN_REVIEW / NEEDS_INPUT / BLOCKED_UNSUPPORTED_CLAIM`。
- 所有输出继续要求人工终审；不启用自动发布和自动放行。
- 缺少目标人群、场景或购买关注因素时，营销生成角色失败关闭。
- 商品材质、尺码、价格、库存、销量、促销和用户评价未进入已核验事实账本时，不得作为卖点。

## 接入真实模型前需要的用户授权

1. API Key 的创建、保存与启用。
2. 可能产生费用的模型供应商与预算范围。
3. 首次启用时一并记录允许发送的数据类型；之后在该范围内常规运行不重复确认。

改图模型（Seedream、千问、GPT Image）沿用单独授权，不与营销文本智能体共享默认权限。
