# VisionQA Dionysus demo deployment

Target: `visionqa.dionysusding.cn`

## Server layout

- Releases: `/www/wwwroot/visionqa.dionysusding.cn/releases/<release-id>`
- Active release: `/www/wwwroot/visionqa.dionysusding.cn/current`
- Loopback service: `127.0.0.1:3210`
- systemd: `/etc/systemd/system/visionqa-demo.service`
- Nginx: `/etc/nginx/conf.d/visionqa.dionysusding.cn.conf`

## Safety boundary

- Do not deploy `.env`, local material manifests, customer images, API keys, or database credentials.
- Qwen activation and paid calls stay disabled in the service unit.
- The public build is a demonstration workspace, not proof of model quality, authentication, customer adoption, or auto-pass capability.
- Keep `dionysusding.cn`, `dionysus-api`, OpenClaw, and BaoTa services unchanged.

## Rollback

Point `current` to the previous release, then restart `visionqa-demo` and reload Nginx after `nginx -t` succeeds.

## Live deployment record — 2026-08-21

- Public URL: `https://visionqa.dionysusding.cn/`
- Workspace URL: `https://visionqa.dionysusding.cn/workspace`
- Active release: `3fc8dc6`
- Source branch: `codex/visionqa-phase3-qwen`
- Authoritative DNS: DNSPod, `visionqa A 139.196.123.28`, TTL 600
- TLS: Let's Encrypt, expires 2026-11-19; automatic renewal timer active
- Acceptance: HTTP redirects to HTTPS; root/workspace/main site return 200; `visionqa-demo` and `dionysus-api` are active
- Browser QA: landing-to-workspace click succeeds; desktop and 390x844 mobile viewport have no console errors or horizontal overflow
- Runtime boundary: Qwen and paid calls disabled; internal preview login only; human final review and auto-pass-off remain mandatory
