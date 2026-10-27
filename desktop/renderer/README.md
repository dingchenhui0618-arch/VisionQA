# VisionQA Desktop Alpha renderer boundary

The renderer is the existing localhost web app loaded by `desktop/main.mjs` at
`http://localhost:6300/plugin`. It does not receive Node.js or Electron APIs.

The only desktop surface exposed to the renderer is `window.visionqaDesktop`,
provided by `preload.cjs` through `contextBridge`:

- `runtime.getStatus()`
- `runtime.getCapabilities()`
- `provider.getSettings()`
- `provider.check()` (local readiness only; no model request)
- `provider.saveSettings({ mode, provider_id, endpoint, model, max_total_requests, api_key })`
- `provider.clearKey()`
- `provider.restart()`
- `exportReview({ format: "json" | "markdown" | "sarif", review })`

The preload contract is deliberately allow-listed. No arbitrary path, shell,
filesystem, or source-write IPC is exposed. Provider keys remain server-side;
the Alpha scaffold advertises `provider_calls: false` by default and starts
the localhost app with Provider mode off. Offline fixtures are test-only.
The settings form holds a newly typed key only in renderer memory until the
user submits it; the main process writes it to the package-external secrets
file and never returns the key to the renderer.
