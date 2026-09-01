# Claude 任务书：VisionQA 客户前端与智能协作窗

你是执行者，这份文档是唯一任务来源；中途没人可问，拿不准的写进 `BLOCKED.md`，跳过继续做别的。断线或换会话先读 `PROGRESS.md` 接着做，每完成一项立即更新。目标是让小商家老板在 90 秒内建立首个 SKU 批次，并始终知道下一步；体验正确 > 可访问可恢复 > 视觉精致 > 动效。文中“只允许/不许”是硬规则；建议可调整，但要在 `PROGRESS.md` 说明。

## 我替领导拍的板

- 黑白可移动对话框 → 客户版显示“可公开的智能体协作摘要”，不显示隐藏思维链、Prompt、模型名、Provider、状态码（猜的）｜否则泄密且增加认知负担。
- 客户版与开发者版 → 本任务只做客户版；`/internal` 由 Codex 负责（已确认分工）。
- 移动方式 → 桌面可拖动并记住本次会话位置，390px 手机固定为底部抽屉（猜的）｜手机自由拖动容易遮挡主动作。
- 接口未就绪 → 先做 typed adapter 与明确 loading/empty/error fixtures，不造假称真实模型已运行（猜的）。
- 视觉 → 黑白灰、单一蓝色只用于主动作；8px 控件、12px 面板，无渐变/玻璃拟态/紫色 AI 风格（项目既定）。

## 界限

只允许修改/新增：`web/app/customer/**`、`web/app/landing/**`、`web/app/login/**`、`web/app/page.tsx`、`web/app/workspace/page.tsx`、`web/app/workspace/projects/[id]/page.tsx`、新增 `web/tests/customer-ux-*.test.mjs`、根目录 `PROGRESS.md` 与 `BLOCKED.md`。不许修改 `web/app/api/**`、`web/lib/**`、`web/app/internal/**`、`web/app/globals.css`、任何 env/Key、数据库、部署目录、现有测试或 package/lockfile。发现后端问题只记 `BLOCKED.md`。不得删除、skip/todo、放宽现有测试，不得把不可点击元素伪装成按钮。

## 现状与任务 0

2026-09-01 实测：客户流程已有 `/`、`/login`、`/workspace`、`/workspace/projects/:id`；上传边界为真值 1–4、候选 1–10；`npm test` 包含客户额度/租户/Gate 测试；客户样式集中在 `web/app/customer/customer.css`。先运行 `git status --short --branch`、`npm run lint`、`npm test`（工作目录 `web`），记录测试总数、失败数、耗时；若基线失败，证据置顶写入 `BLOCKED.md`，仅做不受影响的 UI。核对后在 `PROGRESS.md` 用 ≤10 行写目标、顺序、最大风险。

## 任务 1：重做客户旅程

按“结果首页 → 邀请进入 → 项目首页 → 建批次 → 批量筛查 → 修正交付”统一层级。每屏只有一个主动作；刷新可理解当前状态；失败文案说明“发生什么/是否扣额度/下一步”。所有控件 ≥44px，键盘焦点清晰，390px 无横向溢出。不得展示模型名、Prompt、Provider 或 HTTP 状态码。

## 任务 2：智能协作窗

实现黑白可移动协作窗，默认不遮挡主动作；包含折叠、展开、未读、当前阶段、下一步按钮。事件只使用 `{id, roleLabel, summary, status, createdAt, action?}`；角色文案用“商品核对/问题定位/方案评审/修正执行/质量复验”。禁止渲染原始模型响应、隐藏推理或任意 HTML。桌面拖动须可键盘复位；手机为底部抽屉；`prefers-reduced-motion` 下关闭非必要动效。空状态明确“尚未开始”，fixture 明标“界面演示数据”。

## 任务 3：验收与回归

运行 `npm run lint`、`npm test`、`npm run build`；跳过数必须为 0，测试总数不得低于任务 0。浏览器验收 1440px 与 390px：从首页到建批次、筛查、修正、失败、恢复、协作窗拖动/抽屉/键盘；控制台 error/warning 为 0，无横向溢出。反向验证：临时让一个客户 UX 断言失败并保存红灯输出，立即还原并保存全绿输出。

## 规矩

不新增依赖、权限、API 或部署流程；需要时写 `BLOCKED.md`。同一验收连续失败 3 次换项；结果比基线差就回滚该项并如实记录。不得提交密钥、客户图片或伪造成功状态；现有用户未提交文件不纳入提交。

## 完成条件

1. 1440px 与 390px 全旅程始终只有一个主动作，协作窗不遮挡且下一步可执行，控制台 0 error/warning、横向溢出 0。
2. lint/test/build 全绿、skipped 0、测试数不低于基线，白名单外 git diff 为 0；每条都在对话贴实际命令输出和红→绿证据，只说完成不算。`BLOCKED.md` 空也写“无”。或已跑满 3 轮验收即停，如实交付差距。
