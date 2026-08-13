# VisionQA Aliyun FC 3.0 runtime skeleton

This directory is a deployment-neutral Node.js 20 skeleton. It does not create
or change cloud resources and defaults to fixture dependencies.

## Runtime surfaces

- Web Function: `GET /healthz`, `GET /readyz`, `POST /v1/evaluations`
- Internal async surface: `POST /internal/tasks/evaluations`
- Event/Task Function handler: `src/task.handler`

The runtime consumes injected ports compatible with the project OSS
`head/presignGet` contract, PostgreSQL `persistEvaluation` contract, and the
governed Qwen `evaluate` contract. The actual live composition root is
intentionally absent until all three governance evidence gates are accepted.

## Local verification

```powershell
cd D:\VisionQA\web\aliyun-fc
npm run verify
```

Local fixture mode performs no OSS, PostgreSQL, Qwen, or paid network calls.
`VISIONQA_RUNTIME_MODE=live` fails closed unless every governance gate, secret
name, and concurrency guard is present; even then the checked-in bootstraps
refuse to start until a reviewed live composition root is supplied.

See `RUNBOOK.md` before any deployment.
