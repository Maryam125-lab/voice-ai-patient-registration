import { randomUUID } from "node:crypto";
import { DataType, newDb } from "pg-mem";
import type { DatabaseClient } from "./db/pool.js";

// This launcher is only for a zero-install local preview. Production continues
// to use the PostgreSQL connection configured through DATABASE_URL.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "pg-mem://local-preview";
process.env.VAPI_WEBHOOK_SECRET ??= "local-preview-secret";

const schema = `
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

const memory = newDb({ autoCreateForeignKeyIndices: true });
memory.public.registerFunction({
  name: "gen_random_uuid",
  returns: DataType.uuid,
  implementation: randomUUID,
  impure: true,
});
memory.public.none(schema);

const adapter = memory.adapters.createPg();
const pool = new adapter.Pool();

const { setDatabaseForTests } = await import("./db/pool.js");
setDatabaseForTests(pool as unknown as DatabaseClient);

await pool.query(`
  INSERT INTO patients (
    patient_id, first_name, last_name, date_of_birth, sex, phone_number,
    email, address_line_1, city, state, zip_code
  ) VALUES
    ('11111111-1111-4111-8111-111111111111', 'Jane', 'Doe', '1990-04-12', 'Female',
     '2025550101', 'jane.doe@example.test', '12 Main Street', 'Austin', 'TX', '78701'),
    ('22222222-2222-4222-8222-222222222222', 'Miguel', 'Santos', '1985-09-23', 'Male',
     '2025550102', 'miguel.santos@example.test', '44 Oak Avenue', 'Denver', 'CO', '80202')
`);

const [{ createApp }, { config }, { logger }] = await Promise.all([
  import("./app.js"),
  import("./config.js"),
  import("./logger.js"),
]);

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info("local_preview_started", {
    port: config.port,
    dashboard: `http://localhost:${config.port}/dashboard`,
  });
});

function shutdown(signal: string): void {
  logger.info("local_preview_stopping", { signal });
  server.close(() => {
    void pool.end();
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
