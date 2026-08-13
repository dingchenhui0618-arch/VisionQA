# VisionQA FC 3.0 staging runbook v0.1

## Non-negotiable boundaries

1. Region is `cn-beijing`; do not parameterize it.
2. This package is staging-only. Do not edit or redeploy the production Sites
   application as part of this runbook.
3. Instance concurrency is exactly `1`.
4. Secrets are injected through an approved secret-management path. Do not put
   secret values in Git, `s.yaml`, tickets, screenshots, or SLS.
5. Do not deploy from `s.example.yaml`. Copy it to an untracked `s.yaml` only
   after architecture, security, budget, and data-governance approval.

## Required reviewed bindings

- FC execution RAM role with OSS read limited to
  `staging/visionqa/<tenant>/...` and SLS write only.
- FC uses Function Role/RAM Role STS credentials. Static Aliyun AccessKey and
  SecurityToken environment variables are forbidden and make startup fail.
- VPC, vSwitch, and security-group binding for private PostgreSQL.
- Private OSS internal endpoint in Beijing.
- SLS project/logstore with retention approved by governance.
- Secret names listed by `config/fc-bindings.schema.json`.
- Accepted OSS, PostgreSQL, and Qwen governance evidence.

## Pre-deploy checks

```powershell
cd D:\VisionQA\web\aliyun-fc
npm run verify
```

Validate the final non-secret bindings against
`config/fc-bindings.schema.json`. Confirm the live environment has all six
explicit evidence gates and `FC_INSTANCE_CONCURRENCY=1`. Confirm the reviewed
composition root imports only:

- `ObjectStorage.head` and `ObjectStorage.presignGet`
- PostgreSQL repository `persistEvaluation` and job state methods
- governed Qwen provider `evaluate`

## Deployment sequence (requires explicit authorization)

1. Create isolated staging SLS, OSS, PostgreSQL and FC resources in Beijing.
2. Apply PostgreSQL migrations with a transaction and backup/rollback plan.
3. Bind secrets by name/value through the approved secret path.
4. Deploy fixture mode first.
5. Verify `/healthz`, `/readyz`, auth rejection and SLS redaction.
6. Run one fixture async task; verify `RUNNING -> SUCCEEDED`.
7. Replace fixture composition with the reviewed live composition.
8. Activate live mode only after a human approves the exact canary manifest.
9. Run at most one task at a time. Task timeout is 110 seconds inside the
   120-second FC timeout. Provider attempts remain bounded by the governed Qwen
   adapter; FC task attempts are capped at 3 including the first attempt.
10. Stop on any governance, cost, private-network, persistence or redaction
    failure. Do not fall back to public object URLs or an ungoverned provider.

## Health semantics

- `/healthz`: process liveness only.
- `/readyz`: validates dependency port shape and live provider identities.
- A missing live binding returns startup/readiness failure, not degraded success.

## SLS fields and redaction

Allowed structured fields include `timestamp`, `service`, `region`, `event`,
`request_id`, `tenant_id`, `asset_id`, `evaluation_id`, `provider_id`,
`duration_ms`, `outcome`, `error_code`, and `retryable`.

Authorization headers, cookies, tokens, passwords, API/access keys, signatures,
credentials, signed-query values, request bodies, provider raw responses, and
private URLs must never be logged.

## Rollback

Disable live activation, route no new tasks, wait for the single in-flight task,
and revert the FC version/alias. Preserve audit records but revoke temporary
signed URLs and rotate any secret whose exposure is suspected. Production Sites
must remain untouched.

Official behavior references:

- https://help.aliyun.com/zh/functioncompute/fc/web-functions
- https://help.aliyun.com/zh/functioncompute/fc/request-handlers
- https://help.aliyun.com/zh/functioncompute/fc-3-0/user-guide/configure-a-custom-health-check-policy-for-instances-1
- https://help.aliyun.com/zh/functioncompute/fc/custom-runtime/
