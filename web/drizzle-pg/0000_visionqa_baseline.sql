BEGIN;

SET LOCAL search_path TO public;

CREATE TABLE batches (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  scenario text NOT NULL,
  commercial_template_id text,
  commercial_template_version text,
  status text NOT NULL,
  created_by text NOT NULL,
  idempotency_key text,
  request_sha256 text,
  locked_attributes_json text NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX batches_tenant_idempotency_unique
  ON batches (tenant_id, idempotency_key);
CREATE INDEX batches_tenant_created_idx ON batches (tenant_id, created_at);

CREATE TABLE assets (
  id text PRIMARY KEY,
  batch_id text NOT NULL,
  tenant_id text,
  source_url text NOT NULL,
  product_label text NOT NULL,
  sha256 text,
  mime_type text,
  byte_size bigint,
  storage_provider text NOT NULL DEFAULT 'aliyun_oss',
  object_key text,
  storage_region text NOT NULL DEFAULT 'cn-beijing',
  retention_until timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX assets_tenant_sha256_unique ON assets (tenant_id, sha256);
CREATE INDEX assets_batch_idx ON assets (batch_id);

CREATE TABLE batch_assets (
  id text PRIMARY KEY,
  batch_id text NOT NULL REFERENCES batches(id),
  asset_id text NOT NULL REFERENCES assets(id),
  role text NOT NULL,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX batch_assets_batch_asset_role_unique
  ON batch_assets (batch_id, asset_id, role);
CREATE UNIQUE INDEX batch_assets_batch_role_position_unique
  ON batch_assets (batch_id, role, position);

CREATE TABLE evaluation_runs (
  id text PRIMARY KEY,
  tenant_id text,
  batch_id text REFERENCES batches(id),
  provider_id text,
  adapter_version text,
  model_snapshot text NOT NULL,
  prompt_version text NOT NULL,
  taxonomy_version text,
  score_policy_version text NOT NULL,
  threshold_policy_version text,
  gate_policy_version text NOT NULL,
  calibration_status text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED',
  request_id text,
  idempotency_key text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE evaluation_jobs (
  id text PRIMARY KEY,
  tenant_id text,
  run_id text REFERENCES evaluation_runs(id),
  asset_id text REFERENCES assets(id),
  status text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  error_code text,
  request_id text,
  evaluation_id text,
  state_version integer NOT NULL DEFAULT 1 CHECK (state_version >= 1),
  last_state_key text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX evaluation_jobs_tenant_idempotency_unique
  ON evaluation_jobs (tenant_id, idempotency_key);
CREATE INDEX evaluation_jobs_status_retry_idx
  ON evaluation_jobs (status, next_retry_at);

CREATE TABLE asset_evaluations (
  id text PRIMARY KEY,
  tenant_id text,
  asset_id text NOT NULL REFERENCES assets(id),
  run_id text NOT NULL REFERENCES evaluation_runs(id),
  decision text NOT NULL,
  overall_score double precision,
  skill_scores_json text NOT NULL,
  issues_json text NOT NULL,
  commercial_assessment text NOT NULL,
  repair_prompt text NOT NULL,
  locked_attributes_json text NOT NULL,
  result_json text,
  result_sha256 text,
  schema_version text,
  result_version integer NOT NULL DEFAULT 1 CHECK (result_version >= 1),
  idempotency_key text,
  commercial_template_id text,
  commercial_template_version text,
  model_status text,
  gate_status text,
  latency_ms integer,
  cost_amount double precision,
  cost_currency text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX asset_evaluations_run_asset_unique
  ON asset_evaluations (run_id, asset_id);
CREATE UNIQUE INDEX asset_evaluations_tenant_idempotency_unique
  ON asset_evaluations (tenant_id, idempotency_key);
CREATE INDEX asset_evaluations_tenant_created_idx
  ON asset_evaluations (tenant_id, created_at);

CREATE TABLE human_overrides (
  id text PRIMARY KEY,
  tenant_id text,
  asset_evaluation_id text NOT NULL REFERENCES asset_evaluations(id),
  original_decision text NOT NULL,
  human_decision text NOT NULL,
  reason_code text NOT NULL,
  evidence_note text NOT NULL,
  reviewer_id text NOT NULL,
  request_id text,
  idempotency_key text,
  base_evaluation_version integer,
  resulting_evaluation_version integer,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX human_overrides_tenant_idempotency_unique
  ON human_overrides (tenant_id, idempotency_key);
CREATE UNIQUE INDEX human_overrides_evaluation_base_version_unique
  ON human_overrides (asset_evaluation_id, base_evaluation_version);
CREATE INDEX human_overrides_evaluation_created_idx
  ON human_overrides (asset_evaluation_id, created_at);

CREATE TABLE commercial_templates (
  id text PRIMARY KEY,
  template_id text NOT NULL,
  version text NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  config_json text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE commercial_profiles (
  id text PRIMARY KEY,
  client_id text NOT NULL,
  version text NOT NULL,
  template_id text NOT NULL REFERENCES commercial_templates(id),
  status text NOT NULL,
  preferences_json text NOT NULL,
  accepted_event_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE commercial_recalibration_logs (
  id text PRIMARY KEY,
  client_id text NOT NULL,
  commercial_template_id text NOT NULL REFERENCES commercial_templates(id),
  commercial_profile_id text REFERENCES commercial_profiles(id),
  asset_evaluation_id text NOT NULL REFERENCES asset_evaluations(id),
  system_fit_score double precision,
  human_fit_score double precision,
  original_decision text NOT NULL,
  human_decision text NOT NULL,
  reason_code text NOT NULL,
  evidence_note text NOT NULL,
  status text NOT NULL DEFAULT 'CAPTURED',
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at timestamptz
);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id text,
  tenant_id text,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  actor_id text NOT NULL,
  payload_json text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX audit_events_entity_created_idx
  ON audit_events (entity_type, entity_id, created_at);
CREATE INDEX audit_events_tenant_created_idx
  ON audit_events (tenant_id, created_at);

COMMIT;
