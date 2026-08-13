# VisionQA 国产模型 Canary Dataset Ops 报告 v0.1

日期：2026-07-29  
角色：国产模型 Canary Dataset Ops Agent  
执行状态：数据准备完成，模型调用为 0

## 职责

把已冻结的 Phase 1 商业锚点整理为最小 5 张国产模型 canary，核对来源、授权、文件完整性、gold 标签和业务门禁；不负责 Provider 选型、账号开通、模型调用或生产放行。

## 输入

- 购买模板集合 manifest：`D:\VisionQA\datasets\commercial_template_seed_v0.1\manifest.json`
- Phase 1 gold：`D:\VisionQA\datasets\commercial_template_seed_v0.1\anchor_gold_labels_v0.1.csv`
- 国产模型选型报告：`D:\VisionQA\agents\domestic_model_selection_report_v0.1.md`
- 指定样本：`CT-030 / CT-012 / CT-024 / CT-044 / CT-035`

## 输出

- 机器清单：`D:\VisionQA\datasets\domestic_provider_canary_v0.1\manifest.json`
- 人工对照表：`D:\VisionQA\datasets\domestic_provider_canary_v0.1\human_reference.csv`
- 运行与停止规则：`D:\VisionQA\datasets\domestic_provider_canary_v0.1\RUNBOOK.md`

## 核对结果

| 资产 | 本地存在 | 文件大小与 source manifest 一致 | SHA-256 已锁定 | rights 一致 | Gold 门禁 |
|---|---:|---:|---:|---:|---|
| CT-030 | 是 | 是 | 是 | 是 | APPLICABLE / MEDIUM / 86 |
| CT-012 | 是 | 是 | 是 | 是 | APPLICABLE / MEDIUM / 81 |
| CT-024 | 是 | 是 | 是 | 是 | APPLICABLE / MEDIUM / 83 |
| CT-044 | 是 | 是 | 是 | 是 | NOT_APPLICABLE / NO SCORE |
| CT-035 | 是 | 是 | 是 | 是 | NOT_ASSESSABLE / NO SCORE |

Rights 继承自同一个购买模板集合：允许内部研发和第三方模型测试，不允许再分发。5/5 的 source number、manifest asset id、文件大小和本地文件均一致。

## 测试覆盖

- `CT-030`：当前 gold 中相对高端但仍为 MEDIUM，不能把它误称为已存在的 HIGH 标杆；
- `CT-012`：信息密度和促销层级压力；
- `CT-024`：无模特产品平铺，防止虚构人体缺陷；
- `CT-044`：渠道不适用，必须无商业分；
- `CT-035`：主体条件不足，必须无商业分并进入不可评估或人工复核。

## 数据泄漏控制

Provider 仅接收匿名 run item、模板版本、schema、语言、统一 Prompt 和私有短期图片 URL。人工 gold、总分、六项分数、优缺点、证据、本地路径、原始文件名、rights 确认人、密钥与账户信息均不得进入请求。

本次没有复制任何原始图片或可编辑源文件，没有生成公开目录或公网 URL。

## 预算

预算仅保留公式占位。Provider、固定模型版本和官方单价尚未由治理流程冻结，因此没有伪造金额，也没有发起试调用。运行前必须计算五张总成本并得到所有者批准。

## 验收结论

1. 5/5 source 与 rights manifest 一致：通过；
2. CT-044 与 CT-035 被锁定为 NO SCORE：通过；
3. 交付目录只包含 JSON、CSV、Markdown，不包含图片或可编辑/压缩源文件：通过；
4. staging、私有短 URL、Provider/模型、数据治理、预算全部批准前禁止调用：通过；
5. 预算预估为显式占位且调用数为 0：通过。

结论：`CANARY_DATA_READY / EXECUTION_BLOCKED_BY_GOVERNANCE_GATES`。
