CREATE TABLE `batch_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`role` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `batch_assets_batch_asset_role_unique` ON `batch_assets` (`batch_id`,`asset_id`,`role`);--> statement-breakpoint
CREATE UNIQUE INDEX `batch_assets_batch_role_position_unique` ON `batch_assets` (`batch_id`,`role`,`position`);--> statement-breakpoint
CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`scenario` text NOT NULL,
	`commercial_template_id` text,
	`commercial_template_version` text,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`locked_attributes_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `batches_tenant_created_idx` ON `batches` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `evaluation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`run_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`status` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_retry_at` text,
	`error_code` text,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `evaluation_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_jobs_tenant_idempotency_unique` ON `evaluation_jobs` (`tenant_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `evaluation_jobs_status_retry_idx` ON `evaluation_jobs` (`status`,`next_retry_at`);--> statement-breakpoint
ALTER TABLE `asset_evaluations` ADD `tenant_id` text;--> statement-breakpoint
ALTER TABLE `asset_evaluations` ADD `result_json` text;--> statement-breakpoint
ALTER TABLE `asset_evaluations` ADD `schema_version` text;--> statement-breakpoint
ALTER TABLE `asset_evaluations` ADD `result_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `asset_evaluations` ADD `commercial_template_id` text;--> statement-breakpoint
ALTER TABLE `asset_evaluations` ADD `commercial_template_version` text;--> statement-breakpoint
ALTER TABLE `asset_evaluations` ADD `model_status` text;--> statement-breakpoint
ALTER TABLE `asset_evaluations` ADD `gate_status` text;--> statement-breakpoint
ALTER TABLE `asset_evaluations` ADD `latency_ms` integer;--> statement-breakpoint
ALTER TABLE `asset_evaluations` ADD `cost_amount` real;--> statement-breakpoint
ALTER TABLE `asset_evaluations` ADD `cost_currency` text;--> statement-breakpoint
CREATE UNIQUE INDEX `asset_evaluations_run_asset_unique` ON `asset_evaluations` (`run_id`,`asset_id`);--> statement-breakpoint
CREATE INDEX `asset_evaluations_tenant_created_idx` ON `asset_evaluations` (`tenant_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `assets` ADD `tenant_id` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `sha256` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `mime_type` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `byte_size` integer;--> statement-breakpoint
ALTER TABLE `assets` ADD `r2_key` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `retention_until` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `deleted_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `assets_tenant_sha256_unique` ON `assets` (`tenant_id`,`sha256`);--> statement-breakpoint
CREATE INDEX `assets_batch_idx` ON `assets` (`batch_id`);--> statement-breakpoint
ALTER TABLE `audit_events` ADD `request_id` text;--> statement-breakpoint
ALTER TABLE `audit_events` ADD `tenant_id` text;--> statement-breakpoint
CREATE INDEX `audit_events_entity_created_idx` ON `audit_events` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_tenant_created_idx` ON `audit_events` (`tenant_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `evaluation_runs` ADD `tenant_id` text;--> statement-breakpoint
ALTER TABLE `evaluation_runs` ADD `batch_id` text REFERENCES batches(id);--> statement-breakpoint
ALTER TABLE `evaluation_runs` ADD `provider_id` text;--> statement-breakpoint
ALTER TABLE `evaluation_runs` ADD `adapter_version` text;--> statement-breakpoint
ALTER TABLE `evaluation_runs` ADD `taxonomy_version` text;--> statement-breakpoint
ALTER TABLE `evaluation_runs` ADD `threshold_policy_version` text;--> statement-breakpoint
ALTER TABLE `evaluation_runs` ADD `status` text DEFAULT 'QUEUED' NOT NULL;--> statement-breakpoint
ALTER TABLE `evaluation_runs` ADD `request_id` text;--> statement-breakpoint
ALTER TABLE `evaluation_runs` ADD `idempotency_key` text;--> statement-breakpoint
ALTER TABLE `evaluation_runs` ADD `started_at` text;--> statement-breakpoint
ALTER TABLE `evaluation_runs` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `human_overrides` ADD `tenant_id` text;--> statement-breakpoint
ALTER TABLE `human_overrides` ADD `request_id` text;--> statement-breakpoint
ALTER TABLE `human_overrides` ADD `idempotency_key` text;--> statement-breakpoint
ALTER TABLE `human_overrides` ADD `base_evaluation_version` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `human_overrides_tenant_idempotency_unique` ON `human_overrides` (`tenant_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `human_overrides_evaluation_created_idx` ON `human_overrides` (`asset_evaluation_id`,`created_at`);