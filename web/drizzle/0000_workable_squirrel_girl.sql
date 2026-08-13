CREATE TABLE `asset_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`run_id` text NOT NULL,
	`decision` text NOT NULL,
	`overall_score` real,
	`skill_scores_json` text NOT NULL,
	`issues_json` text NOT NULL,
	`commercial_assessment` text NOT NULL,
	`repair_prompt` text NOT NULL,
	`locked_attributes_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `evaluation_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`source_url` text NOT NULL,
	`product_label` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evaluation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`model_snapshot` text NOT NULL,
	`prompt_version` text NOT NULL,
	`score_policy_version` text NOT NULL,
	`gate_policy_version` text NOT NULL,
	`calibration_status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `human_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_evaluation_id` text NOT NULL,
	`original_decision` text NOT NULL,
	`human_decision` text NOT NULL,
	`reason_code` text NOT NULL,
	`evidence_note` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`asset_evaluation_id`) REFERENCES `asset_evaluations`(`id`) ON UPDATE no action ON DELETE no action
);
