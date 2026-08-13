# VisionQA 受控负例实现盘点报告 v0.1

更新时间：2026-07-29  
执行角色：Dataset Ops / Controlled Negative Implementation Agent  
状态：`PLAN_ONLY_AWAITING_EXTERNAL_APPROVAL`

## 1. 实际产物盘点

| 项目 | 实际数量 | 状态 |
|---|---:|---|
| 受控负例图片 | 0 | 未生成 |
| parent / variant 配对 | 0 | 未建立 |
| manifest 记录 | 0 | 未建立 |
| SHA-256 / perceptual hash | 0 | 未计算 |
| 视觉 QA 记录 | 0 | 未执行 |
| 外部审查图片 | 0 | 无可提交图片 |
| 外部审查计划包 | 1 | 已完成 |
| 拟议单变量规格 | 8 | 待外部批准 |

本轮没有修改、覆盖或重新编码任何原始 JPG、RAR 或 PSD。

## 2. 已执行的合规检查

1. 完整读取 `imagegen` skill，确认图片编辑应使用内置图像编辑路径，不能用不合规的本地替代方式冒充模型编辑。
2. 只读核对：
   - `D:\VisionQA\agents\data_evaluation_lead_mvp_plan_v0.1.md`
   - `D:\VisionQA\datasets\data_acquisition_high_low_brief_v0.1.md`
   - `D:\VisionQA\datasets\commercial_template_seed_v0.1\manifest.json`
   - `D:\VisionQA\datasets\commercial_template_seed_v0.1\README.md`
   - 三张 53 套购买模板 contact sheet
3. 确认素材身份是购买的可编辑模板，许可范围包含内部研发和第三方模型测试，但不允许公开再分发，也不得称为真实客户失败案例。
4. 确认数据评测 Lead 规定的交付顺序是：先提交 parent 候选和单变量操作表，外部创意审查批准后才允许修改 PSD。

## 3. 阻塞原因

### B1：缺少外部创意审查前置批准

`data_evaluation_lead_mvp_plan_v0.1.md` 的 Wave D1 明确规定：

> 受控负例制作 Agent 只提交制作计划和 parent 候选；外部创意审查批准计划后才允许修改 PSD。

当前没有收到 parent / 操作表的外部批准。直接制作图片会破坏预先审查与盲评纪律，因此没有越权生成样本。

### B2：本地图像依赖不可用

系统 Python 环境缺少 Pillow。尝试加载 Codex 工作区依赖时调用长时间未返回，随后被 CTO 中断。没有改用未经批准的脚本写图方式，也没有伪造图片产物。

## 4. 当前文件系统状态

以下目录已经创建，但均为空，应视为占位目录而不是交付物：

- `D:\VisionQA\datasets\commercial_controlled_negatives_v0.1`
- `D:\VisionQA\scripts`
- `D:\VisionQA\handoffs\controlled_negative_plan_review_v0.1`

目录状态：`NOT_STARTED_EMPTY_PLACEHOLDER`

## 5. 单变量校验状态

未生成图片，因此以下验收全部为 `NOT_RUN`：

- 每张仅一个主要商业失败；
- parent 与 variant 内容锁定；
- 商品事实、人体、材质和价格事实未新增问题；
- 目标子指标预期降分；
- 非目标指标联动限制；
- 移动端缩略图可判读；
- 双人盲评；
- 外部创意总监接受 / 返工 / 作废。

## 6. 恢复执行所需输入

1. 外部创意审查员对 parent 候选和操作类型的明确批准记录；
2. 可用的合规图像编辑工具，或恢复正常的内置 `image_gen` 编辑调用；
3. 如必须使用 PSD 图层级编辑，需要可操作 PSD 的合规编辑环境；
4. CTO 明确解除“不要继续生成新图片”的当前指令。

## 7. 对外声明边界

当前不能声称：

- LOW 受控负例已完成；
- 已通过单变量验证；
- 已有可用于 B1 基准的 variant；
- 已完成视觉 QA 或外部审查。

准确表述是：

> 受控负例制作已完成 8 个 parent / 单变量操作的外部前置审查计划；原始素材未改动，尚无图片、正式 manifest 或 QA 产物。

## 8. 外部审查前置包

已完成（提案版本 `0.1.1`）：

- `D:\VisionQA\handoffs\controlled_negative_plan_review_v0.1\README.md`
- `D:\VisionQA\handoffs\controlled_negative_plan_review_v0.1\proposed_variants.csv`
- `D:\VisionQA\handoffs\controlled_negative_plan_review_v0.1\external_review_checklist.md`

本批提出 8 个唯一 parent 和 8 个主要失败方向：

| variant | parent | 唯一主要失败 | 目标子指标 |
|---|---|---|---|
| CN-001 | CT-042 | 商品主体过小 | `product_subject_prominence` |
| CN-002 | CT-003 | 促销遮挡商品 | `product_subject_prominence` |
| CN-003 | CT-015 | 删除具体卖点且不新增事实 | `selling_point_clarity` |
| CN-004 | CT-005 | 关键卖点过小 | `mobile_readability` |
| CN-005 | CT-019 | 价格优惠视觉同权 | `promotion_hierarchy` |
| CN-006 | CT-022 | 仅重排既有优惠为视觉同权 | `promotion_hierarchy` |
| CN-007 | CT-037 | 安全区破坏 | `placement_fit` |
| CN-008 | CT-014 | CTA 弱化 | `click_motivation` |

图片制作仍未获授权。只有 `proposed_variants.csv` 中被外部审查员标为 `ACCEPT` 的行可以进入下一阶段。

QA 修订记录：

- P1：CN-003 已移除“新品 / 舒适 / 品质”等替代文案，改为仅删除具体卖点文字并保留图标与空容器；
- P1：CN-006 已禁止复制优惠券，改为只重排既有优惠券卡片与底部满减条，不增加元素数量；
- P2：每行 `source_rights_ref` 已固定到 manifest 绝对路径、版本和 SHA-256；
- P2：已增加 `source_asset_id`，保留 `commercial-seed-XXX` 与 `CT-XXX` 双 ID 映射；
- 审计字段：已增加 `proposal_version / proposed_by / created_at / external_reviewer_role`。

## 9. 计划文件校验

校验时间：2026-07-29

- CSV 可被 PowerShell `Import-Csv` 正常解析；
- 记录数：8；
- `variant_id` 唯一数：8；
- `parent_asset_id` 唯一数：8；
- 8/8 JPG preview path 存在；
- 8/8 RAR source archive path 存在；
- 8/8 `production_status=PLAN_ONLY_AWAITING_EXTERNAL_APPROVAL`；
- 8/8 `source_asset_id` 与 seed manifest 原始 entry 及 preview path 匹配；
- 8/8 `source_rights_ref` 包含 manifest 绝对路径、`manifest_version=0.1.0` 与 SHA-256；
- 8/8 提案审计字段完整；
- CN-003 已验证 `add_replacement_copy=false`；
- CN-006 已验证 `duplicate_count=0`；
- 受控负例数据目录文件数：0；
- 原图与 PSD 未修改。
