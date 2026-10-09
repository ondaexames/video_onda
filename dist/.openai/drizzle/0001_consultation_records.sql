CREATE TABLE `consultation_records` (
  `id` text PRIMARY KEY NOT NULL,
  `room_id` text NOT NULL,
  `patient_name` text NOT NULL,
  `tutor_name` text NOT NULL,
  `professional_name` text NOT NULL,
  `unit_name` text NOT NULL,
  `service_name` text NOT NULL,
  `species` text NOT NULL,
  `age` text DEFAULT '' NOT NULL,
  `weight` text DEFAULT '' NOT NULL,
  `rpvar_valid` integer DEFAULT 1 NOT NULL,
  `chief_complaint` text DEFAULT '' NOT NULL,
  `anamnesis` text DEFAULT '' NOT NULL,
  `clinical_findings` text DEFAULT '' NOT NULL,
  `diagnosis` text DEFAULT '' NOT NULL,
  `treatment_plan` text DEFAULT '' NOT NULL,
  `prescription` text DEFAULT '' NOT NULL,
  `exam_requests` text DEFAULT '' NOT NULL,
  `referral` text DEFAULT '' NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `started_at` integer,
  `ended_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `idx_consultation_records_room_id` ON `consultation_records` (`room_id`);
CREATE INDEX `idx_consultation_records_updated_at` ON `consultation_records` (`updated_at` DESC);
CREATE INDEX `idx_consultation_records_status_updated_at` ON `consultation_records` (`status`, `updated_at` DESC);
PRAGMA optimize;
