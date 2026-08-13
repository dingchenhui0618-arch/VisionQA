# VisionQA 阿里云 Staging 资源计划报告 v0.1

更新时间：2026-07-29（Asia/Shanghai）  
执行角色：阿里云 FinOps / 架构 Agent  
结论：`PLAN_READY / NO_RESOURCE_CREATED / NO_ORDER / NO_SECRET / NO_MODEL_CALL`

## 职责

- 基于既有阿里云迁移架构、v0.2 授权、Operator Bootstrap 和已实现代码，制定北京区最小 staging 资源计划。
- 核对阿里云官方当前产品能力和价格说明。
- 区分公开参考单价与必须控制台询价的项目。
- 将 RDS 最终订单、月度预算和 Qwen canary 保留为用户显式决定。

## 输入

- `agents/aliyun_staging_architecture_v0.1.md`
- `agents/aliyun_migration_impact_v0.1.md`
- `agents/aliyun_fc_runtime_implementation_report_v0.1.md`
- `handoffs/ALIYUN_AUTHORIZATION_v0.2/`
- `handoffs/ALIYUN_OPERATOR_BOOTSTRAP_v0.1/`
- `web/aliyun-fc/s.example.yaml`
- 阿里云 OSS、RDS、FC、SLS、ActionTrail、VPC、NAT、EIP、百炼官方文档

## 输出

- `handoffs/ALIYUN_STAGING_RESOURCE_PLAN_v0.1/resource_plan.md`
- `handoffs/ALIYUN_STAGING_RESOURCE_PLAN_v0.1/approval_decisions.csv`
- `handoffs/ALIYUN_STAGING_RESOURCE_PLAN_v0.1/execution_order.md`
- 本报告

## 关键决策

1. 常驻资源固定为私有 OSS、RDS PostgreSQL Serverless 0.5–1 RCU/20 GB/自动启停、FC Web+Task、SLS 与免费网络基础层。
2. NAT/EIP 不常驻，只在 Qwen canary 前创建，最长 24 小时，结束后立即释放。
3. KMS 软件实例不进入 MVP，避免约 ¥2,499/月的量级成本；Secret 只经受控控制台/流水线注入。
4. ActionTrail 使用默认最近 90 天管控事件，不启用 OSS 数据事件或长期付费投递。
5. 基础设施月度上限建议 ¥300，Qwen canary 独立硬上限 ¥20。
6. RDS 北京实时价格无法从公开文档可靠确定，必须由用户在控制台核价并亲自点击最终订单。

## 成本核验

- OSS 标准 LRS 官方示例：¥0.12/GB/月。
- FC 当前第一阶梯：¥0.00011/CU；官网折扣截至 2026-08-27 为 ¥0.000088/CU；存在单小时最低 ¥0.01 规则。
- 北京单可用区 NAT 官方参考：¥0.115/小时，另收 NAT CU。
- 北京按流量 EIP：¥0.02/小时 + ¥0.80/GB 出流量。
- Qwen 固定快照北京输入≤32K：输入 ¥1/百万 tokens，输出 ¥10/百万 tokens。
- RDS 官方公开案例是杭州参考价，不得当作北京报价。

## 验收标准

- 计划包含名称、规格、标签、依赖、费用属性、预算和回收路径。
- 没有虚构资源 ID、Bucket 实名、订单价格或免费资格。
- 任何 RDS 订单明确要求用户最终点击。
- Qwen 仍受数据治理证据、5 张/15 请求/并发 1/¥20 门控制。
- 本轮云资源创建、订单、密钥读取、图片上传和模型调用均为 0。

## 用户最小决定集

1. 批准常驻 staging 规格。
2. 批准基础设施 ¥300/月上限及告警。
3. 在 RDS 实时订单页出现后，核对价格并亲自决定是否下单。
4. 是否批准未来最长 24 小时的 NAT/EIP canary 窗口。
5. Qwen 继续 HOLD，直到数据治理证据被外审接受。

