# VisionQA 阿里云 FC Live Composition v0.1

日期：2026-08-06  
结论：`SOFTWARE_COMPOSITION_READY / CLOUD_BINDINGS_NOT_DEPLOYED / NO_LIVE_TRAFFIC`

## 本轮完成

- FC 不再把 live 模式永久写死为不可启动，而是从固定的、可审查的 `generated/live-bindings.mjs` 入口加载真实绑定；缺失或接口不匹配时在网络请求前失败关闭。
- 新增 OSS + PostgreSQL + Qwen 组合根。Qwen 调用统一经过本地 Orchestrator，综合分、四大 Skill、Gate 和修复 Prompt 仍由确定性规则生成。
- 候选图及最多 4 张客户历史参考图全部由 OSS 对象键解析；调用方提交的任意候选/参考 URL 会被覆盖，不能绕过租户前缀和私有存储。
- 每张图片均先读取 OSS 可信 HEAD 元数据，再把 SHA-256、字节数、短期 URL、角色和随机 nonce 写入 HMAC 私有图片信封，之后才允许送入 Qwen。
- 修正 Qwen 端口 ID 为项目实际值 `aliyun-bailian-cn-beijing`。
- FC Function Role 注入的完整临时 STS 三元组现在允许启动；长期 AK、非 STS AK、缺项 STS 和遗留 AK 变量继续失败关闭，且配置与日志不保存凭证值。
- 删除 Qwen 正式 registry 中残留的 Cloudflare/R2 host；在真实 OSS Bucket host 完成审查并写入固定 allowlist 前，正式私有 URL 调用保持关闭。
- 治理变量由 `STAGING_D1_R2_ACCEPTED` 更新为 `STAGING_ALIYUN_OSS_PG_ACCEPTED`。

## 自动验收

- `web/aliyun-fc npm run verify`：17/17 测试通过，lint、Node 20 语法构建、fixture HTTP smoke 全通过，网络 provider 调用数为 0。
- `web npm test`：生产构建通过；页面/Schema/生产启动 10/10；规则、模型、存储、持久化、UI 和下载 66/66。
- 本轮未部署 FC、未上传图片、未连接 RDS、未调用付费模型、未创建或读取 AccessKey/API Key。

## 仍需云端证据后才能激活

1. 实际私有 OSS Bucket 名称及外网签名 host，写入代码 allowlist 并外审。
2. `generated/live-bindings.mjs` 构建物：绑定 OSS SDK、RDS PostgreSQL pool、Qwen adapter 和 Secret 注入，不包含任何密钥值。
3. RDS PostgreSQL 实例、数据库账号、VPC 内网地址、无公网及白名单证据；当前订单仍属于需要用户核价并亲自确认的付费动作。
4. Qwen 正式 activation artifact 从 pending 更新为 approved，并完成小批次费用硬门复验。

未满足以上条件时，系统继续使用本地真实 MVP 路径；`AUTO_PASS` 保持关闭，所有结果必须人工终审。
