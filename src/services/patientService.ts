import type { QueryResultRow } from "pg";
import { query } from "../db/pool.js";
import {
  apiDateToDatabase,
  createPatientSchema,
  databaseDateToApi,
  normalizePhone,
  updatePatientSchema,
  zodErrorDetails,
  type PatientCreateInput,
  type PatientListQuery,
  type PatientUpdateInput,
} from "../domain/patientSchema.js";
import { AppError, ValidationError } from "../errors.js";
import { logger } from "../logger.js";

const SELECT_FIELDS = `
  patient_id, first_name, last_name, date_of_birth, sex, phone_number, email,
  address_line_1, address_line_2, city, state, zip_code, insurance_provider,
  insurance_member_id, preferred_language, emergency_contact_name,
  emergency_contact_phone, created_at, updated_at, deleted_at
`;

interface PatientRow extends QueryResultRow {
  patient_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | Date;
  sex: PatientCreateInput["sex"];
  phone_number: string;
  email: string | null;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  zip_code: string;
  insurance_provider: string | null;
  insurance_member_id: string | null;
  preferred_language: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  deleted_at: string | Date | null;
}

export interface PatientRecord {
  patient_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: PatientCreateInput["sex"];
  phone_number: string;
  email: string | null;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  zip_code: string;
  insurance_provider: string | null;
  insurance_member_id: string | null;
  preferred_language: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  created_at: string;
  updated_at: string;
}

function isoTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapPatient(row: PatientRow): PatientRecord {
  return {
    patient_id: row.patient_id,
    first_name: row.first_name,
    last_name: row.last_name,
    date_of_birth: databaseDateToApi(row.date_of_birth),
    sex: row.sex,
    phone_number: row.phone_number.trim(),
    email: row.email,
    address_line_1: row.address_line_1,
    address_line_2: row.address_line_2,
    city: row.city,
    state: row.state.trim(),
    zip_code: row.zip_code,
    insurance_provider: row.insurance_provider,
    insurance_member_id: row.insurance_member_id,
    preferred_language: row.preferred_language,
    emergency_contact_name: row.emergency_contact_name,
    emergency_contact_phone: row.emergency_contact_phone?.trim() ?? null,
    created_at: isoTimestamp(row.created_at),
    updated_at: isoTimestamp(row.updated_at),
  };
}

function parseCreate(input: unknown): PatientCreateInput {
  const result = createPatientSchema.safeParse(input);
  if (!result.success) throw new ValidationError(zodErrorDetails(result.error));
  return result.data;
}

function parseUpdate(input: unknown): PatientUpdateInput {
  const result = updatePatientSchema.safeParse(input);
  if (!result.success) throw new ValidationError(zodErrorDetails(result.error));
  return result.data;
}

export async function listPatients(filters: PatientListQuery): Promise<PatientRecord[]> {
  const where = ["deleted_at IS NULL"];
  const values: unknown[] = [];

  if (filters.last_name) {
    values.push(filters.last_name);
    where.push(`lower(last_name) = lower($${values.length})`);
  }
  if (filters.date_of_birth) {
    values.push(apiDateToDatabase(filters.date_of_birth));
    where.push(`date_of_birth = $${values.length}`);
  }
  if (filters.phone_number) {
    values.push(filters.phone_number);
    where.push(`phone_number = $${values.length}`);
  }

  values.push(filters.limit, filters.offset);
  const result = await query<PatientRow>(
    `SELECT ${SELECT_FIELDS} FROM patients
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return result.rows.map(mapPatient);
}

export async function getPatient(patientId: string): Promise<PatientRecord> {
  const result = await query<PatientRow>(
    `SELECT ${SELECT_FIELDS} FROM patients WHERE patient_id = $1 AND deleted_at IS NULL`,
    [patientId],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient was not found");
  return mapPatient(row);
}

export async function createPatient(input: unknown): Promise<PatientRecord> {
  const patient = parseCreate(input);
  const values = [
    patient.first_name,
    patient.last_name,
    apiDateToDatabase(patient.date_of_birth),
    patient.sex,
    patient.phone_number,
    patient.email ?? null,
    patient.address_line_1,
    patient.address_line_2 ?? null,
    patient.city,
    patient.state,
    patient.zip_code,
    patient.insurance_provider ?? null,
    patient.insurance_member_id ?? null,
    patient.preferred_language,
    patient.emergency_contact_name ?? null,
    patient.emergency_contact_phone ?? null,
  ];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
  const result = await query<PatientRow>(
    `INSERT INTO patients (
      first_name, last_name, date_of_birth, sex, phone_number, email,
      address_line_1, address_line_2, city, state, zip_code, insurance_provider,
      insurance_member_id, preferred_language, emergency_contact_name,
      emergency_contact_phone
    ) VALUES (${placeholders}) RETURNING ${SELECT_FIELDS}`,
    values,
  );
  const created = mapPatient(result.rows[0]!);
  logger.info("patient_registered", { patient_id: created.patient_id, payload: created });
  return created;
}

export async function updatePatient(patientId: string, input: unknown): Promise<PatientRecord> {
  const updates = parseUpdate(input);
  const entries = Object.entries(updates) as [keyof PatientUpdateInput, unknown][];
  const values: unknown[] = [];
  const assignments = entries.map(([field, rawValue]) => {
    const value = field === "date_of_birth" && typeof rawValue === "string"
      ? apiDateToDatabase(rawValue)
      : rawValue;
    values.push(value ?? null);
    return `${field} = $${values.length}`;
  });
  values.push(patientId);

  const result = await query<PatientRow>(
    `UPDATE patients SET ${assignments.join(", ")}, updated_at = now()
     WHERE patient_id = $${values.length} AND deleted_at IS NULL
     RETURNING ${SELECT_FIELDS}`,
    values,
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient was not found");
  return mapPatient(row);
}

export async function softDeletePatient(
  patientId: string,
): Promise<{ patient_id: string; deleted_at: string }> {
  const result = await query<{ patient_id: string; deleted_at: string | Date }>(
    `UPDATE patients SET deleted_at = now(), updated_at = now()
     WHERE patient_id = $1 AND deleted_at IS NULL
     RETURNING patient_id, deleted_at`,
    [patientId],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient was not found");
  return { patient_id: row.patient_id, deleted_at: isoTimestamp(row.deleted_at) };
}

export async function findPatientByPhone(phoneInput: string): Promise<PatientRecord | null> {
  const phone = normalizePhone(phoneInput);
  if (!/^\d{10}$/.test(phone)) {
    throw new ValidationError([{ field: "phone_number", message: "Phone number must contain exactly 10 digits" }]);
  }
  const result = await query<PatientRow>(
    `SELECT ${SELECT_FIELDS} FROM patients
     WHERE phone_number = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );
  return result.rows[0] ? mapPatient(result.rows[0]) : null;
}

export function validatePatient(input: unknown): { valid: true; patient: PatientCreateInput } | { valid: false; errors: ReturnType<typeof zodErrorDetails> } {
  const result = createPatientSchema.safeParse(input);
  if (!result.success) return { valid: false, errors: zodErrorDetails(result.error) };
  return { valid: true, patient: result.data };
}
