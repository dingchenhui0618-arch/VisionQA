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

## 不能部分切换的边界

1. session 解析与所有租户 API；
2. project 与 conversation → project 映射；
3. asset metadata 与私有对象字节；
4. screening batch、真值/候选关系与 screening items；
5. repair attempt、wallet、hold 与 ledger；
6. repair output、image version 与下载；
7. customer-safe 筛查结果与完整模型执行审计。

## PostgreSQL 实现顺序

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

