# VisionQA staging deployment — 2026-10-08

## Current state

- Host: `visionqa.dionysusding.cn` (`139.196.123.28`)
- Service: `visionqa-demo.service` on loopback port `3210`
- Public login: `https://visionqa.dionysusding.cn/login` returned `200` and renders the invite-only customer entry screen.
- Public workspace: `https://visionqa.dionysusding.cn/workspace` returned `200`.
- Payment capability: `GET /api/payment-capability` returned `200` with `provider: disabled`.
- Current server release: `releases/20261008-707d6d6`, restored from the complete server-side archive so the staging service remains available.

## Latest deployment verification — 2026-10-09

- The release candidate `visionqa-release-b38d68e-20261008.tar.gz` was uploaded through Alibaba Workbench to `/tmp` and its SHA-256 matched `9E9959DFD3EB7268FA5AA86B413371FB4FFA028AA5AF30322137EC45D31B7D2E`.
- The server switched atomically to `/www/wwwroot/visionqa.dionysusding.cn/releases/20261009-045749` and restarted `visionqa-demo.service`.
- Server-side health probe returned `{"status":"ok","service":"visionqa","probe":"liveness","releaseMode":"beta","paymentProvider":"disabled"}`.
- Public smoke check passed all four checks: `health=true`, `paymentDisabled=true`, `login=true`, `workspace=true` (`200/200/200/307`; the unauthenticated workspace redirect is expected).
- The previous release remains under `releases/` for rollback.

## Important verification boundary

The previous server-side archive predates the health endpoint and returned `404` for `GET /api/health`; that was a release-version mismatch, not evidence that the service was healthy. The latest local release candidate is built and tested at commit `b38d68e`, has now been deployed through the repaired Alibaba Workbench transfer path, and passed the server-side and public smoke checks listed above.

## Local release evidence

- `npm run release:export` completed successfully after the packaging fix.
- `npm run test:staging-surface -- https://visionqa.dionysusding.cn` now provides a repeatable public-surface check; the current result is `health=false` (404), `paymentDisabled=true`, `login=true`, `workspace=true` (307 login redirect is expected without a session).
- The same smoke check against a freshly started local production server on port `3211` returned all four checks true (`health=200`, `paymentDisabled=true`, `login=200`, `workspace=307`), proving the latest build artifact contains the health route and the remaining failure is staging drift.
- The candidate contains `dist/client`, `dist/server`, `public`, package metadata, and no raw secrets.
- `npm test`, release checks, lint, build, and production smoke checks passed locally before this staging attempt.

## Transfer path prepared

The same non-secret tarball remains available in the private GitHub release tag `staging-transfer-20261008` as a recovery transport artifact. It is not a runtime dependency.

## Next safe action

Keep the repaired Workbench path and atomic installer as the staging deployment procedure. Before inviting users to a future release, require `GET /api/health`, `/api/payment-capability`, `/login`, and `/workspace` to pass again. Keep the previous release for rollback until the new release has been observed in use.

The server-side atomic install sequence is prepared in `deploy/install-release-from-url.sh`; it requires a short-lived `RELEASE_URL` and the published SHA-256, verifies the archive before extraction, installs dependencies before switching `current`, and checks `/api/health` after restart.
