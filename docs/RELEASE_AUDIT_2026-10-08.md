# VisionQA 上线目标完成度审计

日期：2026-10-08  
当前候选提交：`03d32b5`

## 结论

当前为 `LOCAL RELEASE CANDIDATE / STAGING DRIFT`。本地工程链路和脱敏发布目录已具备；staging 域名可访问但尚未同步最新候选，真实客户链路和生产基础设施仍未完成验证，因此不能标记“正式上线”。

## 要求与证据

| 目标项 | 当前状态 | 证据/缺口 |
|---|---|---|
| 自动化测试 | 已证明 | `npm test`：95/95、18/18、31/31、143/143；`npm run lint` 通过 |
| 构建与生产启动 | 已证明 | `npm run build`、生产 smoke 通过；`/api/health` 已覆盖 |
| 客户/开发者分流 | 本地已证明 | `/login → /workspace` 客户；`/internal` 开发者；`/agent` 仅本地开发 |
| 商品对话、筛查、修图、版本、额度 | 本地已证明 | 契约测试、幂等/冻结/释放/版本树/租户边界测试通过 |
| 安全边界 | 本地已证明 | 密钥不入前端；支付 disabled；错误不暴露 Provider；失败释放额度 |
| 脱敏 staging/production 发布包 | 已生成 | `web/dist/release-candidate`，含 manifest 和部署说明，不含密钥/素材 |
| staging 同步 | 未完成 | 域名可达，但 `/api/health` 返回 404，说明落后本地候选 |
| staging 真实登录与客户链路 | 未验证 | 需要有效 staging 邀请和获授权素材 |
| PostgreSQL/OSS 多实例验证 | 未完成 | 当前只有 pg-mem/契约测试，未在目标 staging 资源执行 |
| 真实模型质量/成本 | 未完成 | 未形成本轮真实 DeepSeek/Qwen 受控 QA 证据 |
| 生产切换 | 未授权 | 必须在全部发布门槛通过后取得产品负责人明确确认 |

## 当前最小外部动作

1. 用 `npm run release:export` 生成的候选目录同步到 staging。
2. 在 staging 使用一次性邀请完成一次客户链路回归。
3. 回填 PostgreSQL、OSS、模型调用和回滚证据。
4. 只有审计表中所有“未完成/未验证”项闭合后，才讨论正式域名切换。

本审计不把合成素材、Mock 输出、单元测试或域名 200 响应当作模型质量、客户采用或生产稳定性的替代证据。
