BEGIN;

ALTER TABLE screening_batches ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE screening_batches ADD COLUMN IF NOT EXISTS request_fingerprint text;
CREATE UNIQUE INDEX IF NOT EXISTS screening_batches_tenant_idempotency_unique
  ON screening_batches (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS screening_batches_project_running_unique
  ON screening_batches (tenant_id, project_id)
  WHERE status = 'RUNNING';

CREATE TABLE IF NOT EXISTS screening_batch_assets (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  batch_id text NOT NULL REFERENCES screening_batches(id),
  asset_id text NOT NULL REFERENCES assets(id),
  role text NOT NULL CHECK (role IN ('TRUTH','CANDIDATE')),
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (batch_id, asset_id, role),
  UNIQUE (batch_id, role, position)
);
CREATE INDEX IF NOT EXISTS screening_batch_assets_tenant_asset_idx
  ON screening_batch_assets (tenant_id, asset_id);

COMMIT;
