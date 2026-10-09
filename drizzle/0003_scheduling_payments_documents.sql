CREATE TABLE `clients` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `cpf` text DEFAULT '' NOT NULL,
  `email` text DEFAULT '' NOT NULL,
  `phone` text NOT NULL,
  `address` text DEFAULT '' NOT NULL,
  `asaas_customer_id` text DEFAULT '' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pets` (
  `id` text PRIMARY KEY NOT NULL,
  `client_id` text NOT NULL,
  `name` text NOT NULL,
  `species` text NOT NULL,
  `sex` text DEFAULT '' NOT NULL,
  `breed` text DEFAULT '' NOT NULL,
  `coat` text DEFAULT '' NOT NULL,
  `age` text DEFAULT '' NOT NULL,
  `weight` text DEFAULT '' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `availability_slots` (
  `id` text PRIMARY KEY NOT NULL,
  `starts_at` integer NOT NULL,
  `ends_at` integer NOT NULL,
  `professional_name` text NOT NULL,
  `professional_crmv` text DEFAULT '' NOT NULL,
  `unit_name` text NOT NULL,
  `price_cents` integer NOT NULL,
  `status` text DEFAULT 'open' NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `appointments` (
  `id` text PRIMARY KEY NOT NULL,
  `public_token` text NOT NULL,
  `public_token_hash` text NOT NULL,
  `client_id` text NOT NULL,
  `pet_id` text NOT NULL,
  `slot_id` text NOT NULL,
  `room_id` text,
  `guest_token` text DEFAULT '' NOT NULL,
  `chief_complaint` text DEFAULT '' NOT NULL,
  `rpvar_valid` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'scheduled' NOT NULL,
  `payment_status` text DEFAULT 'pending' NOT NULL,
  `asaas_payment_id` text DEFAULT '' NOT NULL,
  `pix_payload` text DEFAULT '' NOT NULL,
  `pix_image` text DEFAULT '' NOT NULL,
  `invoice_url` text DEFAULT '' NOT NULL,
  `started_at` integer,
  `completed_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`slot_id`) REFERENCES `availability_slots`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payment_events` (
  `event_id` text PRIMARY KEY NOT NULL,
  `payment_id` text NOT NULL,
  `event_type` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prescription_documents` (
  `id` text PRIMARY KEY NOT NULL,
  `room_id` text NOT NULL,
  `object_key` text NOT NULL,
  `filename` text NOT NULL,
  `status` text DEFAULT 'signed' NOT NULL,
  `public_token_hash` text NOT NULL,
  `sent_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_clients_phone` ON `clients` (`phone`);
--> statement-breakpoint
CREATE INDEX `idx_pets_client_id` ON `pets` (`client_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_availability_slots_starts_at_professional` ON `availability_slots` (`starts_at`, `professional_name`);
--> statement-breakpoint
CREATE INDEX `idx_availability_slots_status_starts_at` ON `availability_slots` (`status`, `starts_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_appointments_slot_id` ON `appointments` (`slot_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_appointments_asaas_payment_id` ON `appointments` (`asaas_payment_id`) WHERE `asaas_payment_id` != '';
--> statement-breakpoint
CREATE INDEX `idx_appointments_status_updated_at` ON `appointments` (`status`, `updated_at` DESC);
--> statement-breakpoint
CREATE INDEX `idx_appointments_room_id` ON `appointments` (`room_id`);
--> statement-breakpoint
CREATE INDEX `idx_prescription_documents_room_id` ON `prescription_documents` (`room_id`, `created_at` DESC);
--> statement-breakpoint
PRAGMA optimize;
