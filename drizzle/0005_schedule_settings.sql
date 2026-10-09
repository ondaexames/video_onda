ALTER TABLE `availability_slots` ADD `source` text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
CREATE TABLE `schedule_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`professional_name` text NOT NULL,
	`professional_crmv` text DEFAULT '' NOT NULL,
	`unit_name` text NOT NULL,
	`price_cents` integer NOT NULL,
	`duration_minutes` integer DEFAULT 30 NOT NULL,
	`horizon_days` integer DEFAULT 30 NOT NULL,
	`weekly_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
