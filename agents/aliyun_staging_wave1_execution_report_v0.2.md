# VisionQA 阿里云 Staging Wave1 脚本实现报告 v0.2

> 日期：2026-07-29（Asia/Shanghai）  
> 云端执行：0  
> 状态：`READY_FOR_INDEPENDENT_QA / NOT_YET_GO`

## 交付

- `handoffs/ALIYUN_STAGING_WAVE1_v0.2/`
- `handoffs/VisionQA_ALIYUN_STAGING_WAVE1_v0.2.zip`
- ZIP SHA-256：`8E867B0567823FD93DC150952D391972C3D8D37123ABA5940B69166816AE4923`
- 对齐 RAM 策略：`ALIYUN_OPERATOR_BOOTSTRAP_v0.2.1`
- RAM 策略 SHA-256：`0F952991527B0C2138014BFA74B9261406BF0E850EA159F90C52C116DEDEAF5F`

## v0.1 QA 修复

- v0.1 已标记 `SUPERSEDED_DO_NOT_RUN`。
- 删除 ACL 修改动作；依赖新 Bucket 默认 private 并回读验证。
- 设置并验证 BPA、SSE-OSS AES256、14 天对象/1 天分片生命周期。
- 使用精确标签 API；FC 回读采用官方 `ListTaggedResources`，SLS 采用 `ListTagResources`。
- FC 实例并发 1、`reservedConcurrency=1` 作为最大按量实例门、Provision target 0。
- 统一固定命名、资源组和四标签。
- 预算门要求 ¥150/¥240/¥300 告警证据 SHA-256，缺失即停止；不请求 BSS 权限。
- 前置 Role ARN 隐藏输入并保存为权限 600 文件，不打印、不写 shell history。
- Describe-before-create；NotFound 与权限/超时/未知错误分离。
- JSONL ledger 记录创建/复用、资源 ID 哈希和部分失败。
- 回滚只删除 ledger 标记为本批创建且标签重新验证的资源；任何删除失败立即停止。

## 本地验证

- 4 个 Shell 脚本 `bash -n`：PASS。
- 禁止动作静态扫描：PASS。
- 回归扫描：未发现 ACL 修改、RDS/NAT/EIP/模型/AccessKey/BSS、全网入站、递归 OSS 删除、吞掉删除错误。
- 未用真实 Cloud Shell CLI 执行写命令；所有云端资源、订单、模型调用仍为 0。

## 待独立 QA

独立 QA 仍需核对 Cloud Shell 当前 CLI 对 OSS/SLS/FC 参数形态的兼容性、RAM v0.2.1 Action 与脚本调用的一致性、ledger/rollback 语义以及预算门。复审 GO 前禁止运行 apply。

