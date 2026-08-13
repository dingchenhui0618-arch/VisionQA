# VisionQA 阿里云 Staging Wave1 脚本实现报告 v0.3

> 日期：2026-07-29（Asia/Shanghai）  
> 状态：`READY_FOR_INDEPENDENT_QA / NOT_EXECUTED`  
> 云端资源、订单、模型调用：0

## 交付

- `handoffs/ALIYUN_STAGING_WAVE1_v0.3/`
- `handoffs/VisionQA_ALIYUN_STAGING_WAVE1_v0.3.zip`
- ZIP SHA-256：`B65E58C9028FDC69EBEC3D7BEDF76435A5123445C280E81CE753A17E22E51D3D`
- RAM 策略保持 v0.2.1，未扩大。

## v0.2 QA P0/P1 修复

1. 预算门绑定包内实际 Owner 批准 artifact，固定 SHA `F82A...CE39`，并核验 `STG-BUDGET-001=APPROVED/APPROVE`；不接受任意 64 位输入。
2. ledger 改为 append-only，Preflight 不再截断；每批固定 `batch_id`，每次使用随机唯一 `run_id`；未完成旧 run 会阻止新 run。
3. 权限 600 的 run manifest 保存真实资源 ID；每次更新生成 SHA checkpoint 并写 ledger。rollback 同时核验 run/batch、manifest SHA、真实 ID SHA、`CREATED`、区域、资源组、固定名称、四标签和配置。
4. NotFound 使用结构化错误码白名单：`NoSuchBucket`、`ProjectNotExist`、`LogStoreNotExist`、`ResourceNotFound`、`EntityNotExist`；403、超时、非 JSON 和未知错误 fail-closed。
5. 所有标签检查包含 `owner=dingchenhui`。
6. OSS/SLS/FC 都回读 Resource Group；缺失或不一致停止。
7. 依赖检查覆盖 `zip/base64/mktemp/cut/stat/od/tr/date/chmod`。
8. Preflight 要求 Aliyun CLI v3，并对脚本每个 Action 执行只读 `help` 解析，不发起云写。

## 本地测试

- 四个执行脚本 `bash -n`：PASS。
- 禁止动作扫描：PASS。
- 回归扫描（旧 NotFound 正则、三标签、v0.2 状态目录、ledger 截断）：PASS。
- ledger/rollback 状态攻击模拟：5/5 PASS，覆盖跨 run、跨 batch、错误资源 ID、checkpoint 不匹配和 manifest 篡改。
- 未执行任何 `aliyun` 命令。

## 版本状态

- v0.1：`SUPERSEDED_DO_NOT_RUN`
- v0.2：`SUPERSEDED_DO_NOT_RUN`
- v0.3：仅供独立 QA；QA GO 前禁止上传或执行。

