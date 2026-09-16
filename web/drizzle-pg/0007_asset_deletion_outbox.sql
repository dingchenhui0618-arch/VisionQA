BEGIN;
-- Private object deletion cannot participate in a PostgreSQL transaction.
-- Keep retryable cleanup records after hiding the project and its assets.
CREATE TABLE asset_deletion_jobs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  project_id text NOT NULL REFERENCES projects(id),
  asset_id text NOT NULL REFERENCES assets(id),
  object_key text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz,
  UNIQUE (tenant_id, asset_id)
);
CREATE INDEX asset_deletion_pending_idx ON asset_deletion_jobs (status, created_at);
COMMIT;
