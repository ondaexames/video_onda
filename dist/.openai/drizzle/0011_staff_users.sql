CREATE TABLE IF NOT EXISTS staff_users (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'reception',
  crmv text NOT NULL DEFAULT '',
  unit_name text NOT NULL DEFAULT 'Gravataí',
  active integer NOT NULL DEFAULT 1,
  must_change_password integer NOT NULL DEFAULT 1,
  token_version integer NOT NULL DEFAULT 1,
  last_login_at bigint,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_users_email ON staff_users(email);
CREATE INDEX IF NOT EXISTS idx_staff_users_role_active ON staff_users(role, active);
