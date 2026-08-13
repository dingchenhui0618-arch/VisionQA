# VisionQA 阿里云 Staging 执行顺序 v0.1

> 当前状态：`PLAN_ONLY`。以下每一步都必须在上一步有脱敏证据后进行。

## Phase A：只读预检

1. 用 RAM + MFA 的 `visionqa-staging-operator` 打开 Cloud Shell。
2. 只读确认 Caller Identity、AccessKey 数量为 0、当前账号与北京地域可用。
3. 核对 `VisionQAStagingOperatorBootstrapV01` 已绑定，且无 FullAccess/BSS 权限。
4. 核对现有资源，避免名称、网段或配额冲突。
5. 不创建任何资源，不运行模型。

**停止条件**：身份不符、MFA 不成立、发现 AccessKey、FullAccess/BSS、非北京默认地域。

## Phase B：免费基础层

1. 创建/核对资源组 `visionqa-staging`。
2. 创建 `visionqa-staging-vpc`，CIDR `10.90.0.0/16`。
3. 根据北京 RDS Serverless 售卖页选择一个有库存的可用区，创建 `visionqa-staging-vsw-a`，CIDR `10.90.1.0/24`。
4. 创建 `visionqa-staging-sg`，不配置公网入站。

**证据**：地域、资源组、名称、CIDR、标签；不得截图 Token/Cookie。

## Phase C：低成本按量服务

1. 创建私有 OSS Bucket：
   - 标准存储 LRS；
   - Private + BPA；
   - SSE-OSS；
   - 版本控制关闭；
   - `staging/visionqa/` 当前对象 14 天删除；
   - 未完成 Multipart 1 天清理。
2. 创建 SLS Project 和两个 Logstore：
   - App 30 天；
   - Security 90 天；
   - 仅必要索引；
   - 按量。
3. 本阶段不上传真实图。

**停止条件**：Bucket 名不以 `visionqa-staging-` 开头、出现公共读写、生命周期不是 14/1、SLS 选择预付费。

## Phase D：RDS 人工订单闸门

1. 打开 RDS PostgreSQL Serverless 购买页。
2. 配置：
   - `cn-beijing`
   - PostgreSQL 16；无库存时 15/14
   - Serverless 基础系列
   - 0.5–1 RCU
   - 20 GB
   - 自动启停
   - 按量
   - 已创建的 VPC/vSwitch
   - 仅内网
3. 截取**不含任何凭据**的配置和实时价格。
4. 用户确认价格后亲自点击最终订单。
5. 实例完成后创建 `visionqa_staging` DB、迁移账号与最小权限应用账号。
6. 白名单仅精确 vSwitch 网段，不得 `0.0.0.0/0`。

**停止条件**：控制台配置与计划不一致、预计总月费超过 ¥300、需要包年包月、需要公网地址、Operator 被要求 BSS 下单权限。

## Phase E：FC Fixture 部署

1. 创建/核对 `visionqa-staging-runtime` 服务角色。
2. 创建：
   - `visionqa-staging-api`
   - `visionqa-staging-evaluation-task`
3. 使用现有规格：1024 MB、512 MB、并发 1、最大实例 1、预留 0。
4. 绑定 VPC、SLS 和运行角色。
5. 只部署 fixture 模式。
6. 执行 `/healthz`、`/readyz`、OSS 私有性、RDS 事务和日志脱敏 smoke。
7. 真实 Qwen 网络调用次数必须仍为 0。

## Phase F：权限收紧

1. 用真实 Bucket、RDS ID、SLS Project 替换 Restricted 策略占位符。
2. 绑定 `VisionQAStagingOperatorRestrictedV01`。
3. 解绑 Bootstrap 策略。
4. 运行只读审计。
5. 记录账单起始基线。

## Phase G：临时 Qwen canary（当前 HOLD）

只有数据治理证据外审接受后：

1. 临时重新授予经复核的创建权限。
2. 创建单可用区 NAT + EIP，记录最晚 24 小时释放时间。
3. 把固定 EIP 加入百炼 Key 白名单。
4. 管理员通过受控路径注入 Key；不传给 Agent。
5. 执行固定快照 `qwen3-vl-plus-2025-12-19`：
   - 5 张；
   - 最多 15 请求；
   - 并发 1；
   - ¥20 硬门。
6. 撤销 Key。
7. 释放 NAT/EIP。
8. 删除 canary 对象或等待 14 天 lifecycle，并核对账单。

## 回滚优先级

1. 关闭 live/Qwen gate。
2. 撤销百炼 Key。
3. 释放 NAT/EIP。
4. 停止/删除 FC。
5. 导出并释放 RDS。
6. 清空并删除 OSS/SLS。
7. 删除网络与资源组。

