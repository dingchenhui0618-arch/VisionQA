# VisionQA Desktop Windows Alpha

This is a local-only Electron shell around the existing VisionQA plugin. It
does not change the website or deploy anything online.

## Boundary

- `main.mjs` owns the BrowserWindow and starts `web/scripts/start-local.mjs`
  on port 6300 when a local server is not already running.
- `preload.cjs` exposes only allow-listed status, capability, and export IPC.
- `renderer/` documents the renderer contract; the renderer has no Node.js
  access.
- Provider mode is `off` by default and explicitly blocks real Provider calls.
  The plugin UI has no Mock selector or demo state; offline fixtures remain only
  for automated regression tests.
- Source writes, arbitrary filesystem access, and shell execution are not
  exposed to the renderer. A newly typed Provider key exists only transiently
  in the settings form; it is sent through one allow-listed IPC save call,
  written by the main process, and never returned to the renderer.

Provider mode and the external, package-excluded secrets file are documented in
[`docs/desktop-provider-boundary.md`](../docs/desktop-provider-boundary.md).

## Development

The local Alpha pins Electron `38.2.0` as a development dependency in
`web/package.json`. Run the shell from `web/`:

```powershell
cd D:\VisionQA\web
npm run desktop:dev
```

The offline boundary test can run without opening Electron:

```powershell
cd D:\VisionQA\web
npm run desktop:test
```

The export IPC reserves JSON, Markdown, and SARIF output. It opens a native
save dialog and redacts fields that look like API keys, tokens, secrets,
passwords, or authorization headers before writing.

## Windows Alpha distribution

The reproducible developer shell is generated with:

```powershell
cd D:\VisionQA\web
npm run desktop:portable
```

It writes `web/dist/visionqa-desktop-alpha-portable/`. This is a slim
plugin-only developer bundle: it keeps `/plugin`, `/api/health`,
`/api/visual-review` and their VisionQA runtime closure, while excluding the
historical workbench routes and sample image paths. It also excludes
`node_modules`, Electron binaries, `.env` files, secrets, uploads and user
assets. Run `npm ci` inside its `web/` directory before launching.

The Windows x64 builder command is:

```powershell
cd D:\VisionQA\web
npm run desktop:builder:portable
```

The checked Windows evidence is the unpacked Electron shell at
`web/dist/electron/win-unpacked/VisionQA.exe`; a valid portable `.exe` was not
verified (the builder produced no usable portable artifact on this host).
Do not treat the unpacked shell as a customer installer. It is unsigned and
does not contain the full development dependency tree. A future customer
installer must bundle or replace the local server runtime, add signing, and
define update/rollback behavior before release.

## macOS Alpha distribution

The reproducible macOS developer bundle is generated with:

```powershell
cd D:\VisionQA\web
npm run desktop:mac:bundle
```

It writes `web/dist/visionqa-desktop-alpha-macos-bundle/`, containing the same
audited Electron entrypoint and a `launch.sh` launcher for macOS. The bundle
manifest declares `darwin` x64/arm64 targets, Provider mode off, no Provider
calls, and `installer_verified: false`. It intentionally excludes `node_modules`,
Electron binaries, `.env` files, secrets, uploads and user assets; run `npm ci`
inside its `web/` directory on the macOS host before launching.

To build unsigned x64 and arm64 zip artifacts, run this on a macOS host (not on
the Windows machine that generated the developer bundle):

```sh
cd web
npm run desktop:builder:mac
```

This repository does not claim a macOS `.app` or `.zip` has been generated or
visually verified yet. Signing, notarization, update and rollback policy remain
release decisions.

## Existing localhost service recovery

The desktop shell probes the provider-mode handshake before loading the plugin.
If `localhost:6300` is occupied by an unmanaged or incompatible service, it
automatically starts the independent desktop server on `localhost:6301` and
connects the Electron window there. It never terminates an unknown process.
An explicit `VISIONQA_DESKTOP_WEB_URL` still takes precedence when a caller
needs to choose a different localhost port. A second vinext process in the
same `web/` directory is still rejected by vinext's project lock.
