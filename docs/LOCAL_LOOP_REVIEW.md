# LOCAL LOOP REVIEW — localhost:6300

审查日期：2026-09-16  
审查者：独立客户视角（只读代码审核；本轮未操作浏览器、未调用云端模型）  
范围：本地 `localhost:6300` 的单商品 Mock 对话闭环，以及与真实 Beta 资产/额度/Provider 路由的边界。

## 先给结论：当前验收 verdict

**PARTIAL / ACCEPT FOR INTERACTION LEARNING ONLY**。

本地 Mock 可以用于验收“商品上下文 → 添加图片 → 预设筛查 → 选择 → 预设修正 → 版本对比 → 模拟人工确认 → 下载记录 → 刷新恢复”的交互秩序。它不能证明图片真的被上传到服务端、筛查或修图模型有效、输出图片已生成、租户隔离/真实钱包扣款正确、客户愿意付款。

### 立即阻断（CRITICAL）

1. **UI 演示不是真实交付。** `app/agent/mock-workspace.tsx:56-70` 用 `FileReader.readAsDataURL` 把文件读入浏览器；`lib/agent/mock-port.ts:4-6,13-47` 使用 IndexedDB。`app/agent/mock-workspace.tsx:79-84` 下载的是 `VisionQA-MOCK-V*.json`，并且 `lib/agent/mock-contract.ts:63-83` 明确复用原图 URL、像素未修改。因此不能向客户展示为“已上传/已修图/可下载成品”。
2. **Agent API 有 fake fallback 风险。** `app/api/agent-runs/route.ts:26-32` 在 Qwen 未 `live_ready` 时自动使用 `createLocalL2TestProvider()`，并返回 HTTP 成功；真实与测试仅在 `X-VisionQA-Agent-Mode` header 区分。任何只看 JSON/200 的前端或验收记录都可能把假结果当真。当前必须把该接口标记为测试 Provider，不能当模型效果证据。
3. **真实链路未在本轮验收。** 真实上传/下载要求 Beta 会话并走 `app/api/assets/upload-intent/route.ts:5-23`、`app/api/assets/[id]/route.ts:35-41`；真实修图要求 `app/api/repair-attempts/route.ts:98-224` 的 Provider 与额度流程。Mock cookie 只用于本地导航，`app/api/local-agent/mock-session/route.ts:5-12` 注释明确不被真实 account/asset/model API 接受。未获得真实会话、数据库和授权时，不得声称这些已闭环。

### 重要安全/费用边界

- `lib/visionqa/agents/qwen-marketing-provider.ts:38-60` 要求 API Key、Provider 批准、付费开关、数据范围、模型快照、调用上限同时满足；`app/api/agent-runs/route.ts:27-29` 才选择 Provider。测试时保持 `live_ready=false`，不得设置付费或数据发送开关。
- `lib/beta/payment.ts:12-20` 默认支付 provider 为 `disabled`；本地 `test` 支付只应被视为开发测试，不是真实订单。
- `lib/beta/asset-urls.ts:19-32` 使用签名下载 URL；默认开发签名 secret 只可本地使用，生产必须显式配置，禁止出现在前端、日志或文档。审查未读取任何密钥值。
- `lib/agent/mock-port.ts:4` 与 `app/agent/mock-workspace.tsx:98` 均声明 Mock 与真实账户、资产、钱包、Provider 隔离；因此 Mock 的“刷新恢复”只证明浏览器 IndexedDB 恢复，不证明服务端持久化。

## `SIMULATED` 客户发现（不是访谈、不是报价证据）

### Target segment

- `HYPOTHESIS`：有固定服饰 SKU、需要批量生成商品图、且返工成本高的电商内容团队。
- `HYPOTHESIS`：紧急触发可能是交付前发现商品细节漂移或版本返工。
- `HYPOTHESIS`：使用者是设计/运营，付款或数据授权由负责人决定。

### 模拟问题与响应

- `SIMULATION`：客户可能先问“这张图是否真的上传、修正版在哪里、能否下载原尺寸”，因为当前 Mock 只能证明交互。
- `SIMULATION`：客户可能拒绝把未确认素材发送到外部模型，并要求可追溯的版本和人工确认。
- `SIMULATION`：客户不会因模拟页面、模拟额度或模拟结果提供真实付费承诺。

### 下一轮真实验证问题

- `NEXT QUESTION`：最近一次商品图返工发生在什么流程节点？谁发现、花了多久、如何记录？
- `NEXT QUESTION`：过去一批中有多少图需要人工复核或重做？现有工具/人工方案的实际成本是什么？
- `NEXT QUESTION`：若真实上传、输出可下载、版本和人工 Gate 均可追溯，谁能批准试用或付款？需要看到什么证据？

### 产品调整

- `KEEP`：商品上下文、版本来源链、人工确认和失败恢复的交互结构。
- `CHANGE NOW`：任何非 Mock 流程必须在页面首屏、结果和下载处显示真实/测试模式；测试 Provider 输出不得仅靠 header 区分。
- `TEST NEXT`：用一个获授权真实 SKU 验证上传、筛查、单次修图、签名下载和人工终审的完整链路。
- `DEFER`：公开账号、自动放行、支付生产接入、全量爬虫和模型训练。

## 客户验收清单（localhost:6300）

前置：确认只使用本地、非敏感测试图片；保持真实模型/付费开关关闭；每项记录“PASS / FAIL / NOT RUN”和证据文件名。**本轮代码审查未执行浏览器项，均为待现场复现。**

| 场景 | 操作 | 必须观察 | 当前边界 |
|---|---|---|---|
| 正常 Mock | `/login` → “直接体验 Mock” → 建商品 → 载入示例 → 模拟筛查 → 选图 → 确认模拟版本 → 勾选三项确认 → 下载 | 每步有 MOCK 文案；下载名含 `MOCK`；不得出现“真实修正版” | PASS（代码）；浏览器 NOT RUN |
| 自行上传 Mock | 选 1 参考 + 1 待检查图片 | 页面提示不会上传；刷新后仍在同一浏览器 | 只能证明本地读取/IndexedDB，非服务端上传 |
| 失败恢复 | 在修正阶段点击“模拟一次连接失败”，再重试 | 显示失败；版本数不增加；提示保留要求；不扣真实额度 | `mock-contract.ts:73-83`；浏览器 NOT RUN |
| 刷新恢复 | 在 intake、screened、delivered 各阶段刷新 | 商品、素材、版本和阶段恢复；Mock 标记仍在 | 仅浏览器本地状态，不是服务端恢复 |
| 多轮版本 | 交付后“以此版本继续修改”和“回到原图”各做一轮 | 版本号递增；母版来源正确；原图和旧版本保留 | 输出仍复用原像素，不能验收质量 |
| 租户/越权（真实链路待做） | 用两个真实 Beta tenant 尝试读取对方 project/asset/download URL | 401/403 或空结果；签名 URL 过期/改 tenant 失败 | Mock cookie 不覆盖此项；NOT RUN |
| 真实上传/下载（真实链路待做） | Beta 登录 → upload intent → PUT asset → signed download | 服务端 asset、字节/类型/尺寸校验、可下载原图/输出 | Mock 不执行；NOT RUN |
| 费用安全 | 未满足 Gate 时调用 agent/repair API | 付费 Provider 不发送图片；明确 blocked；不扣钱包 | 保持开关关闭；NOT RUN |
| 额度失败/释放（真实链路待做） | 余额不足、Provider 失败、重复 idempotency key | 不超扣；失败释放 hold；重复请求不重复调用 | 单元契约存在，真实持久化 NOT RUN |
| 泄密检查 | 查看前端 bundle、Network、日志、下载内容 | 无 API Key、Prompt、图片字节或跨 tenant URL 泄露 | 代码只读检查；浏览器 Network NOT RUN |
| fake 当真 | 检查页面、JSON、header、报告文案 | `MOCK_ONLY`/`NO_NETWORK` 明显；不得把测试响应标成模型结论 | `agent-runs` 仍有自动 fallback 风险 |

## 最短可复现流程（不触发云端）

```powershell
cd D:\VisionQA\web
npm install
npm run dev -- --port 6300
```

打开 `http://localhost:6300/login`，选择“直接体验 Mock”；建立一个商品，点击“载入示例图片，体验完整流程”，按页面顺序完成筛查、选图、模拟修正、三项模拟人工确认并下载记录。然后刷新页面，检查状态仍存在；再次进入修正阶段点击模拟失败，确认不产生新版本后再重试。

停止条件：不要打开“真实模型分析”、不要设置任何付费/数据处理批准开关、不要把客户原图用于本地以外的请求。清理只限用户明确授权后删除浏览器站点数据或 Git 忽略的 `web/work/local-agent-state`，本轮不自动删除。

## 证据与声明矩阵

| 声明 | 证据 | 强度 | 结论 |
|---|---|---|---|
| Mock 交互可复现 | `mock-contract.ts`、`mock-port.ts`、`mock-workspace.tsx` | 部分（代码） | 可作为交互学习；浏览器复现待做 |
| 图片已上传/可下载成品 | Mock Data URL + JSON 下载代码 | 反证 | 不支持；CRITICAL 边界 |
| 模型有效或筛查准确 | 预设 `i % 3` 标签（`mock-contract.ts:63-66`） | 反证 | 不支持 |
| 真实 Provider 有治理 Gate | `qwen-marketing-provider.ts:38-60`、`repair-attempts/route.ts:165-224` | 契约级 | 真实调用 NOT RUN |
| 租户/额度/签名下载安全 | Beta routes/repositories/tests | 部分 | 必须以真实会话/数据库 E2E 复验 |
| 客户愿意付款 | 只有本节 SIMULATED 假设 | 无 | 未验证，不能报价或宣称需求成立 |

## 独立复审要求

复审者应从干净浏览器状态复现一次正常 Mock、一次失败恢复和一次刷新；逐项确认 MOCK/NO_NETWORK 文案；检查下载文件确为 JSON 而非修正版图片。若要放行真实服务，另行取得用户对账号、授权、图片发送和费用的明确批准，并补跑真实上传/下载、跨租户访问、余额不足、Provider 超时、重复请求和日志/Network 泄密检查。最终 verdict 只能是 `accept for learning`、`accept with conditions` 或 `reject and revise`，不能把 Mock 结果升级成模型或商业证据。
