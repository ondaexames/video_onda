PRAGMA foreign_keys = ON;

CREATE TABLE `rooms` (
  `id` text PRIMARY KEY NOT NULL,
  `host_token_hash` text NOT NULL,
  `guest_token_hash` text NOT NULL,
  `patient_name` text NOT NULL,
  `tutor_name` text NOT NULL,
  `professional_name` text NOT NULL,
  `status` text DEFAULT 'waiting' NOT NULL,
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL
);

CREATE TABLE `signals` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `room_id` text NOT NULL,
  `sender_id` text NOT NULL,
  `role` text NOT NULL,
  `kind` text NOT NULL,
  `payload` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `idx_signals_room_id_id` ON `signals` (`room_id`, `id`);
CREATE INDEX `idx_rooms_expires_at` ON `rooms` (`expires_at`);
PRAGMA optimize;
