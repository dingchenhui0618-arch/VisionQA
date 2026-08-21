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
