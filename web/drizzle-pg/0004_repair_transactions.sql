BEGIN;

ALTER TABLE repair_attempts
  ADD COLUMN request_fingerprint text,
  ADD COLUMN execution_owner text,
  ADD COLUMN execution_started_at timestamptz;

UPDATE repair_attempts SET request_fingerprint = idempotency_key
WHERE request_fingerprint IS NULL;

ALTER TABLE repair_attempts
  ALTER COLUMN request_fingerprint SET NOT NULL;

ALTER TABLE assets
  ADD COLUMN repair_attempt_id text REFERENCES repair_attempts(id);

CREATE UNIQUE INDEX repair_attempts_one_active_project
  ON repair_attempts (tenant_id, project_id)
  WHERE status IN ('HELD','RUNNING');

CREATE UNIQUE INDEX credit_ledger_once_per_transition
  ON credit_ledger_entries (tenant_id, entry_type, reference_id);

CREATE UNIQUE INDEX assets_one_output_per_repair
  ON assets (tenant_id, repair_attempt_id)
  WHERE repair_attempt_id IS NOT NULL;

COMMIT;
