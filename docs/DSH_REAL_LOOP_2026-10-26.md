# DSH 宿主真实多模态最小闭环（2026-10-26）

## 结论

本地已完成一条真实 Chrome-rendered Host fixture 闭环：

`截图 + DOM 摘要 + revision → Qwen 视觉评审 → 受控局部修改 → 重新渲染 → Qwen 复验`

这证明了 VisionQA 的 Host evidence envelope、服务端 Provider、revision 追踪和二次复验可以在 localhost 串起来。真实 Provider 当前通过一个 v0.2 Host → 稳定 v0.1 Provider runtime 的兼容桥接返回结果；Host capture 本身保留 v0.2 revision/DOM evidence。它还不是生产 DSH 进程的集成证明，也不代表客户准确率。

## 实际调用

- Host adapter：`dsh-local-chrome-host-0.1.0`
- Provider：`aliyun-bailian-cn-beijing`
- Model：`qwen3-vl-plus`
- 网络调用：2 次（首轮评审、修改后复验）
- 源码写入：0 次
- Host 权限：`can_call_model=true`，`can_read_source=false`，`can_write_source=false`
- revision（修改前）：`d21ad5bd4f9c58cde9d5a5bab18ffa8a`
- revision（修改后）：`f3fd51efa45070ca56be9e76b7c207b6`

完整 JSON 与两张实际 Chrome 截图保存在：

`D:\VisionQA\runs\dsh-real-loop-2026-10-26T07-06-46-044Z\report.json`

## 受控修改

修改没有执行模型返回的任意代码，而是使用本地 fixture 的 allowlist patch：

- 增加首屏主容器内边距与标题层级；
- 将主 CTA 改为深色背景、浅色文字；
- 重新渲染后生成新的 DOM 摘要与 revision。

这一步用于验证“建议被采纳并再次复验”的链路，不是自动写回用户项目。

## 当前指标（单个受控样例）

| 指标 | 当前值 | 口径 |
| --- | ---: | --- |
| 问题定位率 | `0/3 = 0%` | 首轮 3 条观察都只有 `context` fallback，没有合格的 `pixel/structure` 锚点，因此不把分类命中冒充定位成功 |
| 建议采纳率 | `1/1 = 100%` | 有可执行建议时，人工接受一个 allowlist 局部修改；不是客户采纳率 |
| 自动化闭环耗时 | `1.25 分钟` | 两次真实 Provider 调用、两次 Chrome 渲染的墙钟时间 |
| 节省时间 | `约 3.75 分钟` | 以暂定 5 分钟人工基线估算；需要真实 DSH 操作员基线替换后才能作为产品指标 |

Qwen 首轮识别了低对比度 CTA、主操作对齐和 CTA 可发现性；复验识别到标题层级、CTA 对比度、垂直间距和版本信息可读性。由于 Provider 返回的 observation 没有提供合格的像素/结构锚点，当前结果仍然是 `MANUAL_REVIEW`，这是预期的失败关闭行为。

## 如何复现

在本地服务已启动且 `.env.local` 的 Qwen canary gate 保持开启时：

```powershell
cd D:\VisionQA\web
npm run dsh:real-loop
```

脚本每次使用唯一的本地 Chrome profile、临时 HTTP Host fixture 和唯一 capture/revision，不读取或输出 API Key。现有服务端硬停仍生效：单并发、最多 15 次本地 canary 请求、预算上限约 2 元。

## 下一步

1. 让 Provider 的 observation 契约强制返回 `candidateEvidence`，并将 `pixel/structure` 锚点映射到实际 DOM selector 或 viewport bbox。
2. 用一个真正的 DSH 会话替换当前 fixture，保持同一套 capture、revision 和回放格式。
3. 至少跑 10 个有人工标注的页面后，再报告问题定位率；至少 5 位操作员完成任务后，再报告节省时间和建议采纳。
- Provider response contract：`visual-review-v0.1`（兼容桥接；原始 Host capture 为 `visionqa-host-capture-v0.2`）
