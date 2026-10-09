ALTER TABLE `appointments` ADD `payment_provider` text DEFAULT 'banrisul' NOT NULL;
--> statement-breakpoint
ALTER TABLE `appointments` ADD `provider_payment_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `appointments` ADD `payment_notification_status` text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE `appointments` ADD `payment_notification_sent_at` integer;
--> statement-breakpoint
UPDATE `appointments` SET `provider_payment_id` = `asaas_payment_id` WHERE `asaas_payment_id` != '';
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_appointments_provider_payment_id` ON `appointments` (`provider_payment_id`) WHERE `provider_payment_id` != '';
--> statement-breakpoint
PRAGMA optimize;
