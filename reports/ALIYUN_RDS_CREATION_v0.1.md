# VisionQA 阿里云 RDS 创建记录 v0.1

日期：2026-08-10  
状态：`ORDER_SUCCESS / INSTANCE_RUNNING / APP_DATABASE_READY / MIGRATION_PENDING_DMS_AUTH`

## 用户确认

- 用户在看到最终配置与 `¥0.10～0.18/小时` 核价后，明确回复“确定”。
- 该确认用于创建 1 个真实 RDS Serverless 实例并产生按量费用。

## 提交配置

- 地域：华北 2（北京）
- 引擎：PostgreSQL 16
- 计费：Serverless
- 系列：基础系列
- 存储：高性能云盘 20GB
- RCU：最低 0.5，最高 1
- 自动启停：开启
- 弹性策略：不强制执行
- 部署：单可用区，北京可用区 L
- VPC：`visionqa-staging-vpc` / `vpc-2zemfydacq5kqa6ssqoon`
- 交换机：`visionqa-staging-vsw-a` / `vsw-2zee61oe1pjr1t0z1m9gw`
- 数量：1

## 创建结果

- 阿里云支付完成页返回“恭喜，开通成功”。
- 订单号：`2000999122970135`。
- 页面提示实例一般需要 1–5 分钟开通。
- 阿里云资源概览已显示“云数据库 RDS：1 实例”，确认资源计数已经生效。
- 新版 RDS 实例列表受跨域脚本错误影响持续显示加载骨架；改用主账号 Cloud Shell 只读查询完成复验。
- 实例 ID：`pgm-2ze0uziz73r8abb8`。
- 引擎：`PostgreSQL`；版本：`16.0`；状态：`Running`。

## 当前结论

- 真实订单与按量资源已经创建，费用开始按阿里云实际计费规则产生。
- 已创建 `visionqa_app` 普通应用账号与 `visionqa_staging` 数据库；账号状态 `Available`、数据库状态 `Running`。
- PostgreSQL 云盘实例按阿里云契约使用 `DBOwner` 授权，复验数据库权限为 `ALL`。
- RDS 继续保持 VPC 私网访问且无公网地址；Cloud Shell 私网连通测试被阻断，隔离策略符合预期。
- migration 尚未执行；下一步通过 DMS 私网管理通道执行，首次使用需要用户确认创建免费服务关联角色 `AliyunServiceRoleForDMS`。
- 项目内 PostgreSQL migration 已就位：`web/drizzle-pg/0000_visionqa_baseline.sql` 与 `0001_normalize_storage_provider.sql`。
