# VisionQA Object Storage v0.1

本模块把业务层从 Cloudflare R2 命名中解耦，并提供阿里云 OSS
staging Adapter。当前实现不会自行创建 OSS SDK Client，也不会读取静态
AccessKey；部署层必须通过 FC Function Role / RAM Role 获取 STS 临时凭证，
再把受控 `OssClientPort` 注入 Adapter。

## 安全常量

- Region：`cn-beijing`
- Bucket：Private，且启用 Block Public Access
- Prefix：`staging/visionqa/{tenantId}/...`
- 加密：SSE-OSS / AES256
- 签名 GET：1–300 秒
- 覆盖：`x-oss-forbid-overwrite: true`
- 生命周期：对象 14 天、未完成分片 1 天、版本控制关闭
- 凭据：只允许 `ram_role_sts`；发现静态 AK 环境变量立即失败
- 构造：唯一 live 入口要求绑定治理 artifact；生命周期、地域、前缀不能由调用方扩展

## 模块

- `object-storage.ts`：provider-neutral port、错误类型、租户路径校验和旧字段兼容读取。
- `aliyun-oss.ts`：OSS Adapter、配置门、错误分类、HEAD 完整性核验和安全审计。
- `mock-object-storage.ts`：默认离线测试/fixture 存储。
- `private-url-service.ts`：HEAD → 300 秒签名 GET → HMAC 图片信封。

## 数据迁移

新写入应保存：

```json
{
  "storage_provider": "aliyun_oss",
  "object_key": "staging/visionqa/<tenant>/assets/<asset>/<sha256>.jpg",
  "storage_region": "cn-beijing"
}
```

读取时允许旧 `r2_key` 映射为
`storage_provider=cloudflare_r2_legacy`。本模块不修改当前 D1/PG schema；
数据库迁移由 Persistence Agent 单独执行，避免跨职责改表。

完整签名 URL不得保存到数据库、审计事件或日志。审计只保留 provider、
region、bucket、object key、结果、SHA/size（适用时）和过期时间。
签名器返回的 URL 必须使用固定 host，并且其 canonical pathname 与请求的
object key 精确一致；query 不得携带第二个 bucket/key/path 路由目标。
