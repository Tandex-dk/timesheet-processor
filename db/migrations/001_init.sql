CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT UNIQUE NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processing_runs (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT,
  input_filename TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  employee_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success', 'validation_error', 'rate_limited', 'unauthorized', 'error')),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS absence_mapping_overrides (
  id BIGSERIAL PRIMARY KEY,
  remark_key TEXT UNIQUE NOT NULL,
  mapped_category TEXT NOT NULL CHECK (mapped_category IN ('sickness', 'vacation', 'feriefridage', 'publicHoliday', 'otherAbsence')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
