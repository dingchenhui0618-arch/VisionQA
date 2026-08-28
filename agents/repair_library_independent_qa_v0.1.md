# VisionQA 合成修图案例库 v0.1 独立 QA

## 2026-08-28 二次复验结论

**PASS（允许第五阶段工程收口）**。本节是对下方 2026-08-27 首轮 FAIL 的复验；保留首轮发现作为审计记录，不覆盖历史结论。

- C1 已关闭：`SC-003 / SC-005` 的冻结 `REGENERATE` 通过 `fixtureCaseId` 进入边界函数，同义自由文本不能降级；结果为 `REJECT`、空修图 Prompt、局修任务禁用。
- H1 已关闭：视觉复核 `SC-001 v2` 仅有画面右侧一枚正确刺绣和五颗纽扣；manifest 文件名/SHA、data 源文件和 public 副本一致。
- H2 已关闭：人工确认结果、本机 Project 持久化、修正页提示和任务 JSON 均携带 `SYNTHETIC_INTERNAL_TEST_ONLY / IMAGEGEN_SYNTHETIC_INTERNAL` 与三项非证据布尔值。
- M1/M2 已关闭：运行时案例表与 manifest 有逐字段自动一致性测试；加载候选时核验冻结 SHA；8 项边界测试覆盖同义文案和五案例冻结策略。
- 二次验证：边界测试 8/8、相关渲染测试 11/11、完整 `npm test` 118/118、ESLint 0 error；浏览器实际点击旧开衫入口和 SC-001 均成功。未调用外部模型或付费 Provider。

残余非阻断风险：任务 JSON 尚无“下载后重新解析”的端到端自动测试；SC-002～SC-005 仍有已文档化双刺绣基线，不能用于严格单问题准确率；真值图有仓库/manifest 哈希证据，但浏览器载入时未单独执行冻结 SHA Gate。

---

日期：2026-08-27
范围：`data/synthetic_repair_case_library_v0.1/`、`web/public/fashion/repair-library/`、`web/lib/visionqa/repair-boundary.ts`、`web/app/workspace.tsx`、`web/app/workspace-repair.tsx`、`web/tests/repair-boundary.test.ts`、`agents/repair_benchmark_curator_v0.2.md`。
方式：本地只读、逐图视觉检查、SHA-256 核验、代码路径审查、单测与 lint；零外部模型调用。未修改产品代码、图片、manifest 或既有文档。

## 结论

**FAIL（存在 CRITICAL）**。五张文件均可读取、manifest SHA-256 与源文件一致，且 `web/public/fashion/repair-library/` 副本逐一一致；SC-002/003/004/005 的可见主问题与标签相符。但是，L3 大错可以通过手工描述变体被路由到局修，违反“大错不得开放局修”的硬 Gate。另有 SC-001 多问题标签错配与 UI 证据身份丢失，不能把本案例库作为安全路由或模型效果证据。

## CRITICAL

### C1 — L3 可经自由文本绕过，危险局修仍会开放

证据：案例库按钮只携带 `id / label / file / strategy`，载入后只进入等待确认状态（`web/app/workspace.tsx:302-308, 1940-2007`）；最终边界完全由用户输入的 `category + note` 推断（`web/app/workspace.tsx:1001-1016, 2050-2080`）。`workspace-repair` 仅展示该推断结果，不把案例 L3 策略作为不可覆盖 Gate（`web/app/workspace-repair.tsx:143-156, 634-677`）。

本机对实际函数的只读调用结果：

- `inferRepairBoundary("人物／穿着逻辑", "右侧多出一只手")` → `LOCAL_REPAIR_OR_REGENERATE`，而 SC-003 的额外手臂本应立即 `REGENERATE`；
- `inferRepairBoundary("商品结构", "圆领改成V领，新增口袋和拉链")` → `LOCAL_REPAIR`，而 SC-005 的多结构冲突本应 `REGENERATE`；
- `inferRepairBoundary("商品结构", "V领口袋拉链错误")` → `LOCAL_REPAIR`。

根因是词面匹配只识别少数固定词组（`repair-boundary.ts:46-54`），没有将已选 L3 案例的冻结策略传入并强制执行。因此用户可看到“整体重生成”，却以等义描述建立局修 Prompt、改图任务并在有授权时调用 Provider。该项满足“关键路由可绕过”的立即升级条件。

修复验收：以 manifest 的冻结 `level / strategy` 为本地体验案例的不可覆盖输入；L3 始终空 Prompt、`REJECT`、不允许建立/运行局修任务。补充上述等义文案、原始 manifest 文案和每个 SC-001~005 的端到端断言。

## HIGH

### H1 — SC-001 实际有两项可见结构/装饰问题，manifest/README 未如实隔离

视觉检查：SC-001 可清楚数到五颗纽扣，符合“多出一颗纽扣”；同时画面左右胸各有一枚黑色五瓣花，而真值板及 truth facts 规定仅画面右侧（穿着者左胸）一枚。`case-manifest-v0.1.json` 却把 SC-001 的 primary issue 写成仅多纽扣，并把“两处现有刺绣”放入锁定区；README 仅说明 **SC-002 至 SC-005** 存在双刺绣固定基线错误。实际 SC-001 同样存在该错误。

影响：SC-001 不是单主问题 L1 受控候选；按当前允许区修掉第五颗纽扣后仍与完整 SKU 真值冲突，且 Prompt 会锁定错误刺绣。这会污染标签、局修边界与“SKU 一致性”复验。

修复验收：重生成/更换 SC-001 使其只含第五颗纽扣，或明确它为多问题非 L1 候选并在 manifest、README、UI 中列出已知基线问题且禁止将局修结果称为完整 SKU 通过。

### H2 — 合成案例载入/确认后在 UI 被表述为客户图片，合成证据标签未随流程保留

证据：`loadSyntheticRepairCase` 设置 `dataState.kind="local"`（`workspace.tsx:1999-2004`），而 UI 对该状态显示“客户图片仅在本机等待”（`workspace.tsx:2447-2462`）。确认主问题后又变成泛化的“用户已确认具体问题”；`humanConfirmedIssueAsset` 记录 `evaluationMode="HUMAN_CONFIRMED_ISSUE"`，没有 `SYNTHETIC_INTERNAL_TEST_ONLY` 或 library provenance（`workspace.tsx:1013-1061`）。案例 metadata/manifest 并未被 UI 读取。

影响：虽 manifest/README 正确声明非客户、非模型效果、非商业证据，实际最关键的载入—确认—修图界面会把素材称为客户图；后续记录不保留合成标签，存在把内部合成流程误读为客户/模型结果的风险。

修复验收：案例状态、顶部来源、修图任务 JSON、人工复验和导出均强制携带 `SYNTHETIC_INTERNAL_TEST_ONLY`、`IMAGEGEN_SYNTHETIC_INTERNAL`、`not_real_customer_evidence=true`、`not_model_effectiveness_evidence=true`、`not_commercial_evidence=true`；不得显示“客户图片”。

## MEDIUM

### M1 — 运行时案例表与 manifest 脱钩，无法防止今后标签/策略/哈希漂移

`SYNTHETIC_REPAIR_CASES` 是独立的五条简化硬编码数据（`workspace.tsx:302-308`），只同步了显示用策略文字；并不读取 manifest 的哈希、主问题、允许区、锁定区或 `level`。当前 public 副本哈希均与数据目录相同，故不是当前文件损坏；但 UI 无校验，未来任意一侧更新都可静默失配。

### M2 — 现有测试通过，但未覆盖本轮 5 图、文案变体或 UI 强制 Gate

`repair-boundary.test.ts` 只有四个固定词串断言（`web/tests/repair-boundary.test.ts:8-37`），未覆盖 SC-001~005 manifest，也未覆盖本报告 C1 的自然表述变体。该缺口直接使 L3 绕过未被发现。

## LOW

### L1 — 运行中的本地 URL 不可作为本轮 UI 可达性证据

仓库提示已有 VisionQA dev server 位于 `localhost:3141`，但本机浏览器访问 `127.0.0.1:3141` 返回 connection refused；`4173` 是另一应用。故本报告的 UI 结论基于已构建的静态代码路径，而非该服务器的交互回归。此项不改变上述 C1/H1/H2 判定。

## 五图视觉与路由核验

| 案例 | 视觉核验 | manifest 路由 | QA 判断 |
|---|---|---|---|
| SC-001 | 五颗纽扣可见；另有两枚刺绣 | L1 / LOCAL_REPAIR | 主问题可见，但有 H1 多问题错配；条件失败 |
| SC-002 | 画面左侧手指与袖口融合、手指形态异常可见 | L2 / LOCAL_REPAIR_OR_REGENERATE | 路由合理；通过 |
| SC-003 | 画面右侧有明显额外前臂/手 | L3 / REGENERATE | manifest 合理，但 UI/函数可绕过（C1）；失败 |
| SC-004 | 画面右侧下袖有局部横向涂抹/罗纹方向断裂 | L1 / LOCAL_REPAIR | 路由合理；通过 |
| SC-005 | V 领、口袋、拉链和错误前襟结构均可见 | L3 / REGENERATE | manifest 合理，但 UI/函数可绕过（C1）；失败 |

真值板视觉上为圆领、四颗深灰纽扣、仅画面右侧一枚花形刺绣、无口袋/拉链，且与 manifest truth facts 一致。

## 已执行验证

- 所有 5 个候选和 truth PNG 均通过 `view_image` 人工视觉检查；未见损坏。
- manifest 六项 SHA-256（truth + 5 cases）全部与 `data/` 实体相同；5 个 public 副本也全部与源文件相同。
- `node --experimental-strip-types --test tests/repair-boundary.test.ts`：4/4 通过。
- `npm run lint`：通过。

这些工程检查仅证明当前代码可静态检查和既有关键词测试通过；不构成模型修复有效性、真实客户采用、付款或商业效果证据。

## 放行条件

在 C1 修复并补充端到端案例策略锁定测试前：**不得放行**本案例库进入任何可调用局修的演示或基准结果。C1 修复后，仍须解决 H1 与 H2，并复跑本报告所列测试与五例静态/交互回归；届时可重新进行独立 QA。
