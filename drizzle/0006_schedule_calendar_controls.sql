ALTER TABLE `availability_slots` ADD `block_reason` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `availability_slots` ADD `updated_at` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `schedule_audit` (
  `id` text PRIMARY KEY NOT NULL,
  `slot_id` text DEFAULT '' NOT NULL,
  `action` text NOT NULL,
  `reason` text DEFAULT '' NOT NULL,
  `actor` text NOT NULL,
  `starts_at` integer NOT NULL,
  `ends_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_schedule_audit_created_at` ON `schedule_audit` (`created_at` DESC);
--> statement-breakpoint
CREATE INDEX `idx_schedule_audit_starts_at` ON `schedule_audit` (`starts_at`);
--> statement-breakpoint
PRAGMA optimize;
