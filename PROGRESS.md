# PROGRESS

> 历史执行记录。当前状态请以根目录 [`PROJECT_STATE.md`](./PROJECT_STATE.md) 为准。

## 当前目标

在没有真实客户素材的前提下，完成可评审、可实现、可验证的 VisionQA 第一阶段规格。

## 已完成

- 项目策划书 v0.1 评审；
- 冻结首个场景：服饰电商 AI 模特商品图质检；
- 多 Agent 职责、交接和验收规则；
- 缺陷分类 taxonomy v0.1；
- PASS / REVIEW / REJECT 发布门禁 v0.1；
- provider-neutral 评估结果 JSON Schema；
- 评估结果示例；
- 离线技术验证计划；
- 双人独立标注与分歧裁决协议；
- 12 条模拟 case manifest；
- baseline 与 Go / No-Go 计划；
- 策划书 v0.2 执行版；
- 真实客户素材获取规范；
- 外部产品名暂缓，VisionQA 仅作内部代号。
- TECH-001 最小离线评测执行器：
  - provider-neutral `Evaluator` Protocol；
  - 无外部 API、无密钥的 `SimulationEvaluator`；
  - 模型观察层与确定性规则决策层分离；
  - `evaluate-dataset` CLI；
  - JSONL 运行产物；
  - 12 条 simulation case 合同测试。
- TECH-002 离线验证与静态报告：
  - `validate-manifest` 检查 JSONL、唯一 case ID、必填字段和 taxonomy 精确代码；
  - `render-report` 生成单文件静态 HTML 批次报告；
  - 报告包含分流汇总、逐 case 观察证据和不可移除的 simulation 警示；
  - 动态内容进行 HTML 转义。

## 正在进行

- 全项目文档一致性校验；
- 等待真实素材后开展模型观察能力验证与阈值标定。

## 下一步

1. 为模型失败状态补充独立合同夹具；
2. 真实素材到位后建立试标集与盲测集；
3. 接入首个真实 evaluator adapter 前进行隐私、成本与日志评审；
4. 使用真实多人标注重新标定阈值。

## 最大风险

当前没有真实客户素材和实际审核基线，因此所有严重度边界、置信度阈值与效果指标仍是假设。

## TECH-001 实际验证记录（2026-07-28）

本次运行完全基于 `datasets/simulation_manifest_v0.1.jsonl` 中的人造预期观察，只验证合同、控制流与门禁逻辑，不代表模型准确率、召回率或商业可用性。

### 测试命令

```powershell
$env:PYTHONPATH='D:\VisionQA\src'
python -m unittest discover -s tests -v
```

实际结果：

```text
Ran 8 tests in 0.029s
OK
```

测试覆盖全部 12 条 simulation case，并单独验证：

- Blocker 不被其他维度软分抵消；
- 信息不足进入 `REVIEW`；
- 模型观察层不包含发布决策；
- 门禁引用的 observation 均存在；
- 输出 JSONL 可逐行解析；
- 模拟执行成本标记为 `NOT_APPLICABLE`。

### CLI 命令

```powershell
$env:PYTHONPATH='D:\VisionQA\src'
python -m visionqa.cli evaluate-dataset `
  --manifest datasets\simulation_manifest_v0.1.jsonl `
  --output runs\tech-001\evaluation-results.jsonl `
  --dataset-version simulation-0.1
```

实际结果：

```json
{"count": 12, "decisions": {"PASS": 1, "REJECT": 6, "REVIEW": 5}, "run_id": "run_20260728T053234Z"}
```

附加解析检查：

```text
JSONL_PARSE_OK 12
DECISIONS {'PASS': 1, 'REVIEW': 5, 'REJECT': 6}
MODEL_DECISION_FIELDS 0
OVERALL_SCORE_NON_NULL 0
```

运行产物写入 `runs/tech-001/evaluation-results.jsonl`，`runs/` 已加入 `.gitignore`。

## TECH-002 实际验证记录（2026-07-28）

### 全量测试

```powershell
$env:PYTHONPATH='D:\VisionQA\src'
python -m unittest discover -s tests -v
```

实际结果：

```text
Ran 12 tests in 0.152s
OK
```

旧测试全部复跑通过；新增测试覆盖非法 taxonomy issue code、重复 `case_id`、HTML 动态内容转义，以及 simulation 报告不得冒充真实准确率。

### Manifest 校验

```powershell
python -m visionqa.cli validate-manifest `
  --manifest datasets\simulation_manifest_v0.1.jsonl
```

实际结果：

```json
{"count": 12, "simulation_only": true, "valid": true}
```

### 重新评估并渲染报告

```powershell
python -m visionqa.cli evaluate-dataset `
  --manifest datasets\simulation_manifest_v0.1.jsonl `
  --output runs\tech-002\evaluation-results.jsonl `
  --dataset-version simulation-0.1

python -m visionqa.cli render-report `
  --input runs\tech-002\evaluation-results.jsonl `
  --output runs\tech-002\batch-report.html
```

实际结果：

```text
evaluation: count=12; PASS=1; REVIEW=5; REJECT=6
report: count=12; PASS=1; REVIEW=5; REJECT=6; simulation_only=true
HTML_PARSE_OK 6858
SIMULATION_WARNING_PRESENT True
CASE_SECTION_COUNT 12
```

报告位于 `runs/tech-002/batch-report.html`。该报告只展示模拟合同和门禁控制流，不包含真实图片分析，也不提供任何模型准确率结论。
