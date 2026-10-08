# Staging 只读探针记录

日期：2026-10-08  
目标：`https://visionqa.dionysusding.cn`

## 结果

| 请求 | 结果 | 证据边界 |
|---|---:|---|
| `GET /` | 200 HTML | 只能证明域名可达并返回 VisionQA 页面 |
| `GET /login` | 200 HTML | 只能证明登录页面可达 |
| `GET /workspace`（无会话） | 200 HTML | 返回登录态页面；未证明客户会话或项目读取 |
| `GET /api/payment-capability` | 200 JSON | `provider=disabled`、`enabled=false`，符合内测禁用支付边界 |

响应头显示服务由 nginx 提供，HTML `Content-Type` 正常。探针未读取服务器文件、环境变量或密钥，未消费邀请码，未上传图片，未调用真实模型。

后续同步核对发现：staging 的 `GET /api/health` 返回 404，而当前本地候选版本已包含该路由；`/api/payment-capability` 仍返回支付关闭。因此 staging 当前落后于本地提交，不能宣称已部署最新候选包。

## 尚未证明

- 一次性邀请码消费、30 天会话和租户隔离；
- PostgreSQL/OSS 真实持久化、签名上传/下载和七日清理；
- staging 中的筛查、修图、版本树、额度冻结/结算和失败释放；
- DeepSeek/Qwen 真实调用质量与账单；
- 监控、备份、回滚和正式生产切换。

因此当前 staging 结论是 `REACHABLE / AUTH_AND_WORKFLOW_NOT_VERIFIED`，不升级为“已上线”或“客户链路通过”。
