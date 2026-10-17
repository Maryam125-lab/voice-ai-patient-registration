import { randomUUID } from "node:crypto";
import { DataType, newDb } from "pg-mem";
import { setDatabaseForTests, type DatabaseClient } from "../src/db/pool.js";

const testSchema = `
  CREATE TABLE patients (
    patient_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    date_of_birth DATE NOT NULL,
    sex VARCHAR(20) NOT NULL,
    phone_number CHAR(10) NOT NULL,
    email VARCHAR(254),
    address_line_1 VARCHAR(100) NOT NULL,
    address_line_2 VARCHAR(100),
    city VARCHAR(100) NOT NULL,
    state CHAR(2) NOT NULL,
    zip_code VARCHAR(10) NOT NULL,
    insurance_provider VARCHAR(100),
    insurance_member_id VARCHAR(40),
    preferred_language VARCHAR(50) NOT NULL DEFAULT 'English',
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone CHAR(10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  );
  CREATE TABLE call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vapi_call_id TEXT UNIQUE NOT NULL,
    patient_id UUID REFERENCES patients(patient_id),
    status TEXT NOT NULL,
    ended_reason TEXT,
    transcript TEXT,
    summary TEXT,
    final_payload JSONB,
    caller_number TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

export async function resetTestDatabase(): Promise<void> {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  memory.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: randomUUID,
    impure: true,
  });
  memory.public.none(testSchema);
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool();
  setDatabaseForTests(pool as unknown as DatabaseClient);
}
