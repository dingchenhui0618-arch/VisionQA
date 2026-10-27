# VisionQA Chrome Host Adapter

这是一个本地 Manifest V3 原型，不是商店发布包。它只负责采集当前标签页的：

- 当前可见截图（`chrome.tabs.captureVisibleTab`）；
- DOM 文本、标题层级、语义区域和交互元素摘要；
- 可定位的 DOM selector、视口内 bounding box、受限 computed style 摘要和当前选中元素；
- 基于稳定 URL/DOM 摘要的页面 revision（只发送短哈希，不发送完整 HTML）；
- 宿主页面主动声明的 `window.__VISIONQA_HOST_CONTEXT__.conversation` 对话上下文；

随后把 `visionqa-host-capture-v0.2` 发到本机 `POST http://localhost:6300/api/visual-review/host`，请求交给服务端 `auto` 选择已配置的视觉模型。没有明确开启本地真实 Provider 时，服务端会失败关闭并返回普通用户可理解的提示；扩展不会把 Mock/fixture 结果冒充真实模型质量。离线 Mock 只用于显式的开发测试路径。
URL 会移除 query/hash；DOM、样式、几何和对话只发送有上限的摘要，不读取页面源文件或输入框密钥。Host Capture 永远不会授予源码写入权限。

安装方式：Chrome 扩展管理页打开“开发者模式” → “加载已解压的扩展程序” → 选择本目录。

加载后复制 `chrome://extensions` 中显示的扩展 ID，在 `web/.env.local` 写入：

```text
VISIONQA_CHROME_EXTENSION_ID=<这里替换成扩展 ID>
```

然后重启 localhost:6300。服务端只允许这个扩展 ID 的 Origin；如果不配置，开发冒烟默认使用 `audit`，实际加载的扩展通常不会是这个 ID。

扩展本身没有任何模型密钥。模型配置只存在 VisionQA 本地服务端环境变量中，且当前只接受一个 OpenAI-compatible 多模态 Chat Completions 配置。点击“评审当前页面”才会授予本次 `can_call_model` 权限；如果本地服务未开启真实 Provider，扩展会明确提示“没有形成判断”，不会降级为假结论；插件仍不会写回当前网页。
