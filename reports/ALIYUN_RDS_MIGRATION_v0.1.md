# VisionQA RDS migration status v0.1

Date: 2026-08-10

## Update 2026-08-13

- The Alibaba Cloud account recharge is complete.
- RDS instance `pgm-2ze0uziz73r8abb8` has been rechecked and is `Running`.
- The previous billing lock is cleared.
- No new API key, public database endpoint, or extra paid resource was created.
- Applied the PostgreSQL baseline and storage-provider normalization through DMS to database `visionqa_staging` as account `visionqa_app`.
- Verified all 11 required business tables exist in schema `public`.
- Verified `assets.storage_provider` defaults to `'aliyun_oss'::text`.
- Persisted one idempotent acceptance audit event; query result returned `persistent_write_count = 1`.
- Added `SET LOCAL search_path TO public` to both source migrations so later executions do not depend on the schema currently selected in DMS.
- Current gate: `RDS_MIGRATION_APPLIED / REAL_DB_READ_WRITE_VERIFIED / PUBLIC_ENDPOINT_DISABLED / FC_RUNTIME_PENDING`.

## Completed

- Created DMS service-linked role `AliyunServiceRoleForDMS`.
- Registered RDS instance `pgm-2ze0uziz73r8abb8` in DMS.
- DMS connection configuration for database `visionqa_staging` and account `visionqa_app` was accepted.
- Submitted DMS instance permission order `27189097` for query/export/change and approved it successfully.
- Confirmed database `visionqa_staging` exists and is owned by `visionqa_app`.

## Resolved blockers

- The overdue-account lock was cleared after recharge.
- The first DMS attempt was invalid because the editor's default `SELECT * FROM` prefix remained before the pasted script.
- The second attempt targeted the selected system schema `information_schema`; the final run explicitly targeted schema `public` and succeeded.

## Acceptance evidence

- `database_name = visionqa_staging`
- `database_user = visionqa_app`
- `visionqa_table_count = 11`
- `storage_provider_default = 'aliyun_oss'::text`
- `persistent_write_count = 1`

## Gate

`RDS_MIGRATION_APPLIED / REAL_DB_READ_WRITE_VERIFIED / PUBLIC_ENDPOINT_DISABLED / FC_RUNTIME_PENDING`

No public database endpoint was created. No password, API key, or secret value is recorded in this report.
