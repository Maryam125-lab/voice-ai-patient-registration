import { config } from "../config.js";
import { AppError } from "../errors.js";
import { logger } from "../logger.js";
import { upsertCallLog } from "./callLogService.js";
import {
  createPatient,
  findPatientByPhone,
  updatePatient,
  validatePatient,
  type PatientRecord,
} from "./patientService.js";

type UnknownObject = Record<string, unknown>;

interface ToolCall {
  id?: unknown;
  toolCallId?: unknown;
  function?: {
    name?: unknown;
    arguments?: unknown;
  };
  name?: unknown;
  arguments?: unknown;
}

interface CallLink {
  patientId: string;
  finalPayload: PatientRecord;
}

const callLinks = new Map<string, CallLink>();

function objectOrEmpty(value: unknown): UnknownObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownObject)
    : {};
}

function readPath(value: unknown, ...path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) current = objectOrEmpty(current)[key];
  return current;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function callIdFrom(body: UnknownObject): string | undefined {
  const message = objectOrEmpty(body.message);
  return firstString(
    readPath(message, "call", "id"),
    message.callId,
    readPath(body, "call", "id"),
    body.callId,
  );
}

function parseArguments(value: unknown): UnknownObject {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as UnknownObject;
  }
  if (typeof value === "string") {
    const parsed: unknown = JSON.parse(value);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as UnknownObject;
    }
  }
  throw new AppError(422, "INVALID_TOOL_ARGUMENTS", "Tool arguments must be a JSON object");
}

function jsonLine(value: unknown): string {
  return JSON.stringify(value).replace(/[\r\n]+/g, " ");
}

async function executeTool(name: string, args: UnknownObject, callId?: string): Promise<unknown> {
  switch (name) {
    case "check_existing_patient": {
      const phone = typeof args.phone_number === "string" ? args.phone_number : "";
      const patient = await findPatientByPhone(phone);
      return patient
        ? {
            exists: true,
            patient_id: patient.patient_id,
            first_name: patient.first_name,
            last_name: patient.last_name,
          }
        : { exists: false };
    }
    case "validate_patient": {
      const result = validatePatient(args);
      return result.valid ? { valid: true } : { valid: false, errors: result.errors };
    }
    case "save_patient": {
      if (config.simulateDbFailure) return { ok: false, error: "temporary_failure" };
      const patient = await createPatient(args);
      if (callId) callLinks.set(callId, { patientId: patient.patient_id, finalPayload: patient });
      return { ok: true, patient_id: patient.patient_id, first_name: patient.first_name };
    }
    case "update_patient": {
      const patientId = typeof args.patient_id === "string" ? args.patient_id : "";
      const updates = { ...args };
      delete updates.patient_id;
      const patient = await updatePatient(patientId, updates);
      if (callId) callLinks.set(callId, { patientId: patient.patient_id, finalPayload: patient });
      return { ok: true, patient_id: patient.patient_id, first_name: patient.first_name };
    }
    default:
      return { ok: false, error: "unknown_tool", message: `The tool ${name} is not supported` };
  }
}

export async function handleToolCalls(body: UnknownObject) {
  const message = objectOrEmpty(body.message);
  const listCandidate = message.toolCallList ?? message.toolCalls ?? body.toolCallList ?? body.toolCalls;
  const toolCalls = Array.isArray(listCandidate) ? (listCandidate as ToolCall[]) : [];
  const callId = callIdFrom(body);

  return Promise.all(
    toolCalls.map(async (toolCall) => {
      const toolCallId = firstString(toolCall.id, toolCall.toolCallId) ?? "missing-tool-call-id";
      const name = firstString(toolCall.function?.name, toolCall.name) ?? "unknown";
      const rawArguments = toolCall.function?.arguments ?? toolCall.arguments;
      try {
        const args = parseArguments(rawArguments);
        const result = await executeTool(name, args, callId);
        logger.info("vapi_tool_completed", { name, toolCallId, callId, ok: true });
        return { toolCallId, result: jsonLine(result) };
      } catch (error) {
        logger.error("vapi_tool_failed", { name, toolCallId, callId, error });
        if (error instanceof AppError) {
          return {
            toolCallId,
            result: jsonLine({ ok: false, errors: error.details ?? [{ field: "request", message: error.message }] }),
          };
        }
        return { toolCallId, result: jsonLine({ ok: false, error: "temporary_failure" }) };
      }
    }),
  );
}

function transcriptFrom(message: UnknownObject): string | undefined {
  const direct = firstString(message.transcript, readPath(message, "artifact", "transcript"));
  if (direct) return direct;
  const messages = readPath(message, "artifact", "messages");
  if (!Array.isArray(messages)) return undefined;
  return messages
    .map((item) => {
      const entry = objectOrEmpty(item);
      const role = firstString(entry.role) ?? "unknown";
      const content = firstString(entry.message, entry.content, entry.transcript);
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export async function handleEndOfCallReport(body: UnknownObject): Promise<void> {
  const message = objectOrEmpty(body.message);
  const callId = callIdFrom(body);
  if (!callId) {
    logger.error("vapi_end_report_missing_call_id");
    return;
  }
  const link = callLinks.get(callId);
  const call = objectOrEmpty(message.call);
  const customer = objectOrEmpty(call.customer ?? message.customer);
  await upsertCallLog({
    vapi_call_id: callId,
    ...(link ? { patient_id: link.patientId, final_payload: link.finalPayload } : {}),
    status: link ? "completed" : "abandoned",
    ...(firstString(message.endedReason, call.endedReason) ? { ended_reason: firstString(message.endedReason, call.endedReason)! } : {}),
    ...(transcriptFrom(message) ? { transcript: transcriptFrom(message)! } : {}),
    ...(firstString(message.summary, readPath(message, "analysis", "summary"), readPath(message, "artifact", "summary"))
      ? { summary: firstString(message.summary, readPath(message, "analysis", "summary"), readPath(message, "artifact", "summary"))! }
      : {}),
    ...(firstString(customer.number, call.customerNumber, message.customerNumber) ? { caller_number: firstString(customer.number, call.customerNumber, message.customerNumber)! } : {}),
    ...(firstString(call.startedAt, message.startedAt) ? { started_at: firstString(call.startedAt, message.startedAt)! } : {}),
    ...(firstString(call.endedAt, message.endedAt) ? { ended_at: firstString(call.endedAt, message.endedAt)! } : {}),
  });
  callLinks.delete(callId);
  logger.info("vapi_end_report_stored", { callId, status: link ? "completed" : "abandoned" });
}

export function clearCallLinksForTests(): void {
  if (config.nodeEnv === "test") callLinks.clear();
}
