# VisionQA 阿里云 Staging Wave1 脚本实现报告 v0.4

> 日期：2026-07-29（Asia/Shanghai）  
> 状态：`READY_FOR_INDEPENDENT_QA / NOT_EXECUTED`  
> 云资源、订单、模型调用：0

## 交付

- `handoffs/ALIYUN_STAGING_WAVE1_v0.4/`
- `handoffs/VisionQA_ALIYUN_STAGING_WAVE1_v0.4.zip`
- ZIP SHA-256：`C54598DE6C823C7F84EDACAAE49645C062C6EB583249DFFE3CC7D0C1491D034E`
- RAM 策略：`ALIYUN_OPERATOR_BOOTSTRAP_v0.2.2`
- 策略 SHA-256：`6640A084568021175EA69D4829754CDC54CE011E2AAA3F7FE6713AA3038819F7`

## v0.3 QA 修复

1. Preflight 使用候选 prelog；CLI/help、STS、输入、预算和全部漂移门通过，manifest/context 成功生成后，才原子写 `active-run` 并一次追加 ledger。任意失败清理候选状态，不留下未终结 run。
2. Rollback 失败由 EXIT 状态机追加 `ROLLBACK_FAILED` 并保留 `active-run`，允许修复后重试；成功移除匹配 active run 并追加 `ROLLBACK_COMPLETE`。
3. 新增真实 Bash 状态路径测试：Preflight 失败可重跑、部分 apply、manifest 缺失、rollback 失败、失败重试、成功终结、交付脚本顺序检查，共 8 项。
4. 保留原 5 项 manifest/ledger 绑定攻击测试。
5. Action inventory 与 RAM v0.2.2 自动比对：脚本未调用未授权 Action；策略 v0.2.2 仅减权限。

## 本地验证

- 五个 Shell 文件 `bash -n`：PASS。
- Bash 状态路径：8/8 PASS。
- Manifest/ledger 攻击：5/5 PASS。
- Action 对齐：PASS。
- 禁止动作静态扫描：PASS。
- 未执行任何 `aliyun` 命令。

## 版本

- v0.1/v0.2/v0.3：`SUPERSEDED_DO_NOT_RUN`
- v0.4：仅供独立 QA，QA GO 前不得上传或执行。

