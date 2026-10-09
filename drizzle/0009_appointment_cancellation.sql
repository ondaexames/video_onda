ALTER TABLE `appointments` ADD `cancellation_requested_at` integer;
--> statement-breakpoint
ALTER TABLE `appointments` ADD `cancellation_request_reason` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `appointments` ADD `cancelled_at` integer;
--> statement-breakpoint
ALTER TABLE `appointments` ADD `cancelled_by` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `appointments` ADD `cancellation_reason` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `appointments` ADD `slot_reopened` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `appointments` ADD `refund_status` text DEFAULT 'not_required' NOT NULL;
--> statement-breakpoint
ALTER TABLE `appointments` ADD `refunded_at` integer;
--> statement-breakpoint
ALTER TABLE `appointments` ADD `refund_reference` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_appointments_status_cancelled` ON `appointments` (`status`, `cancelled_at`);
--> statement-breakpoint
PRAGMA optimize;
