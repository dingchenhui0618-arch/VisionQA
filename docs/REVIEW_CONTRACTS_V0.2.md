# Review Contracts v0.2

状态：本地契约与 M2 Mock runtime 已落地；现有 v0.1 运行时仍保持兼容，未部署线上。

本轮新增的契约把“视觉判断”和“代码判断”放到同一个证据协议下，但不把两者混成一个分数：

| 契约 | 用途 | 版本 |
| --- | --- | --- |
| `VisualReview` | 网页、图片、演示页和文档渲染的视觉判断 | `visual-review-v0.2` |
| `CodeReview` | 源码、Diff、项目结构和确定性规则的代码审查 | `code-review-v0.1` |
| `ObservationEnvelope` | 两种审查共享的、可追溯的观察结果 | `observation-envelope-v0.1` |
| `ReviewProfile` | 可版本化的评审维度、规则和禁止推断 | `review-profile-v0.1` |

## 兼容策略

`web/lib/visionqa/visual-review-contract.ts` 中的 v0.1 schema 保持原样，旧插件运行时继续使用它。新消费者从 `review-contract-v0.2.ts` 引入 v0.2 schema；v0.2 保留 `artifact`、`intent`、`constraints`、`permissions`、`operation` 等 v0.1 字段，并要求显式的版本化 `profile`，再以可选字段增加 `review_mode`、多资产和上下文。

升级时不要把旧的电商字段直接删除或改义。`ecommerce-apparel` 是兼容 profile，通用核心应优先使用 `visual-baseline`、`code-quality` 或宿主提供的 profile。

## 证据定位

每个观察至少关联一个 `EvidenceAnchor`。当前支持：

- `pixel_bbox`：截图中的像素区域；
- `dom_selector`：网页元素及其可选矩形；
- `source_range`：源码文件和行范围；
- `slide_object`：演示页对象；
- `document_region`：文档页区域；
- `text_range`：文本上下文范围。

评审结论没有证据时不能升级为确定问题。缺少目标或资产时应使用 `NEEDS_CONTEXT` / `NOT_ASSESSABLE`，而不是用模型偏好补齐事实。

## Profile 分层

Profile 只定义评审目标、维度、确定性检查和禁止推断，不负责模型调用。Provider 负责产生观察，Host Adapter 负责提供截图、DOM、源码或 Diff，最终的写入仍需要显式权限和 `requires_approval: true`。

M2 的 `plugin-runtime` 提供三条离线入口：

- `runVisualReviewV02Mock`：VisualReview v0.2；
- `runCodeReviewV01Mock`：CodeReview v0.1；
- `runLinkedReviewMock`：需要 `linked-review` profile 与 `review_mode: linked`；
- `runReviewMock`：按 schema version 与 review mode 统一分派。

这些入口只消费本地 fixture，响应会标记 fixture-only / no-network，并在缺少真实证据时返回 `NEEDS_CONTEXT` 或 `NOT_ASSESSABLE`。它们不调用 Provider，不读写宿主资源，也不代表模型质量。

内置 profile 位于 `web/lib/visionqa/review-profiles.ts`：

- `visual-baseline@0.1.0`：通用视觉层级、排版、对比和一致性；
- `code-quality@0.1.0`：可读性、边界、复杂度、测试和安全；
- `linked-review@0.1.0`：把视觉证据关联到 DOM、源码范围和修改后验证；
- `ecommerce-apparel@0.3.0`：已有服饰电商规则的兼容入口。

## 文件索引

- TypeScript：`web/lib/visionqa/review-contract-v0.2.ts`
- Profile registry：`web/lib/visionqa/review-profiles.ts`
- JSON Schema：`contracts/visual-review-v0.2.schema.json`、`contracts/code-review-v0.1.schema.json`、`contracts/observation-envelope-v0.1.schema.json`、`contracts/review-profile-v0.1.schema.json`、`contracts/host-capture-v0.2.schema.json`
- M2 runtime：`web/lib/visionqa/plugin-runtime.ts`
- M2 Host fixture：`web/lib/visionqa/m2-host-fixtures.ts`
- M2 tests：`web/tests/plugin-runtime-v02.test.ts`、`web/tests/m2-host-fixtures.test.ts`
- M3 Chrome evidence：`web/lib/visionqa/host-evidence-v0.2.ts`、`web/host/chrome/popup.js`
- M3 MCP evidence：`web/lib/visionqa/mcp-host-contract.ts`、`web/scripts/visual-review-mcp.ts`
- M3 tests：`web/tests/host-evidence-v02.test.ts`、`web/tests/mcp-host-contract.test.ts`

