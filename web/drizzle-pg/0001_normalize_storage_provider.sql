BEGIN;

SET LOCAL search_path TO public;

UPDATE assets
SET storage_provider = 'aliyun_oss'
WHERE storage_provider = 'aliyun-oss';

ALTER TABLE assets
  ALTER COLUMN storage_provider SET DEFAULT 'aliyun_oss';

COMMIT;
