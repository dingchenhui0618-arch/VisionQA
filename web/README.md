# VisionQA

VisionQA 是服饰电商 AI 商品图评审与营销交付工作台。

## 当前主流程

1. 上传历史商品 SKU 链接或已确认的产品图，建立商品基准。
2. 上传本次需要评审的商品图、详情页、模特图或营销物料图。
3. 完成硬性 Gate、评分、证据、返工 Prompt 和人工终审。
4. 建立改图任务，在 Seedream、千问或 GPT 外部生成／未来 API 执行后，回到工作台完成前后对比和漂移复审。
5. 交付痛点地图、博主画像、小红书/抖音文案、逐字稿、商业片提示词、评审 CSV 与选中原图。

## 入口边界

`/workspace` 首屏是登录界面。正式身份认证尚未接入；当前只能通过明确标识的“内部预览工作台”入口进入，不保存或验证密码。

## 契约

- `contracts/growth-brief-v0.1.schema.json`：历史 Growth Brief 契约，保留兼容与追溯。
- `contracts/repair-job-v0.1.schema.json`：改图任务、模型适配与人工复审契约。
- `contracts/product-expression-v0.1.schema.json`：商品表达效能六项判断与 SKU 一致性 Gate。
- `lib/visionqa/product-expression.ts`：商品表达效能计算、运行时校验与旧版诚实投影。
- `lib/visionqa/agents/local-orchestrator.ts`：无网络、可追溯、失败关闭的营销智能体编排器。
- `app/api/agent-runs/route.ts`：智能体能力与运行接口；六项千问 Gate 全部满足才切换外部模型，否则运行本地非模型测试链路。
- `AGENT_ARCHITECTURE.md`：角色职责、证据边界与真实模型授权清单。
- `AUTHORIZATION_BOUNDARY.md`：用户已授予的本地操作范围，以及支付/API Key 的强制确认边界。
- `lib/visionqa/agents/l2-runtime.ts`：最大步数、Provider 端口、白名单工具、观察轨迹和失败关闭。
- `lib/visionqa/agents/qwen-marketing-provider.ts`：千问百炼营销 Provider 适配器与六项启用 Gate；默认锁闭，不读取前端 Key。
- `scripts/build-local-material-manifest.mjs`：为明确指定的本地素材目录生成不外传的 SHA-256 清单。
- `contracts/marketing-delivery-pack-v0.2.schema.json`：当前营销交付包契约。

## 本地运行

要求 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
npm run build
npm test

# 可选：为明确指定的本地服饰素材生成本地清单
npm run materials:manifest -- "<素材目录>" "<输出 JSON>"
npm run lint
```

本次本地视觉 QA 地址：`http://localhost:3141/workspace`。

## 主要实现

- `app/workspace-login.tsx`：登录与内部预览入口。
- `app/workspace-overview.tsx`：第一步商品基准。
- `app/workspace-intake.tsx`：第二步待评审素材。
- `app/workspace.tsx`：工作台壳层、第三步质量评审、证据、审计与文件交付。
- `app/workspace-repair.tsx`：第四步改图任务、前后对比与人工复审。
- `app/workspace-growth.tsx`：第五步营销交付包。
- `app/api/live-evaluate/route.ts`：真实模型评估入口与人工审核策略。
- `app/globals.css`：VisionQA v0.5 黑白灰设计系统与响应式布局。

## 证据边界

工程构建与界面测试只能证明实现可运行。模型有效性需要独立评测；营销与商业有效性需要真实发布、采用、付款和再次提交记录。博主画像不是已核验账号，规则化文案和提示词也不是客户采用证据。
