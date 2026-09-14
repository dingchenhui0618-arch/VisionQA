# 视觉智能体框架选型：本地评估决定

日期：2026-09-10。

用户要求：编排底座复用 GitHub 框架，不从零自研；暂不动线上，仅在 localhost:6300 开发。

## 首选 Mastra，接入验证后再固定生产选型

- 官方仓库：https://github.com/mastra-ai/mastra
- 现有 VisionQA 是 React + TypeScript；Mastra 提供 TypeScript Agent、工具、工作流与人工暂停恢复，可减少跨语言服务改造。
- LangGraph.js 是备选：适合强调显式图状态与受控执行的场景，但不是现成视觉产品。
- Agno 是备选：主要 Python 技术栈，当前接入会增加另一套后端维护成本。
- 此结论是基于官方能力说明和现有项目的工程判断，不是三个框架的运行基准测试，也不保证现有模型协议直接兼容。

## 下载记录

- 参考源码：D:\Projects\visionqa-agent-framework\mastra
- 下载方式：官方仓库浅克隆；未运行仓库安装脚本。
- 提交：709a7046703b498c4b3dacde9553c577bfeefc19
- 此提交的 core 标为 1.66.0-alpha.2，仅作源码参考；项目依赖应另选核实过的稳定发布并锁版本，不直接跟随 main。
- 根许可证将普通代码列为 Apache-2.0，所有 ee/ 目录及第三方组件有各自条款。不得把整个仓库宣称为无例外的统一许可；首次接入仅选不依赖 ee/ 的开源能力。

## 我们仍然负责的部分

框架负责通用 Agent/工具编排与工作流能力。VisionQA 负责视觉业务工具、商品事实、素材与版本界面、租户隔离、授权、费用冻结/扣除、结果复验与人工交付。下载框架不等于业务接入完成。

不自研另一套通用编排器；不把模型输出作为权限判定；不让框架自动重试付费修图。现有上传、审核、修图与额度能力优先复用。

## 本地接入顺序

1. 固定稳定依赖，先做零外网工具测试：计划、工具调用、暂停、批准、恢复、停止。
2. 检验当前本地开发运行时是否兼容；必要时用独立本地 Node 服务承载编排，不迁移线上。
3. 接入已有业务工具和真实任务状态；模型密钥只从服务端环境读取。
4. 先验证失败与重复提交不重复计费，再在剩余授权预算内验证真实模型；不自动回放客户素材。
5. 对话与视觉工作区运行于 localhost:6300；现有页面启动不代表新智能体工作台已完成。

官方参考：
- https://mastra.ai/docs/workflows/suspend-and-resume
- https://github.com/mastra-ai/mastra/blob/main/LICENSE.md
- https://github.com/langchain-ai/langgraphjs
- https://github.com/agno-agi/agno
