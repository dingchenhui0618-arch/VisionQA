# VisionQA 阿里云运行资源盘点 v0.1

日期：2026-08-13

## 已就绪

- RDS PostgreSQL 16：`pgm-2ze0uziz73r8abb8`，状态 `Running`。
- 数据库：`visionqa_staging`；应用账号：`visionqa_app`。
- `public` Schema：11 张业务表，真实持久化写入验收通过。
- 专用网络：`visionqa-staging-vpc` 与 `visionqa-staging-vsw-a`。

## 只读盘点结果

- OSS Bucket：0 个，当前没有可复用的 VisionQA 私有 Bucket。
- 北京区 FC 3.0 云函数：0 个，当前没有 API Function 或异步评估 Function。
- 本次盘点没有创建云资源、调用模型或写入新的密钥。

## 下一批拟创建资源

1. 私有 OSS Bucket：北京区、阻止公共访问、SSE-OSS、`staging/visionqa/` 前缀、14 天生命周期。
2. VisionQA 专用安全组：仅满足 FC 到 RDS 私网连接需要。
3. SLS Project/Logstore：仅记录脱敏结构化运行事件。
4. `visionqa-staging-api`：FC 3.0 Web Function，无常驻实例、并发 1。
5. `visionqa-staging-evaluation-task`：FC 3.0 异步评估 Function，无常驻实例、并发 1、最多 3 次尝试。

## 用户批准门

创建以上资源会产生新的按量计费入口。当前已知账户可用额度约为 `¥19.95`，RDS 已持续按量计费；在创建前必须由用户确认资源创建与余额/续费策略。

## Gate

`RDS_READY / OSS_EMPTY / FC_EMPTY / RUNTIME_RESOURCE_APPROVAL_REQUIRED`

本报告不记录密码、API Key、AccessKey、Token、私网数据库 Host 或签名 URL。
