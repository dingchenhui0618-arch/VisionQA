# VisionQA 阿里云 OSS Storage Adapter 实现报告 v0.1

> 角色：阿里云 OSS Storage Adapter 实现 Agent  
> 完成时间：2026-07-29（Asia/Shanghai）  
> 状态：`IMPLEMENTED_AND_LOCALLY_VERIFIED / QA_P1_CLOSED / ZERO_NETWORK / NO_RESOURCE_CREATED`

## 1. 职责、输入、输出、验收标准

### 职责

- 建立 provider-neutral `ObjectStorage` port；
- 实现阿里云 OSS `put/head/presign GET/delete/lifecycle metadata`；
- 固定北京地域、私有 Bucket、租户前缀、300 秒 URL、SSE-OSS 和 RAM Role/STS；
- 延续现有 Qwen HMAC 私有图片信封，将其绑定到可信 HEAD 元数据；
- 提供默认离线 Mock、错误分类、安全测试和 R2 兼容读取；
- 不修改 PostgreSQL Repository、FC 配置，不创建云资源，不发网络请求。

### 输入

- `agents/aliyun_staging_architecture_v0.1.md`
- `agents/aliyun_migration_impact_v0.1.md`
- `web/lib/visionqa/providers/private-image-envelope.ts`
- 现有 Qwen Registry、preflight 与测试
- 旧 `assets.r2_key` 持久化语义

### 输出

- `web/lib/storage/object-storage.ts`
- `web/lib/storage/aliyun-oss.ts`
- `web/lib/storage/mock-object-storage.ts`
- `web/lib/storage/private-url-service.ts`
- `web/lib/storage/README.md`
- `web/tests/object-storage.test.ts`
- 本报告

### 验收标准

- 缺少显式激活条件或注入 Client 时，网络调用为 0；
- 静态 AK、公网 Bucket、错误地域/Endpoint、非 RAM Role/STS 均拒绝；
- 只允许 `staging/visionqa/{tenant}/`，跨租户和路径穿越拒绝；
- GET URL TTL 不超过 300 秒；
- 上传使用防覆盖、SSE-OSS，并由 HEAD 校验 SHA/size/MIME；
- HMAC 信封绑定可信 HEAD 的 SHA-256 与 byte size；
- HEAD/DELETE 可审计，签名 URL和凭据不进入审计；
- 旧 `r2_key` 兼容读，新写固定 `storage_provider=aliyun_oss`；
- test、lint、build 通过。

## 2. 实现结果

### 2.1 Provider-neutral port

`ObjectStorage` 暴露：

- `put`
- `head`
- `presignGet`
- `delete`
- `lifecycleMetadata`

业务层只处理 `objectKey` 和 `storageProvider`，不再要求知道 R2/OSS SDK
细节。`ObjectStorageError` 提供稳定错误分类：

- `CONFIGURATION`
- `AUTHENTICATION`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `INTEGRITY`
- `TIMEOUT`
- `UPSTREAM`

### 2.2 OSS Adapter 门禁

构造阶段强制：

| 约束 | 固定值 |
|---|---|
| 地域 | `cn-beijing` |
| Endpoint | `<bucket>.oss-cn-beijing.aliyuncs.com` |
| ACL | `private` |
| Public access | Block Public Access=true |
| Credential | `ram_role_sts` |
| 加密 | SSE-OSS / AES256 |
| Prefix | `staging/visionqa/` |
| Lifecycle | 当前对象 14 天；未完成分片 1 天；版本控制关闭 |
| Governance | 固定 artifact ID/path/SHA，缺一项则零网络失败 |

`createAliyunOssStorageFromEnv()` 发现
`VISION_OSS_ACCESS_KEY_ID` 或 `VISION_OSS_ACCESS_KEY_SECRET` 时立即失败。
缺少 `VISION_STORAGE_PROVIDER=aliyun_oss`、
`VISION_STORAGE_STAGING_READY=true` 或注入 Client 时同样立即失败。

Adapter 不自行读取凭据，不包含 AK 参数，不初始化 SDK，因此默认网络调用为
0。未来真实 Client 必须由 FC Function Role / RAM Role 的 STS 临时凭据构造。

`AliyunOssStorage` 和原始 config 均不导出。唯一 live 构造入口把 region、
prefix、14 天对象生命周期、1 天分片生命周期和版本控制状态重新固定；环境
尝试传入 999 天、其他 prefix、其他 region 或其他 endpoint 时，在 Client
调用前失败。构造后修改原环境对象或修改 `lifecycleMetadata()` 返回对象也
不能扩大内部配置。

### 2.3 对象与完整性控制

- tenant ID 使用严格安全段；
- object key 必须位于
  `staging/visionqa/{tenantId}/`；
- 拒绝 `..`、`.`、反斜杠、双斜杠和跨租户 key；
- PUT 固定：
  - `x-oss-forbid-overwrite: true`
  - `x-oss-server-side-encryption: AES256`
  - SHA-256、byte size、retention metadata
- 上传后执行 HEAD，校验 SHA、size、MIME 与加密；
- presign 只允许 HTTPS、固定 OSS host，TTL 为 1–300 秒；
- presign URL 的 canonical pathname 必须与请求 object key 精确一致；
- URL query 禁止携带第二个 bucket/key/object/path 路由目标；
- DELETE 后再次 HEAD，仍存在即失败；
- delete audit 保存被删对象 SHA/size，不保存 URL。

### 2.4 HMAC 图片信封

`issuePrivateImageReference()` 执行：

```text
资产记录的 SHA/size/MIME
        |
        v
OSS/Mock HEAD 元数据核对
        |
        v
GET URL（默认 300 秒）
        |
        v
现有 HMAC-SHA256 v1 信封
```

资产记录与 HEAD 的 SHA、size 或 MIME 任一不一致时，不生成 URL/信封。
信封继续绑定 URL host/path/full URL、角色、MIME、过期时间、SHA 和 byte
size，沿用已有防篡改验证。

### 2.5 R2 兼容边界

- 旧记录只有 `r2_key` 时，读取映射为
  `storageProvider=cloudflare_r2_legacy`；
- 有新 `object_key` 时使用通用字段；
- 新写由 `newStorageWrite()` 固定为
  `storageProvider=aliyun_oss`；
- 本 Agent 未修改 D1/PostgreSQL Schema 或 Repository。真实列迁移由
  Persistence Agent 负责。

## 3. 测试证据

### Storage 专项

命令：

```powershell
node --experimental-strip-types --test tests/object-storage.test.ts
```

结果：`9/9 PASS`

覆盖：

1. 默认/缺配置/静态 AK 零网络；
2. 公网 Bucket、错误地域/Endpoint、非 Role 凭据拒绝；
3. PUT/HEAD/presign/delete、安全 headers 和 URL-free audit；
4. 跨租户、路径穿越和 TTL 301 秒拒绝；
5. HMAC 信封与 HEAD SHA/size 绑定；
6. 旧 `r2_key` 兼容读、新写 OSS；
7. 配置/生命周期在构造后不可变；
8. 旧 `r2_key` 兼容读、新写 OSS；
9. OSS 错误稳定分类。

### 全量门禁

| 命令 | 结果 |
|---|---|
| `npm run lint` | PASS |
| `npm test` | PASS |
| build（由 `npm test` 首步执行） | PASS |
| 全量测试 | `52/52 PASS` |

## 3.1 独立 QA P1 修复

| QA 项 | 修复 | 回归证据 |
|---|---|---|
| P1：直接构造可覆盖 lifecycle/region/prefix | class/config 不再导出；唯一 live factory 固定安全常量并绑定治理 artifact | 999 天、错误地域、public、非 Role、错误 prefix/endpoint 全部零网络失败 |
| P1：presign 只验证 host | 增加 canonical pathname 与 object key 精确绑定，拒绝路由型 query | tenant-b path、`objectKey=tenant-b` query、编码斜杠 path 全部拒绝 |

## 4. 未执行与后续接线

以下项目故意没有执行，不能据本报告宣称真实 OSS 已就绪：

- 没有创建 Bucket、RAM Role、Lifecycle Rule 或资源组；
- 没有调用 OSS、STS 或阿里云 API；
- 没有匿名 GET 403、真实 URL 过期、真实 lifecycle 的云端证据；
- 没有接入正式 OSS Node SDK transport；
- 没有写 PostgreSQL storage metadata migration；
- 没有更新 Qwen Registry 的真实 OSS hostname 或审批 artifact hash。

真实接线前需要云管理员提供（只提供资源 ID/配置证明，不在聊天发送
AccessKey）：

1. staging 资源组和 `cn-beijing` 私有 Bucket；
2. Block Public Access、SSE-OSS、14 天对象/1 天分片生命周期证明；
3. FC Function Role / RAM Role ARN，及限定 Bucket + prefix 的最小权限；
4. 真实 Bucket 名与 Endpoint host；
5. 由安全 Agent 复核的新 Qwen host allowlist、nonce 与 approval binding；
6. Persistence Agent 完成 `storage_provider/object_key/storage_region`
   字段后再接业务 API。

## 5. 结论

```text
本地 OSS Storage Adapter：GO
真实 OSS staging：NO-GO（等待资源、RAM Role、SDK transport 与云端 smoke）
真实 Qwen canary：NO-GO（本报告不改变 Provider activation gate）
Production：NO-GO
```

本实现满足“无 AK、默认零网络”的代码门禁，可交给独立 QA 做攻击性复核。
