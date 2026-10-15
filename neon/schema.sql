BEGIN;

CREATE TABLE IF NOT EXISTS rooms (
  id text PRIMARY KEY,
  host_token_hash text NOT NULL,
  guest_token_hash text NOT NULL,
  patient_name text NOT NULL,
  tutor_name text NOT NULL,
  professional_name text NOT NULL,
  status text NOT NULL DEFAULT 'waiting',
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS signals (
  id bigserial PRIMARY KEY,
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id text NOT NULL,
  role text NOT NULL,
  kind text NOT NULL,
  payload text NOT NULL,
  created_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id text PRIMARY KEY,
  name text NOT NULL,
  cpf text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL,
  address text NOT NULL DEFAULT '',
  asaas_customer_id text NOT NULL DEFAULT '',
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS pets (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  species text NOT NULL,
  sex text NOT NULL DEFAULT '',
  breed text NOT NULL DEFAULT '',
  coat text NOT NULL DEFAULT '',
  age text NOT NULL DEFAULT '',
  weight text NOT NULL DEFAULT '',
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS availability_slots (
  id text PRIMARY KEY,
  starts_at bigint NOT NULL,
  ends_at bigint NOT NULL,
  professional_name text NOT NULL,
  professional_crmv text NOT NULL DEFAULT '',
  unit_name text NOT NULL,
  price_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'open',
  source text NOT NULL DEFAULT 'manual',
  block_reason text NOT NULL DEFAULT '',
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS appointments (
  id text PRIMARY KEY,
  public_token text NOT NULL,
  public_token_hash text NOT NULL,
  client_id text NOT NULL REFERENCES clients(id),
  pet_id text NOT NULL REFERENCES pets(id),
  slot_id text NOT NULL REFERENCES availability_slots(id),
  room_id text REFERENCES rooms(id),
  guest_token text NOT NULL DEFAULT '',
  chief_complaint text NOT NULL DEFAULT '',
  rpvar_valid integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'scheduled',
  payment_status text NOT NULL DEFAULT 'pending',
  asaas_payment_id text NOT NULL DEFAULT '',
  pix_payload text NOT NULL DEFAULT '',
  pix_image text NOT NULL DEFAULT '',
  invoice_url text NOT NULL DEFAULT '',
  booking_source text NOT NULL DEFAULT 'site',
  service_type text NOT NULL DEFAULT 'Consulta por vídeo',
  payment_provider text NOT NULL DEFAULT 'banrisul',
  provider_payment_id text NOT NULL DEFAULT '',
  payment_notification_status text NOT NULL DEFAULT 'pending',
  payment_notification_sent_at bigint,
  call_notification_status text NOT NULL DEFAULT 'pending',
  call_notification_sent_at bigint,
  cancellation_requested_at bigint,
  cancellation_request_reason text NOT NULL DEFAULT '',
  cancelled_at bigint,
  cancelled_by text NOT NULL DEFAULT '',
  cancellation_reason text NOT NULL DEFAULT '',
  slot_reopened integer NOT NULL DEFAULT 0,
  refund_status text NOT NULL DEFAULT 'not_required',
  refunded_at bigint,
  refund_reference text NOT NULL DEFAULT '',
  started_at bigint,
  completed_at bigint,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS consultation_records (
  id text PRIMARY KEY,
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  appointment_id text,
  client_id text,
  pet_id text,
  patient_name text NOT NULL,
  tutor_name text NOT NULL,
  tutor_document text NOT NULL DEFAULT '',
  tutor_address text NOT NULL DEFAULT '',
  professional_name text NOT NULL,
  professional_crmv text NOT NULL DEFAULT '',
  unit_name text NOT NULL,
  service_name text NOT NULL,
  species text NOT NULL,
  sex text NOT NULL DEFAULT '',
  breed text NOT NULL DEFAULT '',
  coat text NOT NULL DEFAULT '',
  age text NOT NULL DEFAULT '',
  weight text NOT NULL DEFAULT '',
  rpvar_valid integer NOT NULL DEFAULT 1,
  chief_complaint text NOT NULL DEFAULT '',
  anamnesis text NOT NULL DEFAULT '',
  clinical_findings text NOT NULL DEFAULT '',
  diagnosis text NOT NULL DEFAULT '',
  treatment_plan text NOT NULL DEFAULT '',
  prescription text NOT NULL DEFAULT '',
  exam_requests text NOT NULL DEFAULT '',
  referral text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  started_at bigint,
  ended_at bigint,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_events (
  event_id text PRIMARY KEY,
  payment_id text NOT NULL,
  event_type text NOT NULL,
  created_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS prescription_documents (
  id text PRIMARY KEY,
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  object_key text NOT NULL,
  filename text NOT NULL,
  status text NOT NULL DEFAULT 'signed',
  public_token_hash text NOT NULL,
  sent_at bigint,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_settings (
  id text PRIMARY KEY,
  professional_name text NOT NULL,
  professional_crmv text NOT NULL DEFAULT '',
  unit_name text NOT NULL,
  price_cents integer NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  horizon_days integer NOT NULL DEFAULT 30,
  weekly_json text NOT NULL,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_audit (
  id text PRIMARY KEY,
  slot_id text NOT NULL DEFAULT '',
  action text NOT NULL,
  reason text NOT NULL DEFAULT '',
  actor text NOT NULL,
  starts_at bigint NOT NULL,
  ends_at bigint NOT NULL,
  created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signals_room_id_id ON signals(room_id, id);
CREATE INDEX IF NOT EXISTS idx_rooms_expires_at ON rooms(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_consultation_records_room_id ON consultation_records(room_id);
CREATE INDEX IF NOT EXISTS idx_consultation_records_updated_at ON consultation_records(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultation_records_status_updated_at ON consultation_records(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultation_records_client_updated ON consultation_records(client_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultation_records_pet_updated ON consultation_records(pet_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultation_records_appointment ON consultation_records(appointment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_pets_client_id ON pets(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_availability_slots_active_start_professional ON availability_slots(starts_at, professional_name) WHERE source != 'cancellation_archive';
CREATE INDEX IF NOT EXISTS idx_availability_slots_status_starts_at ON availability_slots(status, starts_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_slot_id ON appointments(slot_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_asaas_payment_id ON appointments(asaas_payment_id) WHERE asaas_payment_id != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_provider_payment_id ON appointments(provider_payment_id) WHERE provider_payment_id != '';
CREATE INDEX IF NOT EXISTS idx_appointments_status_updated_at ON appointments(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_status_cancelled ON appointments(status, cancelled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_room_id ON appointments(room_id);
CREATE INDEX IF NOT EXISTS idx_prescription_documents_room_id ON prescription_documents(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_audit_created_at ON schedule_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_audit_starts_at ON schedule_audit(starts_at);

CREATE TABLE IF NOT EXISTS staff_users (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL, password_salt text NOT NULL, password_hash text NOT NULL, role text NOT NULL DEFAULT 'reception', crmv text NOT NULL DEFAULT '', unit_name text NOT NULL DEFAULT 'Gravataí', active integer NOT NULL DEFAULT 1, must_change_password integer NOT NULL DEFAULT 1, token_version integer NOT NULL DEFAULT 1, last_login_at bigint, created_at bigint NOT NULL, updated_at bigint NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_users_email ON staff_users(email);
CREATE INDEX IF NOT EXISTS idx_staff_users_role_active ON staff_users(role, active);
COMMIT;

