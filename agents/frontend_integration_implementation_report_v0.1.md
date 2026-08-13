# VisionQA MVP 前端集成与 UX 状态实现报告 v0.1

> Agent：前端集成与 UX 状态实现 Agent  
> 日期：2026-07-29  
> 结论：本地代码候选、自动化、production start 静态资源烟测与浏览器视觉 QA 已完成；未部署生产，正式 API 成功态仍待 staging 数据验证

## 1. 职责、输入、输出与验收

### 职责

在不重做现有 Apple-like 冷静中性视觉语言、不改变“A 为主、B 为证据详情”信息架构的前提下，将硬编码工作台接入正式 evaluation v0.3 读取和正式人工改判接口，补齐数据来源、未评估、加载、失败降级、移动端与可访问性状态。

### 输入

- `agents/product_program_lead_mvp_charter_v0.1.md`
- `agents/technical_architecture_lead_mvp_plan_v0.1.md`
- `agents/contract_rules_implementation_report_v0.1.md`
- `agents/backend_platform_implementation_report_v0.1.md`
- `contracts/evaluation-result-v0.3.schema.json`
- `web/lib/visionqa/contracts.ts`
- `web/app/api/evaluations/*`
- `web/app/workspace.tsx`
- `web/app/globals.css`

### 输出

- `web/lib/visionqa/api-client.ts`
- `web/lib/visionqa/ui-adapter.ts`
- `web/tests/ui-adapter.test.ts`
- `web/app/workspace.tsx` 的数据源、正式读取、正式改判和状态集成
- `web/app/globals.css` 的来源状态、响应式与可访问性修正
- `web/package.json` 的 UI adapter 回归测试接入
- `web/.gitignore` 的本地 QA 日志忽略规则
- `runs/frontend_qa_v0.1/` 的视觉 QA 截图

### 验收结论

| 验收项 | 状态 | 证据 |
|---|---|---|
| 硬编码分数不伪装成模型结果 | 通过 | 顶部 Fixture 标识 + 全宽说明；Inspector 再次标记 |
| API 不可用明确降级 | 通过 | 稳定错误码、错误说明、Fixture 降级标识与 alert |
| 选中图片、模板、证据、Prompt 一致 | 通过 | 浏览器验证 #005 与品牌模板切换后全部动态联动 |
| 正式改判使用正式 API | 通过（代码/单测） | evaluation ID、result version、幂等键和模板快照一并提交 |
| Blocker/score/商业模板层级不回归 | 通过 | 全量 24 项测试通过 |
| 桌面与移动关键流程可用 | 通过（Fixture） | 1440×900、390×844 浏览器视觉 QA |
| test/lint/build/start smoke | 通过 | `npm test` 两组共 32 项；`npm run lint`；production start 全资源 200 |
| 不重做视觉语言、不部署生产 | 通过 | 只做状态集成与局部响应式修正；未执行 Sites 部署 |

## 2. 数据集成设计

### 2.1 数据源状态

工作台现在具有四种显式状态：

1. `fixture`：URL 没有 `evaluation_id`，使用可交互演示数据；
2. `loading`：正在读取指定正式评估；
3. `real`：正式 v0.3 评估读取成功；
4. `fallback`：正式 API 失败，明确显示错误码并降级 Fixture。

入口格式：

```text
/?evaluation_id=<正式评估ID>
```

没有 evaluation ID 时，不会尝试把 fixture 解释为真实模型结果。

### 2.2 v0.3 Data Adapter

`ui-adapter.ts` 将正式契约统一映射为 UI 视图模型：

- 四大 Skill 名称、权重和分数；
- Gate decision；
- 模型 observation 与严重度；
- 商业六项指标、模板版本、贴合度与证据摘要；
- 修复 Prompt、锁定属性和 provenance；
- calibration status 与 model status。

`null` 分数在 adapter 中保持 `null`。组件只在视图边界转换为 `-- / 未评估`，不会补成演示数值。

### 2.3 正式改判

存在正式 evaluation ID 时，人工确认/改判调用：

```text
POST /api/evaluations/{id}/overrides
```

同时发送：

- `Idempotency-Key`
- `baseEvaluationVersion`
- 原结论与人工结论
- 原因码与业务证据
- 商业模板 ID / version / system fit score

API 失败时只记录为浏览器本地降级，不显示“服务端审计成功”。

Fixture 模式继续兼容旧 `/api/overrides` 演示接口，但 UI 明确标识其演示属性。

## 3. UX 与可访问性修正

- 顶部加入紧凑数据来源状态，不改变原工作台主视觉；
- 全宽状态说明用于承载高风险信息，避免只用短暂 toast；
- 正式 API 没返回图片预览时显示“预览未提供”，不复用 fixture 商品图；
- 正式 API 没返回证据坐标时不显示模拟标记；
- Prompt 显示正式 `action_plan` 来源及规则生成版本；
- 商业模板、分数、Prompt、证据均跟随同一 selected；
- API 正式结果模式锁定模板选择器，避免 UI 在客户端重算第四层；
- textarea 补齐 focus-visible；
- 移动端隐藏拥挤的“评分与门禁”工具栏标题，保留四个核心筛选；
- 390px 宽度下保持双列图片、底部 Inspector 独立滚动和关键按钮可达。

## 4. 设计 Skill 的影响

本次先读取并遵循 `design-taste-frontend`。

设计判断为：面向电商运营/质检人员的高密度 B2B 工作台，Apple-like 冷静中性语言，保留式改造；差异度 5、动效 3、信息密度 7。

该 Skill 明确说明其主要面向营销页而不是数据工作台，因此没有套用营销页区块。实际采用的是：

- 改造前先审计品牌 token、IA 和已认可交互；
- 保留既有色彩、圆角和布局语法；
- 补齐 loading / empty / error / degraded 状态；
- 使用状态内联提示而非装饰性卡片；
- 保持单一蓝色交互强调色；
- 修复 focus、按钮反馈、移动端折叠和 `100dvh` 稳定性；
- 不引入新图标库、不增加无意义动效。

## 5. 验证结果

### 自动化

```text
npm run lint
PASS

npm test
HTML / Schema / production smoke：8 passed, 0 failed
契约 / Adapter / 持久化 / UI Adapter：24 passed, 0 failed

npm run build
PASS

npm run test:production-smoke
PASS
```

新增测试验证：

- v0.3 API envelope 映射后的总分、Gate、四 Skill、商业六项和 Prompt 来源一致；
- NOT_ASSESSABLE 的 `null` 分数不会被 adapter 填成演示分。
- `vinext start` 启动真实 production server；
- production HTML 为 200，HTML 引用的每个 JS/CSS 均为 200 且 MIME 正确；
- 关键商品图 `/fashion/model-blue-floral-dress-front.png` 为 200 且为 PNG。

### 浏览器交互

已验证：

- Fixture 首屏有双重来源说明；
- 点击 #005 后 Inspector 从 #001 的 82/REVIEW 更新为 #005 的 91/PASS；
- 切换到品牌旗舰模板后同一 #005 的商业层和综合结果一致更新；
- 进入证据详情后仍保持 #005、当前模板和 Prompt；
- `?evaluation_id=eval-missing` 返回 `AUTHENTICATION_REQUIRED` 时出现显式错误并降级 Fixture；
- 390×844 下筛选、图片网格、Inspector 与滚动区域可用。

### 视觉 QA 路径

- `D:\VisionQA\runs\frontend_qa_v0.1\fixture-desktop-1440x900.png`
- `D:\VisionQA\runs\frontend_qa_v0.1\fixture-mobile-390x844.png`
- `D:\VisionQA\runs\frontend_qa_v0.1\api-fallback-desktop-1440x900.png`

## 6. 待外部审查项

### Blocker

1. **正式 API 成功态尚未在 staging 验证**  
   当前 D1 未绑定/当前浏览器无内部试点认证，无法取得真实 evaluation。外部审查需提供一个 staging evaluation ID，核对正式图片 URL 的后续契约、v0.3 结果、改判版本锁和 D1 审计闭环。

2. **正式 evaluation GET 没有资产预览字段**  
   前端当前诚实显示“预览未提供”。需要 CTO、后端、契约和安全审查共同决定：GET 是否返回短期签名 R2 URL，或另设受控资产读取接口。前端不能自行拼接对象地址。

### High

3. **批次读取 API 尚不存在**  
   后端当前实现批次创建，但没有批次/资产/评估列表 GET。现阶段只能按 evaluation ID 接入单条正式结果，无法让整个 12 图网格变为真实批次。

4. **正式 evidence region 契约缺失**  
   observation 没有 bbox/polygon。前端已禁止正式模式使用演示坐标。需模型/契约 Agent 冻结像素坐标、归一化坐标、旋转和裁剪语义。

### Medium

5. **真实模式的商品名与参考图仍需资产契约**  
   v0.3 只包含评估结果，没有商品展示元数据或 reference URLs。前端不应从 observation 猜商品名。

6. **角色授权尚未进入 UI**  
   后端报告已说明当前只有单租户身份，没有上传者/评审员/管理员/只读审计员角色。正式改判按钮应在 RBAC 冻结后按权限显示。

7. **移动端是可用型工作台，不是最终移动体验**  
   当前 390px 采用“上方双列网格 + 下方固定 Inspector”。建议外部 UX 审查确认是否改为底部 Sheet；本 Agent 未越权改变已认可的信息架构。

## 7. 交付判断

本实现可进入外部代码审查与 staging 集成，但不能标记为“真实批次闭环完成”或“生产可发布”。

建议 Gate：

```text
代码候选：PASS
Fixture 交互：PASS
正式 API 失败降级：PASS
正式 API 成功态：PENDING STAGING
生产部署：NOT PERFORMED
```

## 8. P1-FE-STATIC 修复记录

### 根因

项目原锁定 `vinext 0.0.50`。其 Windows production static cache 使用
`node:path.relative()` 生成缓存键，得到 `assets\file.js`；HTTP pathname
使用 `/assets/file.js`。缓存 `Map.get()` 因分隔符不同始终 miss，因此 HTML
由 RSC handler 返回 200，但 JS、CSS 和 `public/` 图片全部 404。

开发服务器不使用同一 production static cache，所以 dev 正常不能发现问题。

### 修复

- 将 `vinext` 从 `0.0.50` 精确升级为 `1.0.0-beta.4`；
- 新版本 static cache 使用官方 `pathslash` 规范化跨平台路径；
- 没有修改或热补丁 `node_modules`；
- 新增 `tests/production-smoke.test.mjs`；
- 新增 `npm run test:production-smoke`，并纳入全量 `npm test`。

### 可重复验收

烟测每次：

1. 申请空闲本地端口；
2. 使用当前 Node 直接启动 `vinext start`，明确 `NODE_ENV=production`；
3. 请求 `/` 并解析 SSR HTML；
4. 收集 HTML 中全部 `.js` 和 `.css` 引用；
5. 并发验证每个引用为 200，并核对 JavaScript/CSS MIME；
6. 验证关键商品图为 200 和 `image/png`；
7. 无论成功失败均终止子进程。

最终结果：

```text
production HTML             200
all HTML-referenced JS/CSS  200
critical product image      200
production smoke            PASS
lint                        PASS
build                       PASS
full test                   8 + 24 passed, 0 failed
```

P1-FE-STATIC 状态：`RESOLVED IN CODE / READY FOR EXTERNAL REVIEW`。
