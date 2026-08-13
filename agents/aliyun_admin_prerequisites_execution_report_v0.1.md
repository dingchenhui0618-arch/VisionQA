# VisionQA 阿里云管理员前置执行报告 v0.1

> 执行日期：2026-07-30（Asia/Shanghai）  
> 范围：仅管理员前置、脱敏核验与状态收口；未执行 Wave1 资源创建。

## 执行结果

| 检查项 | 结果 | 说明 |
|---|---|---|
| 资源组 `visionqa-staging` | CREATED | 已创建，未产生付费资源 |
| FC Runtime Role `visionqa-staging-runtime` | VERIFIED | 复用既有角色；信任主体仅为 FC；附加权限为 0 |
| 自定义策略 `VisionQAStagingOperatorBootstrapV01` | DEFAULT_UPDATED | v0.2.3 对应的新策略版本已设为默认版本 |
| Operator 策略绑定 | OK | 指定自定义策略已绑定 |
| Operator AccessKey | ZERO | AccessKey 数量为 0 |
| 北京可用区证据 | PRIVATE_EVIDENCE_SAVED | 已写入受限私有证据文件；本报告不披露具体可用区 |
| Operator 虚拟 MFA | VERIFIED_BOUND | 2026-07-30 通过 RAM `ListVirtualMFADevices` 只读复验确认已绑定；未读取或输出二维码、种子及验证码 |

## 变更边界

本次仅发生两项云侧变更：

1. 创建免费管理对象资源组 `visionqa-staging`；
2. 为既有自定义策略创建新版本并设为默认版本。

未创建 OSS、RDS、FC 函数、NAT、EIP 或其他付费资源；未开通或调用 Qwen；未创建 AccessKey/API Key；未操作钱包、订单或生产环境。

## Gate

```text
ADMIN_PREREQUISITES=COMPLETE
OPERATOR_READINESS=READY_FOR_WAVE1_EXECUTION
WAVE1_MANUAL_EXECUTION=AUTHORIZED_NOT_STARTED
PAID_RESOURCES=NOT_CREATED
```

管理员前置 Gate 已闭环。该结论仅表示 Operator 已具备进入 Wave1 手工执行的前置条件，不表示 Wave1 已执行，也不表示已批准生产发布。

## MFA 复验记录

- 用户确认已完成 `visionqa-staging-operator` 虚拟 MFA 绑定；
- RAM API 只读复验结果：`MFA_VERIFY=BOUND`；
- 未读取、保存或输出 MFA 二维码、种子、动态验证码；
- 未创建资源、AccessKey/API Key，未发生付费或 Qwen 调用。
