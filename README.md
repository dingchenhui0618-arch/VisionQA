# VisionQA（内部项目代号）

AI 生成商业视觉内容的发布前质量评估项目。

当前对外产品名待定。`准镜`与`VisualGate`已经淘汰，`VisionQA`仅作为内部代号。

> 每次审查项目进度，请先打开 [`PROJECT_STATE.md`](./PROJECT_STATE.md)。它是当前状态、风险、下一步和所需输入的统一入口。

## 当前阶段

当前处于核心产品逻辑纠偏、UI 原型与评测标准并行验证阶段。首要目标是验证：

> 在一个明确的商业场景内，系统能否同时完成硬门禁、0–100 质量评级、商业价值判断，并输出可执行的修复 Prompt。

## 文档入口

- `PROJECT_STATE.md`：统一项目状态、下一步、风险与所需输入
- `AI视觉质量评估系统_策划书_v0.1.md`：原始项目策划书
- `AI视觉质量评估系统_策划书_v0.2.md`：执行治理基线，评分部分已被纠偏决定覆盖
- `docs/08_核心产品纠偏决定_v0.1.md`：当前生效的产品纠偏基线
- `PROGRESS.md`：当前完成情况与下一步
- `BLOCKED.md`：待解决事项及是否阻塞
- `docs/00_总控与协作规则.md`：多 Agent 职责、交接和质量门禁
- `docs/01_需要创意总监提供的信息.md`：需要项目负责人补充的输入
- `docs/02_项目状态与任务台账.md`：当前任务、状态与交付物
- `docs/03_决策记录.md`：需要冻结和追溯的项目决策
- `docs/04_首轮素材获取规范.md`：向试点电商团队获取样本的清单与边界
- `docs/05_命名方案.md`：项目代号、对外产品名和备选名称
- `docs/06_技术验证计划.md`：离线验证架构、任务与验收
- `docs/07_批次审核工作流_PRD_v0.1.md`：未来 MVP 的批次审核流程与验收
- `standards/`：缺陷 taxonomy 与发布门禁
- `standards/rubric_v0.1.md`：可执行评分锚点与证据要求
- `standards/examples_spec_v0.1.md`：未来真实正反例的采集规范
- `contracts/`：结构化评估输出契约与示例
- `datasets/`：标注协议与模拟 case manifest
- `evals/`：baseline 和 Go / No-Go 计划

## 当前可运行能力

```powershell
$env:PYTHONPATH='D:\VisionQA\src'
python -m visionqa.cli validate-manifest --manifest datasets\simulation_manifest_v0.1.jsonl
python -m visionqa.cli evaluate-dataset --manifest datasets\simulation_manifest_v0.1.jsonl --output runs\local\evaluation-results.jsonl --dataset-version simulation-0.1
python -m visionqa.cli render-report --input runs\local\evaluation-results.jsonl --output runs\local\batch-report.html
python -m unittest discover -s tests -v
```

这些命令只验证模拟数据、输出契约和规则控制流，不代表模型准确率或商业效果。

## 当前原则

1. 首轮只选择一个垂直场景。
2. 先建立发布门禁、评分标准和测试集，再开发完整产品界面。
3. Agent 的结论必须落成文档、数据或测试结果，不能只存在于对话中。
4. 视觉标准的制定与有效性验证由不同角色负责。
5. 任何模型、Prompt、Skill 和数据集结果必须记录版本。
