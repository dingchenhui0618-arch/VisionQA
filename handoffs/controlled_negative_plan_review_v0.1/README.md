# VisionQA LOW 受控负例制作计划｜外部前置审查包 v0.1

提案版本：`0.1.1`  
状态：`PLAN_ONLY_AWAITING_EXTERNAL_APPROVAL`  
适用模板：`platform_promotion_main_image_v0.1`  
样本身份：购买模板的内部研发派生计划，不是真实客户失败，不包含真实投放效果证据。

## 本包目的

请外部创意总监 / 电商视觉专家在任何图片被修改前，审查 8 个 parent 与单变量操作是否：

1. 是真实、可理解的商业失败，而不是粗暴破坏；
2. 每张只引入一个主要商业失败；
3. 不改商品、人物、材质、价格数字、优惠条件等事实；
4. 有足够可能让目标商业子指标下降至少 10 分；
5. 不会大幅拖累未声明的其他商业子指标。

## 文件

- `proposed_variants.csv`：8 个候选变体的逐张规格与回填列；
- `external_review_checklist.md`：统一审查标准和签字区。

## 审查方式

1. 打开 `proposed_variants.csv`；
2. 对每行填写：
   - `external_review_decision`：`ACCEPT / REWORK / REJECT`
   - `external_review_comment`
   - `reviewer_name`
   - `reviewed_at`
3. 完成 `external_review_checklist.md` 的全局门禁检查；
4. 将两个文件原名返回项目组。

## 审查规则

- 只有 `ACCEPT` 的行可以进入图片制作；
- `REWORK` 必须先改规格再重新提交审查；
- `REJECT` 不制作；
- 审查员不得把“是否喜欢这个风格”当作商业失败结论；
- 如某操作可能改变商品事实、价格事实、人体、材质、品牌或优惠承诺，必须 `REJECT`；
- 不要求提前判断最终 LOW 分数，只判断失败机制是否成立、是否单变量、是否可审。

## 数据来源与审计

- 权利与素材 manifest：`D:\VisionQA\datasets\commercial_template_seed_v0.1\manifest.json`
- `manifest_version=0.1.0`
- manifest SHA-256：`55DE061924A4530DA278E59A7C6398B7180CA093842629563DD59829ADC556EE`
- `source_asset_id` 保留 manifest 中的 `commercial-seed-XXX` 原 ID；
- `parent_asset_id` 是项目评审阶段使用的 `CT-XXX` 映射 ID；
- 提案人：`Dataset Ops Controlled Negative Agent`
- 外部审查角色：外部创意总监或服饰电商视觉专家。

## 计划覆盖

本批共 8 个方向：

1. 商品主体过小；
2. 促销信息遮挡商品；
3. 删除具体卖点且不添加替代事实；
4. 关键卖点缩小；
5. 价格 / 优惠信息视觉同权；
6. 仅将既有优惠信息重排为视觉同权，不复制或新增优惠；
7. 关键促销内容进入裁切风险区；
8. CTA 弱化。

## 重要声明

本包没有图片产物、没有 LOW gold label，也没有证明任何模型已经具备商业准确率。完成外部批准后，制作 Agent 才能从 parent 的独立副本生成 `SYNTHETIC_CONTROLLED_NEGATIVE`，并进入双人盲评与视觉 QA。
