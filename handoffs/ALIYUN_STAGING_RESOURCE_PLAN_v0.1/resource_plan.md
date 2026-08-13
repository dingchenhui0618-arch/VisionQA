# VisionQA 阿里云北京 Staging 最小资源计划 v0.1

> 编制日期：2026-07-29（Asia/Shanghai）  
> 角色：VisionQA 阿里云 FinOps / 架构 Agent  
> 状态：`PLAN_READY / NO_RESOURCE_CREATED / NO_ORDER_PLACED / NO_MODEL_CALL`  
> 固定地域：华北 2（北京）`cn-beijing`  
> 适用环境：仅 `staging`

## 1. 执行结论

采用两阶段资源形态：

1. **常驻最小 staging**：VPC、vSwitch、安全组、私有 OSS、RDS PostgreSQL Serverless、FC Web + Task、SLS。
2. **临时 Qwen canary 窗口**：仅在模型数据治理证据通过后，临时增加单可用区公网 NAT 网关 + EIP，提供固定出口 IP；窗口最长 24 小时，结束后撤销百炼 Key 并释放 NAT/EIP。

这样既满足 FC 访问 RDS/OSS 的私网要求，也避免为了尚未运行的模型评测长期支付公网 NAT 费用。

任何 RDS 订单必须由用户在控制台核对实时价格后亲自点击；本计划不创建资源、不下单、不索取密钥。

## 2. 全局边界

- 地域只能是 `cn-beijing`。
- 资源组显示名与标识：`visionqa-staging`。
- 所有可命名资源使用 `visionqa-staging-*`。
- 标签：
  - `project=visionqa`
  - `environment=staging`
  - `owner=dingchenhui`
  - `managed-by=visionqa-operator`
- 只用按量付费 / Serverless；不买包年包月、资源包或 KMS 软件实例。
- 不创建公网 RDS 地址，不使用 `0.0.0.0/0` 白名单。
- 不创建任何 AccessKey；FC 访问 OSS 使用运行角色和临时 STS。
- 不上传真实图片，不创建百炼 Key，不调用 Qwen，直到数据治理证据单独通过。
- production 继续 `NO-GO`。

## 3. 资源明细

| 层 | 资源名称/模式 | 最小规格 | 费用属性 | 回收方式 |
|---|---|---|---|---|
| 资源组 | `visionqa-staging` | 独立资源组 | 免费 | 先清空子资源，再删除 |
| VPC | `visionqa-staging-vpc` | `10.90.0.0/16` | VPC/交换机本身免费 | 先删除依赖，再删 VPC |
| vSwitch | `visionqa-staging-vsw-a` | 单可用区，建议 `10.90.1.0/24`；实际可用区以 RDS Serverless 售卖页为准 | 免费 | 删除 |
| 安全组 | `visionqa-staging-sg` | 普通安全组；无公网入站；仅同 VPC 必要流量 | 免费 | 删除 |
| OSS Bucket | `visionqa-staging-oss-<账号后6位>-cn-beijing` | 标准存储、本地冗余 LRS、Private、BPA、SSE-OSS；版本控制关闭 | 按存储、请求、公网下行计费 | 删除对象后删除 Bucket |
| OSS 前缀 | `staging/visionqa/` | 当前对象 14 天永久删除；未完成 Multipart 1 天清理 | 包含在 OSS 用量中 | Lifecycle 自动清理 |
| RDS | 实例描述 `visionqa-staging-pg` | PostgreSQL 16（若北京不售则 15/14）；Serverless 基础系列；0.5–1 RCU；20 GB；Premium ESSD/PL1；自动启停；不强制扩缩 | 按 RCU + 存储；主要常驻成本 | 先导出/核验，再释放实例 |
| RDS DB | `visionqa_staging` | 仅 VPC 内网；应用账号仅该 DB/schema DML；迁移账号分离 | 包含在 RDS | 随实例释放 |
| SLS Project | `visionqa-staging-sls-<账号后6位>` | 北京区 | 按量 | 删除 Logstore 后删除 Project |
| SLS App | `visionqa-staging-app` | Standard；按写入量；30 天；只索引必要字段 | 按写入量；30 天内存储包含在该模式内 | 删除 Logstore |
| SLS Security | `visionqa-staging-security` | Query 或 Standard；90 天；低写入；禁止正文/URL/Secret | 按量，超过 30 天部分需计费 | 删除 Logstore |
| FC Web | `visionqa-staging-api` | FC 3.0；custom.debian12 + Node.js 20；1024 MB；512 MB 磁盘；30 秒；并发 1；最大实例 1；预留实例 0 | 按 CU；有调用小时最低计费规则 | 删除函数 |
| FC Task | `visionqa-staging-evaluation-task` | FC 3.0；Node.js 20；1024 MB；512 MB；120 秒；并发 1；最大实例 1；预留实例 0；最多 3 attempts | 按 CU | 删除函数 |
| FC 运行角色 | `visionqa-staging-runtime` | 只允许 OSS 指定 Bucket/前缀、SLS 指定 Logstore；无资源创建权 | 免费 | 先解绑函数，再删除 |
| ActionTrail | 账号默认 90 天管控事件 | 本阶段不创建长期 Trail，不开启 OSS 数据事件 | 默认查询不增加独立存储费；投递才按 OSS/SLS 计费 | 无需回收 |
| 公网 NAT | `visionqa-staging-nat-canary` | **仅 canary 临时创建**；单可用区；最长 24 小时 | NAT 实例费 + CU 费 | canary 后立即释放 |
| EIP | `visionqa-staging-eip-canary` | **仅 canary 临时创建**；按使用流量；1 Mbps 峰值足够 | IP 保有费 + 出流量 | canary 后立即释放 |
| 百炼空间 | `visionqa-staging` | 北京业务空间；仅固定 `qwen3-vl-plus-2025-12-19` | 空间本身以控制台为准；模型按 token | canary 后撤销 Key，空间可保留或删除 |
| Qwen canary | 固定快照 | 5 张、最多 15 请求、并发 1、应用硬门 ¥20、禁止自动续跑 | 输入/输出 token 计费 | 撤销 Key、关闭 live gate |

### OSS 强制配置

- 外网 Endpoint：`oss-cn-beijing.aliyuncs.com`。
- FC 内网 Endpoint：`oss-cn-beijing-internal.aliyuncs.com`。
- 私有 ACL + Bucket 级 Block Public Access。
- SSE-OSS（AES256），不购买 KMS。
- 预签名 GET 最大 300 秒，以现有实现基线为准；数据库和日志不得保存完整 URL。
- 对象键固定为 `staging/visionqa/tenant/{tenant_id}/assets/{asset_id}/{sha256}.{ext}`。
- CORS 只允许已确认的 staging origin、`PUT/HEAD/GET` 必需项；不得使用 `*`。

### RDS 强制配置

- 购买方式：Serverless、按量。
- 基础系列；开发/测试可接受短时不可用。
- 最小 0.5 RCU，最大 1 RCU。
- 20 GB 最小存储；注意存储扩容后不会自动缩容。
- 无连接 10 分钟自动暂停；FC 连接池必须主动关闭空闲连接，避免阻止暂停。
- VPC 内网；不申请公网连接地址。
- 白名单仅 `10.90.1.0/24` 或创建后识别出的 FC vSwitch 精确网段，禁止 `0.0.0.0/0`。
- SSL/TLS 开启。
- **用户在最终订单页核对地域、规格、计费和实时价格后亲自点击。**

### FC 强制配置

- 初始 `VISIONQA_RUNTIME_MODE=fixture`。
- Web 与 Task 最大实例数均为 1；实例并发均为 1；预留实例为 0。
- Web 函数只开放健康检查和受控 staging API；不绑定生产域名。
- Task 最多 3 attempts，包含首次；最大事件年龄 300 秒；错误不做无界重试。
- 未通过治理门时 live composition 必须 fail closed。
- Secret 只由管理员在受控控制台/流水线注入；不进入 Git、CSV、Markdown、聊天或 SLS。
- MVP 不购买 KMS 软件实例。若未来已有共享 KMS，再迁移 RDS/Qwen Secret。

## 4. 费用与预算

### 4.1 可从官方文档确认的公开单价

以下是 2026-07-29 查询到的阿里云官方公开说明，不等于控制台采购报价：

| 项目 | 官方公开信息 | 预算解释 |
|---|---|---|
| OSS 标准存储 LRS | 示例单价 `¥0.12/GB/月`，实际按小时 | 5 GB 且只保留 14 天时，纯存储约低于 ¥0.30/月；请求和公网下行另计 |
| FC 3.0 | 第一阶梯 `¥0.00011/CU`；官网折扣至 2026-08-27 为 `¥0.000088/CU`；有调用或持续占用的函数单小时折算不足 ¥0.01 时按 ¥0.01 | 低频 fixture/smoke 预计很低，但必须以账单为准 |
| 公网 NAT（北京） | 单可用区实例参考价 `¥0.115/小时`；另收 NAT CU | 24 小时实例费参考约 ¥2.76，CU 另计 |
| EIP（北京，按流量） | 公网 IP `¥0.02/小时`；公网出流量 `¥0.80/GB` | 24 小时 IP 参考约 ¥0.48，另加出流量 |
| Qwen 固定快照，北京，输入≤32K | 输入 `¥1/百万 tokens`，输出 `¥10/百万 tokens` | 应用层仍硬锁总额 ¥20；不依赖免费额度 |
| ActionTrail | 默认保存最近 90 天管控事件；数据事件默认不开启 | 本阶段不做付费长期投递 |

### 4.2 必须在控制台询价的项目

| 项目 | 为什么不能写死 | 下单/创建规则 |
|---|---|---|
| RDS PostgreSQL Serverless 北京实时价 | 官方公开计费案例使用杭州示例价，且明确“仅供参考，以实际出账为准”；北京可用区、折扣、存储类型会变化 | 用户必须在订单页核对；任何 Agent 不得代点支付/确认 |
| SLS 实际月费 | 与原始写入量、计费模式、索引和 30/90 天留存有关 | 创建前确认按量；限制索引；首日查看用量 |
| OSS 请求与公网下行 | 取决于调用次数、图片大小和 Qwen 拉图行为 | 5 张 canary；14 天 lifecycle；不开放公共读 |
| NAT CU | 与连接数、流量和吞吐有关 | 仅 24 小时 canary 窗口；结束即释放 |
| 百炼优惠/免费额度 | 活动和账号资格会变化 | 预算计算按原价；免费额度只当额外余量 |

### 4.3 预算闸门

- **基础设施月度预算上限：¥300**，告警为 ¥150 / ¥240 / ¥300。
- **Qwen canary 独立硬上限：¥20**，5 张、15 请求、并发 1。
- 预算告警不是自动停机；执行台账必须记录：
  - RDS 实时订单页报价；
  - NAT/EIP 创建时间和最晚释放时间；
  - 每日账单；
  - Qwen 原子计数器。
- 若控制台显示预计基础设施月费超过 ¥300：停止，不创建。
- 若 RDS 页面无法确认北京 Serverless 基础系列、0.5–1 RCU、20 GB、自动启停：停止，不改买普通 RDS。
- NAT/EIP 超过 24 小时未释放：立刻触发撤销 runbook。

### 4.4 参考场景，不是报价

官方 RDS 计费案例使用 `¥0.333/RCU/小时` 和 `¥0.0017/GB/小时`，但该案例是杭州且明确不是报价。仅用它做风险测算：

- 20 GB 存储持续一个月：约 `20 × 720 × 0.0017 = ¥24.48`。
- 0.5 RCU 每天活跃 8 小时：约 `0.5 × 8 × 30 × 0.333 = ¥39.96`。
- 若错误地让 1 RCU 整月不暂停：计算约 `1 × 720 × 0.333 = ¥239.76`，会明显压缩总预算。

因此自动暂停和关闭空闲连接是成本验收项，不是可选优化。

## 5. 依赖顺序

```text
授权/预算/数据治理
  → 资源组
  → VPC + vSwitch + 安全组
  → OSS + SLS
  → 用户核对并点击 RDS Serverless 订单
  → FC 运行角色
  → FC Web + Task（fixture）
  → OSS/RDS/FC 云端 smoke
  → 收紧 Operator 权限
  → 数据治理证据外审通过
  → 临时 NAT + EIP
  → 百炼固定模型 Key 受控注入
  → 5 张 Qwen canary
  → 撤销 Key + 释放 NAT/EIP + 核账
```

## 6. Definition of Done

### 基础设施 staging GO

- 所有资源在 `cn-beijing`、`visionqa-staging` 资源组和标签下。
- OSS 匿名访问失败；BPA/SSE-OSS/14 天/1 天配置有脱敏证据。
- RDS 只有内网地址，0.5–1 RCU、20 GB、自动启停、无 `0.0.0.0/0`。
- FC fixture 健康检查、OSS/RDS smoke 通过；真实 Qwen 调用仍为 0。
- SLS App 30 天、Security 90 天，日志不含图片、Prompt、响应、Secret、签名 URL。
- Operator 的 Bootstrap 策略已被 Restricted 策略替换。
- 预算告警和撤销清单就绪。

### Qwen canary GO

除以上全部通过外，还必须：

- `ALIYUN-BAILIAN-DATA-001` 的保留、删除、训练使用、人工审核证据被外部审查接受；
- NAT/EIP 只在 24 小时窗口存在；
- Key 只允许固定模型和固定出口 IP；
- 5 张、15 请求、并发 1、¥20 硬门在网络调用前生效；
- 结束后撤销 Key、释放 NAT/EIP、核对账单。

### Production

始终 `NO-GO`，本计划不包含生产发布。

## 7. 官方依据（2026-07-29 核验）

- [OSS 北京 Endpoint](https://help.aliyun.com/zh/oss/user-guide/regions-and-endpoints)
- [OSS 存储费用](https://help.aliyun.com/zh/oss/storage-fees)
- [RDS PostgreSQL Serverless 创建参数](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/create-a-serverless-apsaradb-rds-for-postgresql-instance)
- [RDS Serverless 自动启停](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/configure-the-automatic-start-and-stop-feature-for-a-serverless-apsaradb-rds-for-postgresql-instance)
- [RDS Serverless 计费案例](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/pricing-of-serverless-apsaradb-rds-for-sql-server-instances)
- [FC 计费概述](https://help.aliyun.com/zh/functioncompute/billing-overview-of-fc)
- [SLS 计费概述](https://help.aliyun.com/zh/sls/billing-overview/)
- [SLS Logstore 配置](https://help.aliyun.com/zh/sls/manage-a-logstore)
- [ActionTrail 默认 90 天](https://help.aliyun.com/zh/actiontrail/product-overview/what-is-actiontrail/)
- [VPC 免费与收费功能](https://help.aliyun.com/zh/vpc/frequently-asked-questions)
- [NAT 网关计费](https://help.aliyun.com/zh/nat-gateway/nat-gateway-billing)
- [EIP 按量计费](https://help.aliyun.com/zh/eip/pay-as-you-go/)
- [qwen3-vl-plus 固定快照能力与价格](https://help.aliyun.com/zh/model-studio/qwen3-vl-plus)

