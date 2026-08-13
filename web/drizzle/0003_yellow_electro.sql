ALTER TABLE `asset_evaluations` ADD `result_sha256` text;--> statement-breakpoint
ALTER TABLE `asset_evaluations` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `asset_evaluations_tenant_idempotency_unique` ON `asset_evaluations` (`tenant_id`,`idempotency_key`);