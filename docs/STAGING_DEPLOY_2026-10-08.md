# VisionQA staging deployment — 2026-10-08

## Current state

- Host: `visionqa.dionysusding.cn` (`139.196.123.28`)
- Service: `visionqa-demo.service` on loopback port `3210`
- Public login: `https://visionqa.dionysusding.cn/login` returned `200` and renders the invite-only customer entry screen.
- Public workspace: `https://visionqa.dionysusding.cn/workspace` returned `200`.
- Payment capability: `GET /api/payment-capability` returned `200` with `provider: disabled`.
- Current server release: `releases/20261008-707d6d6`, restored from the complete server-side archive so the staging service remains available.

## Important verification boundary

The current server-side archive predates the health endpoint and returns `404` for `GET /api/health`; this is a release-version mismatch, not evidence that the service is healthy. The latest local release candidate is built and tested at commit `fb802d9` (release packaging fix and deployment evidence included), but the Alibaba Workbench file-transfer helper currently reports that uploads are unsupported in the active session. The latest candidate has therefore not been claimed as deployed.

## Local release evidence

- `npm run release:export` completed successfully after the packaging fix.
- The candidate contains `dist/client`, `dist/server`, `public`, package metadata, and no raw secrets.
- `npm test`, release checks, lint, build, and production smoke checks passed locally before this staging attempt.

## Next safe action

Enable or repair the Alibaba Workbench OSS-backed file-transfer capability (or provide an approved server-side transfer path), upload the candidate built from `fb802d9`, run `npm ci` in the new release directory, switch the `current` symlink atomically, and require `GET /api/health`, `/api/payment-capability`, `/login`, and `/workspace` to pass before inviting users. Keep the restored release for rollback until those checks pass.
