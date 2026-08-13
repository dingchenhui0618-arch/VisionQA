# VisionQA 当前最小审批摘要

> 权限只读 readiness：`PASS`  
> 当前动作：仅等待 Owner 决定；尚未创建资源、未下单、未调用模型。

## A. 现在可以先创建的基础层

等待你批准后，可以先创建：

- `cn-beijing` 独立资源组；
- VPC、vSwitch、安全组；
- 私有 OSS（14 天删除、未完成分片 1 天清理）；
- SLS 应用日志 30 天、安全日志 90 天；
- fixture 模式 FC Web + Task（并发 1、最大实例 1）。

这一组：

- 不触发 RDS 订单；
- 不创建 NAT/EIP；
- 不创建百炼 Key；
- 不上传真实图片；
- 不运行 Qwen。

VPC、vSwitch、安全组本身免费；OSS、SLS、FC 是按量服务，可能产生小额用量费，因此仍受基础设施月预算约束。

## B. RDS 必须单独停下来让你确认

RDS PostgreSQL Serverless 会产生持续的存储费用，运行时还会产生 RCU 费用。

计划规格：

- 北京区；
- Serverless 基础系列；
- 0.5–1 RCU；
- 20 GB；
- 自动启停；
- 仅 VPC 内网；
- 按量付费。

执行 Agent 只能把配置和脱敏实时报价展示给你。最终订单必须由你亲自核对并点击；本次批准不等于批准 RDS 下单。

## C. 继续 HOLD

以下两项现在不执行：

- NAT + EIP 固定出口；
- Qwen `qwen3-vl-plus-2025-12-19` 真实 canary。

它们要等 `ALIYUN-BAILIAN-DATA-001` 数据治理证据通过外部审查后，再单独申请批准。未来 canary 仍固定为 5 张、最多 15 请求、并发 1、模型费用硬上限 ¥20，NAT/EIP 最长存在 24 小时。

## 可复制批准句

```text
批准先创建 VisionQA 阿里云 cn-beijing 非RDS基础资源，基础设施月预算上限为人民币300元；允许创建资源组、VPC、vSwitch、安全组、私有OSS、SLS和fixture模式FC。RDS仅准备报价，不授权下单，最终订单由我亲自确认；NAT/EIP和Qwen继续HOLD。
```

