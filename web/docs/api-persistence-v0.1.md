# VisionQA persistence API v0.1

All write operations require an authenticated internal pilot user and an
`Idempotency-Key` header. `X-Request-Id` is optional; the server generates one
when absent. Error responses use:

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "human readable message",
    "request_id": "request correlation id",
    "retryable": false
  }
}
```

## Create a batch

`POST /api/batches`

```json
{
  "scenario": "fashion_ecommerce_ai_model_image",
  "commercialTemplateId": "platform-promo",
  "commercialTemplateVersion": "0.2",
  "lockedAttributes": ["颜色", "印花"],
  "assets": [
    {
      "id": "asset_candidate_1",
      "role": "CANDIDATE",
      "position": 0,
      "sha256": "64 lowercase or uppercase hex characters",
      "sourceUrl": "private://registered-asset",
      "productLabel": "SKU candidate",
      "mimeType": "image/jpeg",
      "byteSize": 123456,
      "r2Key": "tenant/.../asset.jpg"
    }
  ]
}
```

This endpoint registers metadata only. It does not implement public or direct
R2 upload.

## Persist a complete evaluation

`POST /api/evaluations`

```json
{
  "result": "<complete evaluation-result-v0.3 object>",
  "execution": {
    "run_id": "run_...",
    "created_at": "2026-07-29T00:00:00Z",
    "model_snapshot": "provider/model snapshot",
    "prompt_version": "prompt-0.3",
    "taxonomy_version": "taxonomy-0.3",
    "score_policy_version": "score-0.3",
    "threshold_policy_version": "threshold-0.3",
    "gate_policy_version": "gate-0.3",
    "provider_adapter_version": "adapter-0.1",
    "asset_id": "asset_...",
    "asset_sha256": "64 hex characters",
    "locked_attributes": ["颜色", "印花"],
    "latency_ms": 1200,
    "cost_amount": null,
    "cost_currency": null
  },
  "commercialTemplateId": "platform-promo",
  "commercialTemplateVersion": "0.2"
}
```

The full v0.3 object is stored in `result_json`; query columns are projections
and are not the source of truth. v0.3 intentionally separates decision content
from provider/run metadata, so the API requires the `execution` envelope.
Historical v0.2 objects remain accepted and supply their own embedded execution
metadata.

## Read an evaluation and its override history

`GET /api/evaluations/{evaluation_id}`

Returns the complete result, current immutable result version, and ordered
override events belonging to the authenticated tenant.

## Append a human override

`POST /api/evaluations/{evaluation_id}/overrides`

```json
{
  "baseEvaluationVersion": 1,
  "originalDecision": "REVIEW",
  "humanDecision": "REJECT",
  "reasonCode": "PRODUCT_MISMATCH",
  "evidenceNote": "袖口结构与参考商品图不一致",
  "commercialTemplateId": "platform-promo",
  "commercialTemplateVersion": "0.2",
  "systemFitScore": 82
}
```

Overrides are append-only. The request does not mutate or delete the original
model result.
