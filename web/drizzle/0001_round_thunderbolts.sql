CREATE TABLE `commercial_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`version` text NOT NULL,
	`template_id` text NOT NULL,
	`status` text NOT NULL,
	`preferences_json` text NOT NULL,
	`accepted_event_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `commercial_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `commercial_recalibration_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`commercial_template_id` text NOT NULL,
	`commercial_profile_id` text,
	`asset_evaluation_id` text NOT NULL,
	`system_fit_score` real,
	`human_fit_score` real,
	`original_decision` text NOT NULL,
	`human_decision` text NOT NULL,
	`reason_code` text NOT NULL,
	`evidence_note` text NOT NULL,
	`status` text DEFAULT 'CAPTURED' NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`applied_at` text,
	FOREIGN KEY (`commercial_template_id`) REFERENCES `commercial_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`commercial_profile_id`) REFERENCES `commercial_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_evaluation_id`) REFERENCES `asset_evaluations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `commercial_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`version` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`config_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
