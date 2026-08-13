ALTER TABLE `batches` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `batches_tenant_idempotency_unique` ON `batches` (`tenant_id`,`idempotency_key`);