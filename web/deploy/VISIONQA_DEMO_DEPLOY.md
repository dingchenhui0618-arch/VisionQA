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

## Live deployment record — 2026-08-28

- Public URL: `https://visionqa.dionysusding.cn/` (307 to `/workspace`)
- Active release: `8c6512d`; previous rollback releases retained, including `4f7a035`, `c119de7`, `3fc8dc6`
- Source branch: `codex/visionqa-phase3-qwen`
- Package SHA-256: `BF5B419768121AADD8710D603FCCAFD1EA95E47D25A873A39722D0A765E2273D`
- Trial entry: two fixed invited accounts validated on the server; one phone/password login action; no SMS, registration, or password reset
- Session boundary: 12-hour hardened cookie and per-account local IndexedDB scope; this is not formal authentication or tenant isolation
- Release archive: `visionqa-demo-8c6512d.tar.gz`, SHA-256 `BF5B419768121AADD8710D603FCCAFD1EA95E47D25A873A39722D0A765E2273D`
- Trial flow: image/case selection, issue and boundary confirmation, repair recommendation, human release; provider and audit details stay folded until requested
- Acceptance: Nginx config valid; `visionqa-demo` active; root redirect, workspace, public URL after redirect, and main site all return expected status
- Browser QA: desktop trial click succeeds; 390x844 mobile viewport has no horizontal overflow; public console has 0 errors/warnings
- Evidence boundary: this release proves deployability and trial usability only, not model accuracy, customer adoption, payment, repurchase, or commercial success
