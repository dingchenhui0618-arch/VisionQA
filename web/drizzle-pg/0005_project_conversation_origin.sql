BEGIN;
-- Preserve the existing local tenant/user/conversation idempotency boundary.
-- Tombstoned projects retain their origin so old requests cannot resurrect them.
ALTER TABLE projects ADD COLUMN origin_user_id text REFERENCES users(id);
ALTER TABLE projects ADD COLUMN origin_conversation_id text;
ALTER TABLE projects ADD CONSTRAINT project_origin_pair CHECK (
  (origin_user_id IS NULL AND origin_conversation_id IS NULL) OR
  (origin_user_id IS NOT NULL AND origin_conversation_id IS NOT NULL)
);
CREATE UNIQUE INDEX projects_conversation_origin_idx
  ON projects(tenant_id, origin_user_id, origin_conversation_id);
COMMIT;
