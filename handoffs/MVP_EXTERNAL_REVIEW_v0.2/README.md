# VisionQA MVP 外部审查包 v0.2

审查目标：判断 VisionQA 是否能进入受控客户验证，而不是判断它是否可以生产发布。

## 审查人员必须收到的材料

| 材料 | 作用 |
|---|---|
| `D:\VisionQA\web\` | 可运行 MVP、测试和实现。 |
| `D:\VisionQA\agents\mvp_closure_engineering_report_v0.2.md` | 工程实现与验收边界。 |
| `D:\VisionQA\agents\mvp_release_qa_report_v0.2.md` | 内部 QA 裁决与已知限制。 |
| `D:\VisionQA\agents\customer_discovery_v0.1\` | ICP、替代方案、WTP 假设、访谈脚本和 14 天节奏。 |
| `D:\VisionQA\contracts\`、`D:\VisionQA\standards\` | 输出契约、评分、门禁和分类标准。 |
| `D:\VisionQA\data\customer_xiaoyu_v0.1\README.md` | 87 张客户素材的只读治理与限制。 |
| `external_review_checklist.md` | 必测项目和裁决标准。 |
| `external_review_decisions.csv` | 审查结论记录表。 |

## 外部审查操作顺序

1. 在 `D:\VisionQA\web` 运行 `npm test`，预期 55 项通过。
2. 本地启动页面，选择一张非敏感演示图片。
3. 保持 AI 来源未知，确认高分 Fixture 仍降级为 `REVIEW`。
4. 复制修复 Prompt，确认人工结论，复制试点指标。
5. 审查者必须确认页面从未把 Fixture 回放说成模型推理。
6. 审查 Customer Discovery 资产，确认所有 WTP 都是低置信度假设而非销售事实。
7. 在 `external_review_decisions.csv` 中逐项写 `GO / NO_GO / CONDITIONAL` 和证据。

## 外部审查后的唯一决策

- `GO_FOR_DISCOVERY`：可以联系合格客户，用受控演示验证痛点和付费意愿。
- `CONDITIONAL`：先修复具体 P0/P1，再复审。
- `NO_GO`：停止对外演示，直到数据治理或结果披露问题解决。

生产发布、真实模型 canary 和任何自动发布均不在本外审包授权范围内。
