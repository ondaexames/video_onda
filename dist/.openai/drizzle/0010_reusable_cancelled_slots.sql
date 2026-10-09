DROP INDEX `idx_availability_slots_starts_at_professional`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_availability_slots_active_start_professional`
ON `availability_slots` (`starts_at`, `professional_name`)
WHERE `source` != 'cancellation_archive';
--> statement-breakpoint
PRAGMA optimize;
