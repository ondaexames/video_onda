ALTER TABLE `appointments` ADD `booking_source` text DEFAULT 'site' NOT NULL;
--> statement-breakpoint
ALTER TABLE `appointments` ADD `service_type` text DEFAULT 'Consulta por vídeo' NOT NULL;
