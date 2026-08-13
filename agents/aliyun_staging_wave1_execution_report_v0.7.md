# VisionQA 阿里云 Staging Wave1 脚本实现报告 v0.7

> 日期：2026-07-30（Asia/Shanghai）  
> 状态：`READY_FOR_INDEPENDENT_QA / NOT_EXECUTED`

## 交付

- `handoffs/ALIYUN_STAGING_WAVE1_v0.7/`
- `handoffs/VisionQA_ALIYUN_STAGING_WAVE1_v0.7.zip`
- ZIP SHA-256：`07966CB55724F82C8232FBF39D8E82DC3DA313662E530EF69601A398D8629C4A`
- RAM 权限继续固定为 v0.2.3，未扩大。

## v0.6 QA 阻断修复

- 无 modern/legacy 临时 STS 环境凭证时默认拒绝；
- 不允许 CLI profile 或 metadata fallback；
- 仅允许同一变量族完整的 AccessKey ID、Secret 与非空 SecurityToken；
- 设置 `ALIBABA_CLOUD_IGNORE_PROFILE=true` 后，再以同一环境链调用 `GetCallerIdentity`；
- 验证 IdentityType 与 ARN 为指定 Operator RAM 会话或明确 Cloud Shell assumed-role；
- 无 Token、空 Token、假/过期 Token、身份不符、混合变量链全部 fail-closed；
- 不打印凭证或原始 STS 响应。

## 本地结果

- 凭证门：11/11 PASS；
- Bash 状态路径：8/8 PASS；
- I/O 故障：6/6 PASS；
- Manifest/ledger 攻击：5/5 PASS；
- Bash 语法、包内 SHA：PASS。

## Gate

- v0.1–v0.6：`SUPERSEDED_DO_NOT_RUN`
- v0.7：`READY_FOR_INDEPENDENT_QA / NOT_AUTHORIZED_FOR_CLOUD_EXECUTION`
- 新增云资源、费用、模型调用、Key：0
