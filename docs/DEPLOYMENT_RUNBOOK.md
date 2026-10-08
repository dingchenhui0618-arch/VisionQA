# VisionQA staging / production 部署运行手册

更新时间：2026-10-08

这份手册只描述可复现的发布边界，不包含任何密钥、客户图片或服务器凭据。当前仓库可以生成 release candidate，但尚未执行正式生产切换。

## 1. 发布前本地门槛

```powershell
Set-Location D:\VisionQA\web
npm ci
npm test
npm run lint
```

`npm test` 运行 `scripts/release-check.mjs`，包含构建、核心持久化、页面、契约和业务测试。构建因主机内存失败时最多原样重试一次；任何测试失败都直接终止。

## 2. 环境分层

| 环境 | 用途 | 数据事实源 | 模型/支付 |
|---|---|---|---|
| local | 开发与 Mock/真实接口联调 | `web/work/local-agent-state` | 本地授权的 DeepSeek/Qwen；不作为生产证据 |
| staging | 发布验收与少量邀请用户 | 独立 PostgreSQL + 私有 OSS | DeepSeek/Qwen 受控预算；支付固定 disabled |
| production | 正式客户 | 独立 PostgreSQL + 私有 OSS | 只启用已验收 Provider；支付按主体/商户资质另行开启 |

禁止跨环境共享数据库、对象存储桶、会话密钥、邀请码或客户素材。

## 3. 服务器配置要求

服务端必须通过环境变量注入密钥，至少包括：

- `VISIONQA_RELEASE_MODE=beta|production`
- `VISIONQA_PAYMENT_PROVIDER=disabled`
- DeepSeek/Qwen 服务端密钥、审批开关和数据范围声明
- `VISIONQA_ASSET_URL_SIGNING_SECRET`
- PostgreSQL 与 OSS 的服务端连接配置

密钥不得进入前端构建产物、日志、Git、截图或浏览器 Local Storage。客户图片只能使用短时签名地址，默认保留期和删除策略按产品契约执行。

## 4. Staging 验收顺序

1. 使用独立空库执行版本化迁移并保存日志。
2. 启动服务并检查首页、登录、客户 Agent、开发者入口分流。
3. 使用一次性邀请完成建商品、上传真值/候选、筛查、修图、版本切换、刷新恢复、人工确认和下载。
4. 检查失败释放额度、重复点击幂等、租户隔离、签名 URL 过期和项目删除。
5. 运行受控真实模型 QA；达到调用次数或费用硬停即停止，不自动重试。
6. 保存发布版本、迁移日志、测试报告、错误日志和回滚点。

## 5. Production 切换门槛

只有以下证据全部存在，且产品负责人明确确认后才允许切换正式域名：

- staging 全链路通过；
- PostgreSQL 多实例重启、事务回滚、租户隔离通过；
- OSS 上传、签名下载、七日清理和项目删除通过；
- 真实模型输出经过人工质量 Gate，且预算/调用上限有效；
- 监控、备份、告警和回滚演练完成；
- 隐私政策、用户授权、主体/支付/退款边界已确认。

当前结论：上述 production 门槛尚未全部闭合，因此本文件不授权任何线上切换。
