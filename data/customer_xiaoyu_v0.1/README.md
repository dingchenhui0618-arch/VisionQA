# customer_xiaoyu_v0.1

这是 87 张客户提供服饰商业素材的脱敏只读盘点目录，不包含原图副本。

当前状态：

- `INVENTORIED`
- `LOCAL_ONLY`
- `PENDING_REVIEW`
- `SPLIT_PROPOSED_NOT_MATERIALIZED`

## 文件

- `asset_manifest.csv`：逐文件脱敏清单、完整性信息、初步类型和建议拆分。
- `inventory_report.md`：统计、方法、风险与数据治理说明。

## source_alias

`source_alias` 使用 `xiaoyu/<SHA-256前16位>.jpg`，用于在项目文档中稳定引用素材，同时避免暴露原始文件名和绝对路径。它不是可直接访问的文件路径。

后续 Agent 如需核验原图，必须通过经授权的本地解析流程，以完整 SHA-256 对照原始素材；不得从本目录推断、记录或传播原始绝对路径。

## 清单字段

| 字段 | 含义 |
|---|---|
| `asset_id` | 本批次内部稳定编号 |
| `source_alias` | 脱敏来源别名 |
| `source_type` | `customer-provided` |
| `usage_scope` | 当前获准用途：内部 VisionQA 评估/benchmark |
| `external_transfer_policy` | 外传策略；当前必须经过治理门 |
| `extension` / `mime_type` | 文件格式 |
| `bytes` / `width` / `height` / `aspect_ratio` | 基础媒体属性 |
| `sha256` | 完整文件 SHA-256 |
| `decode_status` | 本地解码检查结果 |
| `exact_duplicate_group` | 完全重复组；空值表示未发现 |
| `initial_asset_type` | 初判为含模特或商品静物 |
| `classification_status` | 分类是否完成人工复核 |
| `shoot_group` | 初步拍摄系列分组 |
| `proposed_split` | 建议用途集合 |
| `split_status` | 拆分是否实际执行 |

## 使用约束

允许：

- 在本地按清单做人工复核、标注方案设计和 benchmark 规划。
- 使用 SHA-256 做只读一致性核验。

禁止：

- 修改、移动或覆盖原始素材。
- 将 `EVALUATION_HOLDOUT` 用于训练或提示词调优。
- 未经既有治理与运行审批，将原图或可还原内容上传到 Qwen、云存储或其他外部服务。
- 把当前初判分类或“优秀素材”背景当成已验证 ground truth 或商业绩效证据。

