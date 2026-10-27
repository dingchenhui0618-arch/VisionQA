# VisionQA Desktop Provider 边界

这份说明定义 Electron Windows/macOS Alpha 如何在本地使用用户自己的多模态
Provider。它不把密钥放进 React、Chrome 扩展、preload、IPC 响应、安装包或日志。

## 两层职责

### 1. 本地服务端密钥注入

Electron 启动 `web/scripts/start-local.mjs`，脚本只在桌面模式为 `real` 时读取包外
的 secrets 文件。文件采用简单的 `NAME=value` 格式，只接受 Provider 配置白名单；
未知环境变量会被忽略，不会成为任意进程环境注入通道。

默认路径：

- Windows：`%APPDATA%/VisionQA/secrets/provider.env`
- macOS：`~/Library/Application Support/VisionQA/secrets/provider.env`
- Linux：`$XDG_CONFIG_HOME/VisionQA/secrets/provider.env`，否则
  `~/.config/VisionQA/secrets/provider.env`

也可以通过 `VISIONQA_DESKTOP_SECRETS_FILE` 指定一个绝对路径。该文件必须位于
项目和桌面包之外；类 Unix 系统要求文件权限不对组或其他用户开放。示例：

```dotenv
VISION_MULTIMODAL_ENDPOINT=https://api.deepseek.com/chat/completions
VISION_MULTIMODAL_MODEL=deepseek-v4-flash
VISION_MULTIMODAL_PROVIDER_ID=deepseek
VISION_MULTIMODAL_MAX_TOTAL_REQUESTS=10
DEEPSEEK_API_KEY=只在本机文件中填写
```

密钥只进入本地 Web 服务进程的环境。服务端已有 Provider readiness、请求权限、
额度和 localhost gate；缺少任何条件时在发出网络请求前失败关闭。

## 2. 桌面端 Provider 开关

开关是 Electron 启动配置，而不是网页里的随手点击按钮：

```text
VISIONQA_DESKTOP_PROVIDER_MODE=off   # 默认，禁止真实 Provider 调用
VISIONQA_DESKTOP_PROVIDER_MODE=real  # 允许本地服务读取包外 secrets
```

桌面主进程只把无密钥模式传给 Web 子进程，并通过 `visionqaDesktop.runtime`
返回 `provider_mode`、`provider_calls` 和 `provider_config_source`。Renderer
永远拿不到密钥。

`off` 模式在服务端额外阻断 `auto/qwen` 真实 Provider 路径，不能通过修改浏览器
请求体绕过；离线 Mock 仅保留给自动化测试和安全回归，不出现在插件 UI。

`real` 模式并不代表一定会扣费或一定成功。它仍然需要：

- secrets 文件中的 endpoint、model、provider id 和 API key；
- VisualReview 请求的 `can_call_model=true`；
- 本地 localhost gate；
- Provider readiness、请求上限与现有治理条件通过。

Electron 启动时还会校验 `http://localhost:6300/api/visual-review` 返回的
`desktop_runtime.provider_mode`。如果 6300 已被普通开发服务器占用，模式握手
不会通过，Electron 会停止加载，而不是误连到一个未受桌面开关管理的服务。
错误对话框会给出恢复步骤；也可以设置
`VISIONQA_DESKTOP_WEB_URL=http://localhost:6301`，桌面子服务会同步使用 6301，
不会强行终止未知进程。若 6300 的服务仍来自同一个 `web/` 目录，需从独立
portable bundle 目录启动桌面端；vinext 不允许同一目录并行启动第二个开发服务。

当前 Alpha 不支持在 UI 内热切换，也不自动重启服务。修改模式或 secrets 文件后，
先关闭再重新启动 Electron，避免在正在运行的请求中改变计费边界。

## 桌面设置 GUI

桌面插件的“设置”页现在可以编辑 Provider ID、OpenAI-compatible Endpoint、
模型名、API Key 和本地请求上限，也可以读取服务端 readiness 或清除本机 Key。
“检查服务端配置”只读取本地 `/api/visual-review` 的配置状态，不发送图片、不消耗
模型额度。提交时 API Key 只通过受限的 contextBridge
IPC 进入 Electron 主进程，主进程写入包外的 `provider.env`，不会回传给页面，
也不会写入 localStorage、导出结果或日志。保存后需要重启桌面应用；页面只显示
“已检测到本机密钥”，不会回填或展示密钥内容。

浏览器直接打开 `/plugin` 时，这个设置页仅用于展示，不能保存密钥；必须使用
Electron 桌面 Alpha 的设置页。

## 启动示例

PowerShell：

```powershell
$env:VISIONQA_DESKTOP_PROVIDER_MODE = "real"
$env:VISIONQA_DESKTOP_SECRETS_FILE = "C:\Users\<user>\AppData\Roaming\VisionQA\secrets\provider.env"
cd D:\VisionQA\web
npm run desktop:dev
```

不设置变量或显式设为 `off` 时，桌面端不会发起真实 Provider 请求。
如果 6300 已经有普通开发服务器运行，请先停止它；Electron 只接受带有相同
Provider 模式握手的本地服务，不会静默复用不受桌面开关管理的进程。

## 验收边界

- API key 不出现在 `preload.cjs`、React props、DOM、IPC 返回值、导出文件或普通日志；
- portable / electron-builder 产物排除 `.env*`、`secrets/`、uploads 和用户资产；
- `off` 模式的真实 Provider fetch 次数为零；
- `real` 模式只读取白名单变量，并复用现有 Provider readiness 和预算守卫；
- “桌面进程启动成功”不等于“模型质量有效”，真实模型质量仍需单独记录证据。
