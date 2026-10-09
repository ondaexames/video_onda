ALTER TABLE `consultation_records` ADD `appointment_id` text;
--> statement-breakpoint
ALTER TABLE `consultation_records` ADD `client_id` text;
--> statement-breakpoint
ALTER TABLE `consultation_records` ADD `pet_id` text;
--> statement-breakpoint
ALTER TABLE `appointments` ADD `call_notification_status` text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE `appointments` ADD `call_notification_sent_at` integer;
--> statement-breakpoint
CREATE INDEX `idx_consultation_records_client_updated` ON `consultation_records` (`client_id`, `updated_at` DESC);
--> statement-breakpoint
CREATE INDEX `idx_consultation_records_pet_updated` ON `consultation_records` (`pet_id`, `updated_at` DESC);
--> statement-breakpoint
CREATE INDEX `idx_consultation_records_appointment` ON `consultation_records` (`appointment_id`);
--> statement-breakpoint
PRAGMA optimize;
