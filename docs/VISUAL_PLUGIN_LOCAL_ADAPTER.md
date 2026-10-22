# VisionQA 本地 CLI / MCP 适配器

源码位置：`D:\VisionQA\web`

本地适配器使用 `visual-review-v0.1` 契约。当前默认是透明 Mock Provider，目的是先验证宿主传入的上下文、权限和结果结构；它不会声称已经分析真实图片，也不会写入用户文件。

## CLI

```powershell
cd D:\VisionQA\web
npm run visual:capabilities
npm run visual:validate -- examples\visual-review-request.json
npm run visual:review -- examples\visual-review-request.json
```

也可以从标准输入传入一个 JSON 请求：

```powershell
Get-Content examples\visual-review-request.json -Raw | npm run visual:review -- --stdin
```

## MCP stdio

```powershell
cd D:\VisionQA\web
npm run visual:mcp
```

MCP Server 提供三个工具：

- `get_visual_capabilities`：返回当前适配器的真实能力和边界；
- `review_visual`：校验请求并返回结构化评审结果；
- `plan_visual_repair`：生成需要宿主授权的修正计划。

当前 MCP Server 的 `writes=false`、`model_calls=false`。接入真实 Provider 时必须保持相同契约，并由宿主传入已授权的调用能力；不要把 API Key 写入浏览器或 MCP 响应。

## 真实 Provider 接入边界

真实模型接入不应修改 CLI 或 MCP 的请求形状。只需增加一个 `VisualProvider` 实现，将：

1. `ArtifactRef` 转换为 Provider 可读取的私有输入；
2. `Intent`、`Constraints` 和 profile 组合成模型请求；
3. Provider 原始结果解析成 `VisualReviewResponse`；
4. 记录模型、版本、耗时和费用，但不记录 Key、完整私有 URL 或原始图片。

当 `permissions.can_write_source=false` 时，结果只能是评审或计划；任何源文件写回都必须由宿主确认后调用单独的动作适配器。
