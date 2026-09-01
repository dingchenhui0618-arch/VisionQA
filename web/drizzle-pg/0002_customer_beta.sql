BEGIN;

CREATE TABLE users (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  phone_e164 text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tenants (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE memberships (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  tenant_id text NOT NULL REFERENCES tenants(id),
  role text NOT NULL CHECK (role IN ('customer','admin','developer')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, tenant_id)
);
CREATE INDEX memberships_tenant_idx ON memberships (tenant_id);

CREATE TABLE invites (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  label text NOT NULL,
  role text NOT NULL CHECK (role IN ('customer','admin','developer')),
  initial_credits integer NOT NULL CHECK (initial_credits >= 0),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by_user_id text REFERENCES users(id),
  created_by_user_id text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX invites_expires_unused_idx ON invites (expires_at) WHERE consumed_at IS NULL;

CREATE TABLE sessions (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  user_id text NOT NULL REFERENCES users(id),
  tenant_id text NOT NULL REFERENCES tenants(id),
  membership_id text NOT NULL REFERENCES memberships(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX sessions_user_active_idx ON sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE projects (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT','SCREENING','REPAIRING','COMPLETED')),
  is_example boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX projects_tenant_updated_idx ON projects (tenant_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE screening_batches (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  project_id text NOT NULL REFERENCES projects(id),
  sku_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz
);
CREATE INDEX screening_batches_project_created_idx ON screening_batches (project_id, created_at DESC);

CREATE TABLE screening_items (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  batch_id text NOT NULL REFERENCES screening_batches(id),
  asset_id text NOT NULL REFERENCES assets(id),
  decision text NOT NULL CHECK (decision IN ('NEEDS_ATTENTION','NO_OBVIOUS_ISSUE','NEEDS_MANUAL_CHECK')),
  primary_issue text,
  visible_evidence text NOT NULL,
  repair_prompt text,
  issue_region_json jsonb,
  internal_observations_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  customer_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (batch_id, asset_id)
);
CREATE INDEX screening_items_tenant_decision_idx ON screening_items (tenant_id, decision);

CREATE TABLE repair_attempts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  project_id text NOT NULL REFERENCES projects(id),
  screening_item_id text NOT NULL REFERENCES screening_items(id),
  source_asset_id text NOT NULL REFERENCES assets(id),
  output_asset_id text REFERENCES assets(id),
  issue text NOT NULL,
  issue_region_json jsonb NOT NULL,
  locked_regions_json jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('HELD','RUNNING','CAPTURED','RELEASED')),
  gate_version text NOT NULL,
  gate_result text NOT NULL CHECK (gate_result IN ('PENDING','PASSED','BLOCKED')),
  idempotency_key text NOT NULL,
  failure_reason text,
  provider_id text,
  model_snapshot text,
  provider_request_id text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX repair_attempts_tenant_created_idx ON repair_attempts (tenant_id, created_at DESC);

CREATE TABLE credit_wallets (
  tenant_id text PRIMARY KEY REFERENCES tenants(id),
  available integer NOT NULL DEFAULT 0 CHECK (available >= 0),
  held integer NOT NULL DEFAULT 0 CHECK (held >= 0),
  captured integer NOT NULL DEFAULT 0 CHECK (captured >= 0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE credit_holds (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  repair_attempt_id text NOT NULL UNIQUE REFERENCES repair_attempts(id),
  status text NOT NULL CHECK (status IN ('HELD','CAPTURED','RELEASED')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX credit_holds_tenant_active_idx ON credit_holds (tenant_id) WHERE status = 'HELD';

CREATE TABLE credit_ledger_entries (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  entry_type text NOT NULL CHECK (entry_type IN ('GRANT','HOLD','CAPTURE','RELEASE','ADJUSTMENT')),
  amount integer NOT NULL,
  reference_id text NOT NULL,
  reason text NOT NULL,
  created_by_user_id text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX credit_ledger_tenant_created_idx ON credit_ledger_entries (tenant_id, created_at DESC);

CREATE TABLE payment_orders (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  provider text NOT NULL CHECK (provider IN ('disabled','test','wechat','alipay')),
  merchant_order_no text NOT NULL UNIQUE,
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL DEFAULT 'CNY',
  credits integer NOT NULL CHECK (credits >= 0),
  status text NOT NULL CHECK (status IN ('DISABLED','CREATED','PAID','REFUNDED','FAILED')),
  callback_idempotency_key text UNIQUE,
  callback_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE assets ADD COLUMN IF NOT EXISTS project_id text REFERENCES projects(id);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS asset_role text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS width integer;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS upload_status text DEFAULT 'READY';
CREATE INDEX IF NOT EXISTS assets_tenant_project_idx ON assets (tenant_id, project_id) WHERE deleted_at IS NULL;

COMMIT;
