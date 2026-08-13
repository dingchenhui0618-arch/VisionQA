# VisionQA 阿里云 Staging Wave1 脚本实现报告 v0.9

> 日期：2026-07-30（Asia/Shanghai）  
> 状态：`READY_FOR_INDEPENDENT_QA / NOT_EXECUTED`

## 交付

- `handoffs/ALIYUN_STAGING_WAVE1_v0.9/`
- `handoffs/VisionQA_ALIYUN_STAGING_WAVE1_v0.9.zip`
- ZIP SHA-256：`88ACBC7336CC4BE60E72F97F2F77A4AC454C39829DAE637C74200304FC7BE067`

## v0.8 真实 Preflight 阻断修复

- modern/legacy 双链仅在 ID、Secret、SecurityToken 三项均非空且逐字节相同时允许；
- 双链通过后只保留 modern 链并 unset legacy；
- 完整 legacy-only 临时 STS 会规范化为 modern 链；
- 任一字段缺失、空值或不一致均 fail-closed；
- profile、metadata、额外 session-token 变量均 fail-closed；
- 固定 `ALIBABA_CLOUD_IGNORE_PROFILE=TRUE` 后以同一链验证批准身份；
- 不打印凭证或原始 STS 返回。

## 本地结果

- 凭证门/镜像链/profile：23/23 PASS；
- 状态路径：8/8 PASS；
- I/O 故障：6/6 PASS；
- Manifest/ledger 攻击：5/5 PASS；
- Bash 语法与包内 SHA：PASS。

## Gate

- v0.1–v0.8：`SUPERSEDED_DO_NOT_RUN`
- v0.9：`READY_FOR_INDEPENDENT_QA / NOT_AUTHORIZED_FOR_CLOUD_EXECUTION`
- 新增云资源、费用、模型调用、Key：0
