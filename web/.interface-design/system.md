# VisionQA interface system

## Intent

Monochrome studio review desk for apparel ecommerce. The interface recedes into black, white, and neutral gray so uploaded customer imagery carries the strongest color contrast.

## Flow signature

The fixed repair track is the product signature: product truth, AI model draft, issue diagnosis, repair and delivery. A zero-level project overview sits before the track and shows only current state, the single next action, and truthful completion facts. Marketing generation is a deferred extension rather than a primary navigation stage.

Public navigation is intentionally three-step: `/` is the product home, its single entry action opens `/login`, and a valid invited account proceeds to `/workspace`. The VQ brand mark in both desktop rail and compact top bar always returns to `/`.

## Tokens

- Canvas `#f4f4f4`; surface `#fbfbfb`; raised `#ffffff`.
- Ink `#111111`; muted `#5d5d5d`; faint `#6f6f6f`.
- Divider `rgba(17,17,17,.10)`; strong divider `rgba(17,17,17,.20)`.
- Primary action `#171717`; selected neutral `#ececec`.
- Success `#176b43`; warning `#8a5b08`; danger `#a33838` only for semantic state.
- Control radius 8px; panel radius 12px; space base 4px.

## Reusable patterns

- Login split: black product promise panel and white account panel; the trial uses two server-validated fixed accounts, one dominant login action, inline error feedback, and no registration/SMS/password-recovery distractions.
- Trial identity: only masked account identity reaches the client; each trial account receives a separate local IndexedDB scope. This is controlled trial access, not formal customer authentication or tenant isolation.
- Workbench shell: persistent overview plus four-step repair rail above 1024px, sticky horizontal stage navigation at and below 1024px.
- Project overview: one next-action focal surface, one truthful project visual, four factual counters, and a linear stage ledger. On mobile, the action appears before the image.
- Project persistence: compact text-and-dot save state in the top bar; project ID, revision, storage scope, and the four latest audit events live at the bottom of Project overview instead of becoming a new navigation module.
- Baseline: SKU links and confirmed product-image references remain the primary canvas; customer strategy and targeting live in a sticky side inspector with progressively disclosed controls.
- Asset intake: one fixed AI-model-image task scope, one dominant neutral dropzone, and at most three same-SKU real-color image tiles.
- Review desktop: gallery plus result-first inspector, without a complex filter rail. Review mobile: conclusion inspector before the gallery. Scores, prompts, and audit details stay collapsed until requested.
- Repair review: provider adapter choices, exported job, before/after stage, four human drift checks, then an explicit local-4K versus AI-super-resolution boundary.
- Repair collaboration ledger: one border-only six-step responsibility rail above the repair task. It shows shared-case handoffs and Chinese completion/waiting/blocking states; no avatars, chat bubbles, gradients, or claims that independent models are already running.
- Unassessed candidate: the real uploaded image remains the visual source while diagnosis text, score, issues, and Prompt stay explicitly empty. Never fall back to fixture content once a customer candidate exists.
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
