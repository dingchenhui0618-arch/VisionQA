BEGIN;

CREATE TABLE product_conversation_contexts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  project_id text NOT NULL REFERENCES projects(id),
  conversation_id text NOT NULL,
  product_id text NOT NULL,
  schema_version text NOT NULL,
  context_json jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, conversation_id)
);
CREATE INDEX product_context_project_idx ON product_conversation_contexts (tenant_id, project_id);

CREATE TABLE image_versions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  project_id text NOT NULL REFERENCES projects(id),
  conversation_id text NOT NULL,
  product_id text NOT NULL,
  asset_id text NOT NULL REFERENCES assets(id),
  parent_version_id text,
  version_kind text NOT NULL CHECK (version_kind IN ('original','repair')),
  instruction text NOT NULL,
  confirmation_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, tenant_id, project_id, conversation_id, product_id, asset_id),
  FOREIGN KEY (parent_version_id, tenant_id, project_id, conversation_id, product_id, asset_id)
    REFERENCES image_versions(id, tenant_id, project_id, conversation_id, product_id, asset_id)
);
CREATE INDEX image_versions_asset_created_idx ON image_versions (tenant_id, asset_id, created_at DESC);
CREATE INDEX image_versions_parent_idx ON image_versions (parent_version_id);

CREATE TABLE model_call_ledger (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  project_id text REFERENCES projects(id),
  conversation_id text,
  request_id text NOT NULL,
  request_fingerprint text NOT NULL,
  operation text NOT NULL,
  provider_id text NOT NULL,
  model_snapshot text NOT NULL,
  status text NOT NULL CHECK (status IN ('DISPATCHED','SUCCEEDED','FAILED','BLOCKED')),
  input_tokens integer,
  output_tokens integer,
  input_image_count integer,
  output_image_count integer,
  cost_amount double precision,
  cost_currency text NOT NULL DEFAULT 'CNY',
  latency_ms integer,
  retry_of text REFERENCES model_call_ledger(id),
  idempotency_key text NOT NULL,
  error_code text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX model_call_project_created_idx ON model_call_ledger (tenant_id, project_id, created_at DESC);

COMMIT;
