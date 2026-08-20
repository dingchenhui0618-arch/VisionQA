# VisionQA interface system

## Intent

Monochrome studio review desk for apparel ecommerce. The interface recedes into black, white, and neutral gray so uploaded customer imagery carries the strongest color contrast.

## Flow signature

The fixed five-stage material track is the product signature: baseline SKU, review assets, quality review, repair review, marketing delivery. Each stage exposes input, evidence scope, current state, and next action.

## Tokens

- Canvas `#f4f4f4`; surface `#fbfbfb`; raised `#ffffff`.
- Ink `#111111`; muted `#5d5d5d`; faint `#6f6f6f`.
- Divider `rgba(17,17,17,.10)`; strong divider `rgba(17,17,17,.20)`.
- Primary action `#171717`; selected neutral `#ececec`.
- Success `#176b43`; warning `#8a5b08`; danger `#a33838` only for semantic state.
- Control radius 8px; panel radius 12px; space base 4px.

## Reusable patterns

- Login split: black product promise panel and white account panel; preview access is explicit and separate from real authentication.
- Workbench shell: persistent five-stage rail above 1024px, sticky horizontal stage navigation at and below 1024px.
- Dual baseline input: SKU links beside confirmed product-image references.
- Asset intake: one dominant neutral dropzone followed by real-color image tiles.
- Review desktop: gallery plus inspector, without a complex filter rail. Review mobile: gallery first, inspector in document flow.
- Repair review: provider adapter choices, exported job, before/after stage, and four human drift checks.
- Marketing delivery: pain-point evidence rows, creator profiles, platform copy, verbatim scripts, timed outline, and dark commercial-film prompt surface.
- Status: text plus dot; never color alone.

## Content rules

- Unfetched SKU links stay labeled as input, not extracted facts.
- Separate confirmed facts, visible evidence, inference, and unknowns.
- Bind every PASS or CONDITIONAL_PASS to a reference scope.
- Keep `human_final_review_required: true` at review and marketing delivery boundaries.
- Creator profiles are not real account recommendations. Real candidates require source, retrieval date, and human verification.
- Do not invent discounts, inventory, sales, reviews, materials, effects, adoption, payment, or authentication success.

## Avoid

No blue brand surfaces, gradients, glass, AI-purple, glow, oversized rounded containers, nested cards, decorative charts, fake activity, fake login success, or pill-heavy navigation.
# 智能体交付扩展（2026-08-20）

- 智能体使用线性任务链和证据账本，不使用头像、聊天气泡、霓虹效果或渐变。
- 未运行态必须显示明确空态；不得用模板结果填充。
- 机器输出的最终状态必须以中文解释，并同时显示机器状态码以便追溯。
- 营销输出必须展示证据编号；详细账本可折叠，不能隐藏未知项与阻断原因。
- L2 运行轨迹使用 `决策 / 工具返回 / 停止` 三类文字状态；Provider 类型、是否联网和是否使用模型推理必须显式可见。
- 能力条桌面四列、平板两列、移动单列；工具轨迹保持单向阅读，不采用聊天气泡。
