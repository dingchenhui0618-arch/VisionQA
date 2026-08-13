# 服饰电商 AI 模特商品图正反例采集规范 v0.1

> 状态：格式规范，尚未收集真实图片  
> 用途：规定未来正例、反例、边界例和修复对的采集与审阅方式  
> 禁止：虚构图片来源、商品事实、授权、标注一致性或模型表现。

## 1. 样例类型

每个 issue code 未来应采集：

- **正例**：该项没有问题，且证据足以确认；
- **反例**：清楚命中该 issue code；
- **边界例**：严重度或是否构成问题存在合理分歧；
- **信息不足例**：因参考、分辨率、遮挡或规范缺失而不可判断；
- **修复对**：同一候选在修改前后形成可比对样本。

每种类型的最低数量、品类比例和严重度分布均待真实客户素材验证。

## 2. 采集前提

每个真实样例必须：

- 有明确授权或内部使用许可；
- 记录候选图与参考图来源；
- 计算文件 SHA-256；
- 记录 SKU、品类、渠道和品牌 scope；
- 去除或受控保存个人敏感信息；
- 经双人独立标注和分歧裁决；
- 绑定 taxonomy、gates、rubric 与标注协议版本；
- 明确是否可用于训练、开发、测试、展示或对外发布。

未知来源的网络图片不得作为商品忠实度 gold example，也不得默认用于公开展示。

## 3. 推荐目录

```text
examples/
  assets/
    candidates/
    references/
  records/
  annotations/
  adjudications/
  thumbnails/
```

本规范不创建任何真实图片或占位图片。

## 4. 样例记录格式

建议每条样例使用 JSON 或 JSONL：

```json
{
  "example_id": "EXAMPLE-ID",
  "status": "PROPOSED",
  "example_type": "negative",
  "scenario": "fashion_ecommerce_ai_model_image",
  "garment_type": "womens_top",
  "candidate_asset": {
    "asset_id": "ASSET-ID",
    "sha256": "64位文件哈希",
    "path_or_uri": "受控资产引用",
    "rights_status": "AUTHORIZED_INTERNAL_ONLY"
  },
  "reference_assets": [
    {
      "asset_id": "REFERENCE-ID",
      "sha256": "64位文件哈希",
      "role": "front_product_reference"
    }
  ],
  "scope": {
    "product_fidelity": "VERIFIED",
    "brand_guideline": "LIMITED",
    "channel_requirements": "VERIFIED",
    "compliance": "VISUAL_SCREENING_ONLY"
  },
  "sku_invariants": [
    {
      "name": "示例不可变项名称",
      "expected": "权威参考值",
      "source_ref": "REFERENCE-ID"
    }
  ],
  "target_issue_codes": ["PF-03"],
  "expected_severity": "blocker",
  "expected_status": "detected",
  "expected_gate": "product_fidelity",
  "expected_decision": "REJECT",
  "evidence": {
    "region_label": "具体区域",
    "coordinate_space": "NORMALIZED_0_1",
    "bounding_box": {
      "x": 0.0,
      "y": 0.0,
      "width": 0.1,
      "height": 0.1
    },
    "observation": "只写可观察事实",
    "impact": "写明业务或发布影响"
  },
  "annotation": {
    "annotator_a_ref": "受控标签引用",
    "annotator_b_ref": "受控标签引用",
    "adjudication_ref": "裁决记录引用",
    "gold_status": "NOT_ADJUDICATED"
  },
  "versions": {
    "taxonomy": "0.1",
    "gates": "0.1",
    "rubric": "0.1",
    "annotation_protocol": "0.1"
  },
  "usage_permissions": {
    "development": true,
    "validation": false,
    "test": false,
    "external_display": false
  },
  "notes": "不得填写虚构结果"
}
```

以上仅为字段格式示例，不代表存在对应真实图片或已确认标签。

## 5. 必填元数据

### 资产与权利

- example ID；
- candidate asset ID、哈希和受控引用；
- reference asset ID、哈希和角色；
- 来源与授权状态；
- 可使用范围；
- 数据保留和删除要求。

### 业务上下文

- 品类：首批为 `womens_top` 或 `dress`；
- SKU 与不可变项；
- 品牌规范状态；
- 渠道、版位、尺寸；
- 合规平台与地区；
- 目标商品和模特的对应关系。

### 标签

- example type；
- issue code；
- category；
- severity；
- status；
- region；
- observation；
- impact；
- evidence refs；
- scope；
- expected gate 与 decision；
- A/B 原始标注和裁决结果。

### 版本

- taxonomy version；
- gates version；
- rubric version；
- annotation protocol version；
- dataset version。

## 6. 正例要求

正例必须有足够证据证明该维度通过，而不是“没有标出问题”：

- 商品忠实度正例必须有权威参考和不可变项；
- 文字 Logo 正例必须有品牌资产或权威文字；
- 合规正例只能表述为“在已提供规则范围内未发现风险”；
- 商业构图正例必须绑定渠道和版位；
- 无参考资料时不得建立商品忠实度或品牌符合性的正例。

一个图片可作为某 issue 的正例，同时包含其他类别问题；记录中必须明确目标 issue 和干扰项。

## 7. 反例要求

反例必须：

- 明确命中 taxonomy 中的有效 issue code；
- 提供可定位的视觉证据；
- 对事实类错误提供权威参考；
- 区分 Blocker、Major、Minor；
- 说明为什么相邻 issue code 不更适合；
- 不以夸张合成的“教科书错误”完全替代真实边界案例。

建议优先覆盖：

- `PF-01`、`PF-02`、`PF-03` 商品关键事实；
- `HI-01`、`HI-02`、`HI-03` 人体结构；
- `GM-01`、`GM-04` 服装结构与材质误导；
- `PP-01`、`PP-03` 光影与空间；
- `CC-01`、`CC-04` 商品展示与品牌冲突；
- `TL-01`、`TL-02` 品牌与商品文字；
- `CO-01` 至 `CO-05` 合规风险；
- `AS-01` 至 `AS-06` 可评估性与信息不足。

## 8. 边界例要求

边界例应记录：

- 分歧点；
- A/B 各自依据；
- 裁决结果；
- 是否暴露 rubric 缺口；
- 是否需要按品类、渠道或品牌新增规则；
- 标准更新后是否需重新标注。

边界例不能为了提高一致率被删除；它们是迭代 rubric 的核心资产。

## 9. 修复对要求

修改前后必须：

- 使用同一 SKU 和同一评估 scope；
- 明确只修改了哪些区域或生成条件；
- 保持不可变商品事实一致；
- 分别完成独立标注；
- 不因“后图是修复版”而预设其通过；
- 记录问题是否消失、是否引入新问题及最终门禁变化。

修复对可用于验证优化建议，但不得把“用户执行修改”直接等同于质量提升。

## 10. 采集与验收流程

1. 提交资产和授权信息；
2. 数据管理员完成哈希、去重和 scope 检查；
3. 双人独立标注；
4. 生成分歧清单；
5. 第三人裁决；
6. schema 与 issue code 校验；
7. 按 SKU、人物、生成批次分组切分；
8. 冻结版本；
9. 需要对外展示的样例另行审批。

样例数量、类别平衡、裁决一致性和纳入 gold set 的阈值均待真实素材验证。

## 11. 验证期发布限制

- 样例库只支撑审核辅助，不证明系统可自动发布；
- 所有系统 `PASS` 必须 100% 人工复核；
- 模拟案例、格式示例和未裁决样例不得计入真实准确率；
- 未经授权的图片不得进入外部演示、训练或公开数据集。

