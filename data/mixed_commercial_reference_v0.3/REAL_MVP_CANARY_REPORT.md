# VisionQA 真实 MVP Canary 报告 v0.3

日期：2026-08-03

## 结论

VisionQA 已从纯 Mock/Fixture 演示进入真实模型参与的本地 MVP：真实客户商业图片通过阿里云百炼 `qwen3-vl-plus-2025-12-19` 完成评测，返回四层 Skill、六项商业维度、确定性 Gate、证据和 Repair Prompt。

最终修复后的 5 张混合 canary 全部 HTTP 200，结构化结果成功率 5/5。

## 最终 5 张结果

| 资产别名 | 综合分 | Gate | 状态 | 说明 |
|---|---:|---|---|---|
| `gwang/6e977399dd360b69.jpg` | — | REVIEW | PARTIAL | 部分商业维度不可评，等待人工用途标签 |
| `gwang/700d190d8cf52b9e.jpg` | — | REJECT | PARTIAL | 存在确定性拒绝条件；上下文缺失未再错误降级 |
| `gwang/f5ddce3cb4b24e98.jpg` | — | REJECT | PARTIAL | 商业适配分仅 14.5，说明当前版位定义与素材用途不匹配 |
| `xiaoyu/d5b064961a59c36a.jpg` | 82 | REVIEW | SUCCEEDED | 四层 Skill 和六项商业指标均可计算，可作为首个真实评分样本 |
| `xiaoyu/fd7e3fb17988a2d7.jpg` | — | REJECT | PARTIAL | 商品图在当前“天猫促销主图”口径下触发拒绝/不可评项 |

完整脱敏响应位于 `live_results/response_01.json` 至 `response_05.json`；汇总位于 `live_results/canary_summary.csv`。

## 本轮修复

1. 模型输出包含说明文字、代码围栏、字符串分数或轻微字段漂移时，先进行安全归一化，再进入严格结构校验。
2. 缺少上下文只能把 PASS/普通 REVIEW 降为 REVIEW，不能把已确认 REJECT 弱化为 REVIEW。
3. 当参考声明和来源声明完整时，不再无条件清空综合分。
4. 大图先在本机生成临时压缩衍生图，调用结束后删除；原图不修改。

## 数据解释

“客户实际使用且审美优秀”是重要正向先验，但不是跨场景通用真值。本轮结果证明：生活方式摄影可以在人像真实、摄影真实、材质表现上优秀，同时不适合作为天猫促销主图。

下一阶段训练/校准前必须增加 `intended_placement`：

- `AESTHETIC_REFERENCE`
- `LIFESTYLE_CAMPAIGN`
- `PRODUCT_MAIN_IMAGE`
- `PLATFORM_PROMOTION_MAIN_IMAGE`
- `DETAIL_PAGE_IMAGE`

模型应先判断或读取目标用途，再使用相应评分模板。

## 验证

- `npm test`：70/70 PASS
- `npm run lint`：0 errors / 0 warnings
- 真实 Key：未输出、未写入仓库或报告
- 最终真实调用：5/5 HTTP 200

