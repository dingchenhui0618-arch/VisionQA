# VisionQA Provider Adapter v0.2

## 当前状态

- 默认 provider 为 `fixture`，无密钥、无网络、无模型费用。
- 首个国产 live adapter 为阿里云百炼华北 2（北京）
  `qwen3-vl-plus-2025-12-19` 固定快照。
- 旧 OpenAI adapter 仅保留源代码用于历史对照；Factory 明确拒绝
  `VISION_PROVIDER=openai`。遗留 OpenAI 环境变量不能恢复网络。
- Adapter 只产生 observation draft。综合分、商业六项固定权重、Gate、
  Blocker 和 Repair Prompt 仍由本地 Orchestrator 决定。
- 当前代码与测试没有执行任何真实或付费请求。

## Qwen 激活组合门

以下项目必须全部由 staging secret/config 注入。任一缺失都会在 `fetch`
之前抛出 `CONFIGURATION`：

```text
VISION_PROVIDER=aliyun-bailian-cn-beijing
QWEN_PROVIDER_APPROVED=true
VISION_PROVIDER_APPROVED=aliyun-bailian-cn-beijing
VISION_LIVE_PROVIDER_ENABLED=true
VISION_PAID_CALLS_ENABLED=true
VISION_DATA_PROCESSING_APPROVED=true
VISION_ENVIRONMENT=staging
VISION_STAGING_READY=true
STAGING_ALIYUN_OSS_PG_ACCEPTED=true
DATASET_RIGHTS_ALLOWLIST_MATCH=true
MAINLAND_PROCESSING_EVIDENCE=true
NO_TRAINING_WRITTEN_EVIDENCE=true
RETENTION_DAYS_AND_SCOPE_CONFIRMED=true
CONTENT_REVIEW_AND_HUMAN_ACCESS_CONFIRMED=true
DELETION_AND_BACKUP_SLA_CONFIRMED=true
PRIVATE_OR_TENANT_ISOLATED_PATH_CONFIRMED=true
LOG_BACKFLOW_DISABLED=true
SECRET_MANAGER_CONFIGURED=true
IP_AND_MODEL_ALLOWLIST_CONFIGURED=true
COST_HARD_STOP_TESTED=true
VISION_PRIVATE_IMAGE_URLS_CONFIRMED=true
EXPLICIT_RUN_APPROVAL=true
VISION_RUN_APPROVAL_ARTIFACT_PATH=handoffs/DOMESTIC_PROVIDER_REVIEW_v0.1/provider_activation_decisions.csv
VISION_RUN_APPROVAL_ARTIFACT_ID=DOMESTIC_PROVIDER_REVIEW_v0.1
VISION_RUN_APPROVAL_ARTIFACT_SHA256=<必须等于 registry 固定 SHA-256>
VISION_RUN_APPROVAL_DECISION_IDS=DOMESTIC-QWEN-001,DOMESTIC-BUDGET-001,DOMESTIC-DATA-001
CANARY_MANIFEST_ID=domestic-provider-canary-v0.1
CANARY_MANIFEST_SHA256=<必须等于 registry 固定 SHA-256>
VISION_MODEL=qwen3-vl-plus-2025-12-19
VISION_BUDGET_CURRENCY=CNY
VISION_BUDGET_LIMIT_MINOR_UNITS=2000
VISION_ESTIMATED_BATCH_COST_MINOR_UNITS=<人民币分，不超过本批预算>
VISION_BATCH_SIZE=5
VISION_MAX_TOTAL_REQUESTS=15
VISION_MAX_CONCURRENCY=1
VISION_CN_ALIYUN_BAILIAN_API_KEY=<仅由 secret manager 注入>
VISION_PRIVATE_IMAGE_ENVELOPE_HMAC_SECRET=<仅由 secret manager 注入>
```

本轮不继承原 OpenAI 的 350 元、50 张、并发 3 范围。运行值必须严格等于批准
artifact 和 manifest 绑定的 20 元、5 张、最多 15 次请求、并发 1；只要更宽松
或引用的 artifact id/path/SHA、decision ids、manifest id/SHA 不一致，就会在
`fetch` 前失败。

## 固定边界

- endpoint、provider id、模型快照和图片 host allowlist 全部在
  `registry.ts` 静态注册，不能由环境变量任意改写。
- Qwen live Adapter class 不导出；唯一生产构造 seam 会在模块内部重新执行完整
  governance。冻结的 registry 是 endpoint/model/host 的唯一来源。
- 图片必须携带平台 staging signer 产生的 HMAC 信封。Adapter 会校验 issuer、
  nonce、asset SHA-256、可信字节数、host、path hash、完整 URL hash、MIME 和
  15 分钟内到期时间；缺签、错签、改 host/path/query、过期或超过 10 MiB 均在
  `fetch` 前拒绝。
- 普通日志、结果和错误不包含 Authorization、API key、图片 URL、query、
  Base64 或响应正文。
- compatible API 使用 `response_format={"type":"json_object"}` 和
  `enable_thinking=false`；返回值仍须经过本地严格结构校验。
- 只允许纯 JSON object 或没有额外文字的纯 `json` code fence。
- evidence 缺失由本地 Orchestrator 将对应分数降为 `null`，结果为
  `PARTIAL + REVIEW`，不得补造证据。
- 本轮批次固定 5 张、最多 15 次请求、并发固定 1。账户预算硬停仍需单独配置，代码门不能替代
  云厂商账单门。

## 错误与重试

只重试 `RATE_LIMITED`、`PROVIDER_UNAVAILABLE`、`NETWORK` 和 `TIMEOUT`。
认证失败、无效 JSON、内容政策拦截、载荷过大、不支持的媒体、余额不足、
模型错误和上游取消均不重试。

## 验证

```text
npm run test:adapters
npm test
npm run lint
npm run build
```

测试全部使用 mock fetch 或 fixture，不执行真实模型调用。
