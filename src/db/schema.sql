CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS patients (
  patient_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(50) NOT NULL CHECK (first_name ~ '^[A-Za-z][A-Za-z '' -]*$'),
  last_name VARCHAR(50) NOT NULL CHECK (last_name ~ '^[A-Za-z][A-Za-z '' -]*$'),
  date_of_birth DATE NOT NULL CHECK (
    date_of_birth <= CURRENT_DATE AND date_of_birth >= DATE '1900-01-01'
  ),
  sex VARCHAR(20) NOT NULL CHECK (sex IN ('Male','Female','Other','Decline to Answer')),
  phone_number CHAR(10) NOT NULL CHECK (phone_number ~ '^[0-9]{10}$'),
  email VARCHAR(254),
  address_line_1 VARCHAR(100) NOT NULL,
  address_line_2 VARCHAR(100),
  city VARCHAR(100) NOT NULL,
  state CHAR(2) NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  zip_code VARCHAR(10) NOT NULL CHECK (zip_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  insurance_provider VARCHAR(100),
  insurance_member_id VARCHAR(40),
  preferred_language VARCHAR(50) NOT NULL DEFAULT 'English',
  emergency_contact_name VARCHAR(100),
  emergency_contact_phone CHAR(10) CHECK (
    emergency_contact_phone IS NULL OR emergency_contact_phone ~ '^[0-9]{10}$'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_patients_phone
  ON patients(phone_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_last_name
  ON patients(lower(last_name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_dob
  ON patients(date_of_birth) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS patients_set_updated_at ON patients;
CREATE TRIGGER patients_set_updated_at
BEFORE UPDATE ON patients
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_call_id TEXT UNIQUE NOT NULL,
  patient_id UUID REFERENCES patients(patient_id),
  status TEXT NOT NULL CHECK (status IN ('completed','abandoned','failed')),
  ended_reason TEXT,
  transcript TEXT,
  summary TEXT,
  final_payload JSONB,
  caller_number TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_patient
  ON call_logs(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_created
  ON call_logs(created_at DESC);

-- The application connects directly through PostgreSQL. Keep these tables
-- inaccessible through Supabase's public Data API.
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE patients, call_logs FROM anon, authenticated;
