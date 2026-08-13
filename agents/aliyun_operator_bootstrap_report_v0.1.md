# VisionQA 阿里云 Operator Bootstrap Agent 报告 v0.1

> 日期：2026-07-29  
> Agent：Aliyun Operator Bootstrap Agent  
> 结果：`PACKAGE_READY / NO_RESOURCE_CREATED / NO_COST_INCURRED`

## 职责

- 将已批准的阿里云授权 v0.2 转换为控制台可执行步骤；
- 为 `visionqa-staging-operator` 设计两阶段最小权限；
- 明确 MFA、无 AccessKey、无 IAM/账单提权和 staging-only 边界；
- 输出证据清单及可演练撤销流程；
- 不创建、修改或删除任何云资源。

## 输入

- `handoffs/ALIYUN_AUTHORIZATION_v0.2/README.md`
- `handoffs/ALIYUN_AUTHORIZATION_v0.2/authorization_decisions.csv`
- `handoffs/ALIYUN_AUTHORIZATION_v0.2/ram_permission_matrix.csv`
- `agents/aliyun_staging_architecture_v0.1.md`
- `agents/aliyun_auth_capability_report_v0.1.md`
- `web/aliyun-fc/RUNBOOK.md`

## 输出

- `handoffs/ALIYUN_OPERATOR_BOOTSTRAP_v0.1/README.md`
- `handoffs/ALIYUN_OPERATOR_BOOTSTRAP_v0.1/bootstrap_policy.json`
- `handoffs/ALIYUN_OPERATOR_BOOTSTRAP_v0.1/post_create_restricted_policy.json`
- `handoffs/ALIYUN_OPERATOR_BOOTSTRAP_v0.1/evidence_checklist.md`
- `handoffs/ALIYUN_OPERATOR_BOOTSTRAP_v0.1/revoke_runbook.md`

## 关键设计

1. Operator 只使用控制台 + MFA + Cloud Shell 临时会话；
2. Cloud Shell 仅 `CreateEnvironment`、`CreateSession`；
3. Bootstrap 是短时创建策略，Restricted 是创建后只读/清理策略；
4. `ram:PassRole` 仅限 `visionqa-staging-runtime` 到 `fc.aliyuncs.com`；
5. 显式拒绝 AccessKey、IAM 提权、BSS/Billing、RDS 公网、公开 OSS 和 FC 自定义域名；
6. OSS 对象写入只限 `staging/visionqa/*`；
7. RDS 订单不授予 Operator BSS 权限，由预算责任人最终人工确认。

## 已识别的云平台限制

阿里云官方 RAM 通用条件键不包含跨产品通用的 RequestedRegion。FC `CreateFunction` 为 `Resource:*` 且没有服务条件键，RDS/VPC 创建时也存在尚无真实 ARN 的阶段。因此没有虚构 `acs:RequestedRegion`，也没有声称策略可以单独证明所有创建请求都位于北京。

风险使用以下方式闭环：

- MFA；
- 短时授权窗口；
- 固定资源命名和资源组；
- 控制台/订单人工复核；
- 创建后用真实北京 ARN/ID 收紧；
- 外部证据检查；
- 随时可执行的撤销手册。

## 验收标准

- [x] 未创建任何云资源；
- [x] 未产生费用；
- [x] 未读取、输出或持久化 Secret；
- [x] 两份 Policy 均为合法 JSON；
- [x] Cloud Shell Action 与官方文档一致；
- [x] OSS、RDS、FC、SLS、RAM PassRole Action 均来自阿里云官方授权/API文档；
- [x] 没有发明 RequestedRegion 条件键；
- [x] 有创建期和创建后两阶段权限；
- [x] 有证据清单和撤销流程；
- [x] 用户完成后固定回复语已给出。

## Gate

```text
PACKAGE_READY = YES
JSON_SYNTAX = PASS
ALIYUN_RESOURCES_CREATED = 0
COST_INCURRED = 0
NEXT_USER_ACTION = CREATE_OR_CONFIRM_RAM_OPERATOR_AND_OPEN_CLOUDSHELL
```
