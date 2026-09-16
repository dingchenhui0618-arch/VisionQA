# Customer Beta 单一事实源迁移

## 当前结论

客户页面与客户 API 已统一依赖 `lib/beta/backend.ts`。当前适配器仍是本机/内存 `BetaService`，因此这是组合根完成、PostgreSQL 实现未完成的中间状态，不能宣称生产持久化已经接通。

禁止只把修图事务接到 PostgreSQL：session、project、asset、screening、repair 与 credits 必须来自同一个 backend，否则会形成双事实源和重复扣次风险。

## 已完成

- `BetaBackend` 覆盖客户链使用的认证、项目、素材、筛查、修图、额度与内部管理方法。
- 页面和 API 统一 `await` backend，使同步本地实现与未来异步 PostgreSQL 实现共用调用契约。
- 本地测试允许显式注入 backend；生产环境禁止 override。
- 源码守卫确保 `app/` 不再直接调用 `getBetaService()`。
- `0004_repair_transactions.sql` 与事务 repository 已准备，但尚未接入 backend。
- `postgres-auth-repository.ts` 已实现邀请消费与会话解析，复用 0002：条件消费邀请后事务写入用户/租户/成员/session/wallet/GRANT；仅保存 token 哈希。尚未接入 backend，未执行真实 PostgreSQL 并发/回滚验证。

## 不能部分切换的边界

1. session 解析与所有租户 API；
2. project 与 conversation → project 映射；
3. asset metadata 与私有对象字节；
4. screening batch、真值/候选关系与 screening items；
5. repair attempt、wallet、hold 与 ledger；
6. repair output、image version 与下载；
7. customer-safe 筛查结果与完整模型执行审计。

## PostgreSQL 实现顺序

### 2026-09-16 复用优先修订

用户要求先复用已有实现和 GitHub 开源能力。下列顺序表示接线工作，不表示重新设计所有契约；只有确认既有 schema 无法表达需求时才增加迁移，不预先承诺新增 0005。

- 已有 `lib/platform/postgres-repository.ts` 与 `postgres-port-adapter.ts`：复用批次、完整评估、改判、审计和幂等实现；不要另写第二套评估仓库。
- 已有 `lib/storage/aliyun-oss.ts` / `object-storage.ts`：复用存储接口和校验；客户端接线优先评估官方 [ali-oss](https://github.com/ali-sdk/ali-oss)（MIT），不重做 OSS 协议。
- 已安装 `@mastra/core@1.65.0` 与 `@mastra/libsql@1.22.4`：优先用 [Mastra](https://github.com/mastra-ai/mastra) 的 workflow suspend/resume、[memory](https://mastra.ai/docs/memory/overview) 和 [PostgreSQL store](https://github.com/mastra-ai/mastra/tree/main/stores/pg)。先验证已安装版本兼容性，避免照最新文档直接升级。商品事实和计费仍由领域表负责。
- 后台可靠任务候选：[Graphile Worker](https://github.com/graphile/worker)（MIT，PostgreSQL 队列）。仅在现有 Mastra 的执行/恢复能力无法覆盖需要时接入，避免双调度；付费模型任务仍需调用前幂等声明，队列重试不等于可以再次付费生成。
- 正式认证候选：[Better Auth](https://github.com/better-auth/better-auth)（MIT，含组织/成员/邀请插件）。其组织邀请和现有匿名单次邀请开户语义不同，不能直接替换旧会话；保留为认证接入评估对象。

以上为官方仓库、README 和许可证核验，尚未安装新增依赖或验证运行兼容性。Mastra 当前仓库普通代码为 Apache-2.0，`ee/` 目录另有许可证，不能把整个仓库当成同一种许可复制。复用优先锁版本安装包；需要改源码时再拉取固定提交、保留许可证与来源。

本地 Mastra 接线已实现：`preparePersistentVisualTask` 以服务端 owner + task revision 哈希确定数据库及 runId，复用 suspend/resume；独立进程验证暂停、恢复和完成结果重放，建项目仅执行一次。账号与计划版本隔离，失败快照拒绝自动重跑。原随机快照保留，不承诺历史任意中断点自动恢复。

此证据只覆盖本地项目确认工作流，不代表真实模型任务、PostgreSQL 或分布式执行已恢复。下一实现优先级是接既有评估/存储/修图模块。

1. 补 schema：项目素材不强绑旧 batch、批次素材角色、screening 幂等、conversation 映射。
2. 实现邀请消费、session 与 wallet 初始化的单事务 repository。
3. 实现 project 聚合查询，计数从 batch/item/repair 事实计算，不维护第二份计数。
4. 将 asset metadata 与私有对象存储 port 成对实现；只有对象 HEAD/哈希验证成功才标记 READY。
5. 用零网络 fixture 接入 screening；先验证刷新恢复、失败重放和完整审计。
6. 将现有修图事务 repository 接进 backend，并用 fake Provider 完成 hold/release/capture。
7. 最后才允许受控 DeepSeek/Qwen 真实调用；Sol/Luna 永不进入产品运行 Provider。

## 当前未验证

- 真实 PostgreSQL 迁移、并发和进程崩溃恢复；
- OSS 上传、读取、删除与七天清理；
- PostgreSQL backend 的端到端登录 → 项目 → 素材 → 筛查 → 修图；
- 真实模型质量、真实客户采用、付款与复购；
- 线上部署。
