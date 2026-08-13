# 枪王素材真实 Qwen 调用 Gate 检查

检查日期：2026-07-31

## 检查结果

| Gate | 结果 |
|---|---|
| 固定模型 | PASS：`qwen3-vl-plus-2025-12-19` |
| Key 配置存在性 | PASS（仅检查存在，不读取/输出值） |
| 本地 canary readiness | PASS：模型/Key/运行参数可识别 |
| 并发 | PASS：1 |
| 本地代码请求上限 | PASS：5（不超过用户授权的 15） |
| 预算 | PASS：CNY 2000 minor units（¥20） |
| `QWEN_PROVIDER_APPROVED=true` | FAIL：未显式批准 |
| 私有短期 URL / store:false / ZDR 组合 | FAIL：当前 local-canary 代码使用受控 Base64 直传，不能证明该组合 |

## 首轮执行记录

用户确认三项 canary 范围后，已通过本地 staging UI 串行发送 5 张候选：

- 请求数：5（并发 1）
- HTTP 200：1
- HTTP 502：3（结果未通过本地结构/规则校验）
- HTTP 413：1（载荷过大）
- API Key：只由本地 `.env.local` 读取，未输出、未复制、未写入响应
- 图片整批上传：否

唯一可用响应保存于 `live_results_v0.1/response_02.json`，其余响应只保留脱敏错误信息；当前不把它们计为校准真值。

## 当前结论

真实 canary 已经跑起来，但这是 staging UI 的 Base64 试跑，不是已完成合规闭环的生产传输。`QWEN_PROVIDER_APPROVED` 与私有短期 URL/ZDR 证据仍然不能宣称已满足，因此未继续追加请求。

## 本地工程收口

- 生产 Qwen adapter 已有 private-image envelope、HTTPS allowlist、`access=short_lived_private` 和最长 15 分钟 TTL 的 fetch 前校验。
- 新增 `data-processing-contract.ts`，把 `store:false`、ZDR/不训练、删除 SLA、人工终审写成显式证据旗标；任一缺失都会在 fetch 前 `CONFIGURATION` fail-closed。
- 新增契约测试覆盖四个旗标逐项缺失；未发送任何请求。
- `npm test` 通过 build + 69 项测试（9 渲染/契约 + 60 TypeScript）；`npm run lint` 通过，0 errors/0 warnings。
- 百炼官方兼容接口文档确认视觉输入支持文件 URL 或 Base64；当前代码只把私有 URL 作为生产路径，未自行声称官方 API 存在可验证的 `store:false` 参数。参见[百炼 OpenAI 兼容多模态输入说明](https://help.aliyun.com/zh/model-studio/batch-interfaces-compatible-with-openai)。

## 仍需的外部证据

1. 外部技术/账户管理员批准：固定北京地域账户可调用 `qwen3-vl-plus-2025-12-19`。
2. 阿里云数据责任人书面确认：不训练/ZDR、短期私有 URL、保存/删除 SLA、日志回流关闭、人工终审边界。
3. 经审查的运行环境将 `QWEN_PROVIDER_APPROVED=true` 及上述四个数据处理旗标绑定到批准 artifact；不得手工绕过。
