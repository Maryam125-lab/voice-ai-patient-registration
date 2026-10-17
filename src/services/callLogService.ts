import type { QueryResultRow } from "pg";
import { query } from "../db/pool.js";
import { AppError } from "../errors.js";

interface CallLogRow extends QueryResultRow {
  id: string;
  vapi_call_id: string;
  patient_id: string | null;
  status: "completed" | "abandoned" | "failed";
  ended_reason: string | null;
  transcript: string | null;
  summary: string | null;
  final_payload: unknown;
  caller_number: string | null;
  started_at: string | Date | null;
  ended_at: string | Date | null;
  created_at: string | Date;
}

export interface CallLogInput {
  vapi_call_id: string;
  patient_id?: string;
  status: "completed" | "abandoned" | "failed";
  ended_reason?: string;
  transcript?: string;
  summary?: string;
  final_payload?: unknown;
  caller_number?: string;
  started_at?: string;
  ended_at?: string;
}

function timestamp(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapCall(row: CallLogRow) {
  return {
    id: row.id,
    vapi_call_id: row.vapi_call_id,
    patient_id: row.patient_id,
    status: row.status,
    ended_reason: row.ended_reason,
    transcript: row.transcript,
    summary: row.summary,
    final_payload: row.final_payload,
    caller_number: row.caller_number,
    started_at: timestamp(row.started_at),
    ended_at: timestamp(row.ended_at),
    created_at: timestamp(row.created_at),
  };
}

const CALL_FIELDS = `id, vapi_call_id, patient_id, status, ended_reason, transcript,
  summary, final_payload, caller_number, started_at, ended_at, created_at`;

export async function upsertCallLog(input: CallLogInput) {
  const result = await query<CallLogRow>(
    `INSERT INTO call_logs (
      vapi_call_id, patient_id, status, ended_reason, transcript, summary,
      final_payload, caller_number, started_at, ended_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (vapi_call_id) DO UPDATE SET
      patient_id = COALESCE(EXCLUDED.patient_id, call_logs.patient_id),
      status = EXCLUDED.status,
      ended_reason = EXCLUDED.ended_reason,
      transcript = EXCLUDED.transcript,
      summary = EXCLUDED.summary,
      final_payload = COALESCE(EXCLUDED.final_payload, call_logs.final_payload),
      caller_number = EXCLUDED.caller_number,
      started_at = EXCLUDED.started_at,
      ended_at = EXCLUDED.ended_at
    RETURNING ${CALL_FIELDS}`,
    [
      input.vapi_call_id,
      input.patient_id ?? null,
      input.status,
      input.ended_reason ?? null,
      input.transcript ?? null,
      input.summary ?? null,
      input.final_payload === undefined ? null : JSON.stringify(input.final_payload),
      input.caller_number ?? null,
      input.started_at ?? null,
      input.ended_at ?? null,
    ],
  );
  return mapCall(result.rows[0]!);
}

export async function listCalls(limit = 100) {
  const result = await query<CallLogRow>(
    `SELECT ${CALL_FIELDS} FROM call_logs ORDER BY created_at DESC LIMIT $1`,
    [Math.min(Math.max(limit, 1), 200)],
  );
  return result.rows.map(mapCall);
}

export async function listPatientCalls(patientId: string) {
  const patient = await query("SELECT patient_id FROM patients WHERE patient_id = $1 AND deleted_at IS NULL", [patientId]);
  if (!patient.rows[0]) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient was not found");
  const result = await query<CallLogRow>(
    `SELECT ${CALL_FIELDS} FROM call_logs WHERE patient_id = $1 ORDER BY created_at DESC`,
    [patientId],
  );
  return result.rows.map(mapCall);
}
