# VisionQA 阿里云 Staging Wave1 脚本实现报告 v0.8

> 日期：2026-07-30（Asia/Shanghai）  
> 状态：`READY_FOR_INDEPENDENT_QA / NOT_EXECUTED`

## 交付

- `handoffs/ALIYUN_STAGING_WAVE1_v0.8/`
- `handoffs/VisionQA_ALIYUN_STAGING_WAVE1_v0.8.zip`
- ZIP SHA-256：`1CD010C14BF7BB7C89C04868C7F5EF9702A5E5CEA1348E262A7AFEE14E4F037B`

## v0.7 QA 阻断修复

- `ALIBABA_CLOUD_IGNORE_PROFILE` 固定为大小写敏感的 `TRUE`；
- 测试桩模拟 profile 优先级：未设、空值、小写 `true` 均会落到高权 profile 并被身份门拒绝；
- 仅精确 `TRUE` 使用完整临时 STS 环境链；
- 主流程会覆盖外部错误值为 `TRUE`，随后验证同一链的 IdentityType/ARN；
- 不打印凭证、原始 STS 响应或完整账号标识。

## 本地结果

- 凭证门与 profile 优先级：16/16 PASS；
- 状态路径：8/8 PASS；
- I/O 故障：6/6 PASS；
- Manifest/ledger 攻击：5/5 PASS；
- Bash 语法与包内 SHA：PASS。

## Gate

- v0.1–v0.7：`SUPERSEDED_DO_NOT_RUN`
- v0.8：`READY_FOR_INDEPENDENT_QA / NOT_AUTHORIZED_FOR_CLOUD_EXECUTION`
- 新增云资源、费用、模型调用、Key：0
