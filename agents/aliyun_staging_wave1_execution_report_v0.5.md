# VisionQA 阿里云 Staging Wave1 脚本实现报告 v0.5

> 日期：2026-07-29（Asia/Shanghai）  
> 状态：`READY_FOR_FINAL_INDEPENDENT_QA / NOT_EXECUTED`  
> 云资源、订单、模型调用：0

## 交付

- `handoffs/ALIYUN_STAGING_WAVE1_v0.5/`
- `handoffs/VisionQA_ALIYUN_STAGING_WAVE1_v0.5.zip`
- ZIP SHA-256：`6DDE75FD3B55CFEACF54024B72A03B34E45E4FA953989BEE3BE0BC34EBA914D0`
- RAM 策略：`ALIYUN_OPERATOR_BOOTSTRAP_v0.2.3`
- 策略 SHA-256：`E1DC84A67BC78723AC571D887A700031080F293FFBC53834466426B7FBC8F554`

## v0.4 QA 修复

1. Rollback 使用可恢复两阶段提交：持久化并回读 `ROLLBACK_COMMITTING` → 原子 rename active-run → fsync 状态目录 → 持久化并回读 `ROLLBACK_COMPLETE` → 清理 tombstone。
2. Ledger append、fsync、rename 或 COMPLETE append 失败时，始终保留 active-run 或 durable COMMITTING 恢复锚点；重试直接完成终态，不重复删除云资源。
3. 新增真实 Shell I/O 故障注入：append 失败、fsync 失败、rename 失败、COMPLETE append 失败后恢复、COMPLETE fsync 失败后恢复，共 6/6 PASS。
4. RAM v0.2.3 删除未使用只读 Action；FC `ListFunctions` 单独只读通配，所有 FC 变更/删除仅限两个固定函数 ARN。
5. Action inventory 与策略自动比对通过，固定函数 scope 检查通过。

## 本地验证

- 七个 Shell 文件 `bash -n`：PASS。
- Bash 状态路径：8/8 PASS。
- I/O 故障注入：6/6 PASS。
- Manifest/ledger 攻击：5/5 PASS。
- Action 与 FC scope：PASS。
- 禁止动作静态扫描：PASS。
- 未执行任何 `aliyun` 命令。

## 版本

- v0.1–v0.4：`SUPERSEDED_DO_NOT_RUN`
- v0.5：仅供最终独立 QA，QA GO 前不得上传或执行。

