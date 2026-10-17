import { Router } from "express";
import { patientIdSchema, patientListQuerySchema, zodErrorDetails } from "../domain/patientSchema.js";
import { AppError } from "../errors.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { patientsRateLimit } from "../middleware/rateLimit.js";
import { listPatientCalls } from "../services/callLogService.js";
import {
  createPatient,
  getPatient,
  listPatients,
  softDeletePatient,
  updatePatient,
} from "../services/patientService.js";

export const patientsRouter = Router();
patientsRouter.use("/patients", patientsRateLimit);

function parsePatientId(value: unknown): string {
  if (typeof value !== "string") {
    throw new AppError(400, "INVALID_PATIENT_ID", "Patient ID must be a valid UUID");
  }
  const result = patientIdSchema.safeParse(value);
  if (!result.success) {
    throw new AppError(400, "INVALID_PATIENT_ID", "Patient ID must be a valid UUID");
  }
  return result.data;
}

patientsRouter.get(
  "/patients",
  asyncHandler(async (request, response) => {
    const parsed = patientListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, "INVALID_QUERY", "One or more query parameters are invalid", zodErrorDetails(parsed.error));
    }
    response.status(200).json({ data: await listPatients(parsed.data), error: null });
  }),
);

patientsRouter.post(
  "/patients",
  asyncHandler(async (request, response) => {
    response.status(201).json({ data: await createPatient(request.body), error: null });
  }),
);

patientsRouter.get(
  "/patients/:id/calls",
  asyncHandler(async (request, response) => {
    const patientId = parsePatientId(request.params.id ?? "");
    response.status(200).json({ data: await listPatientCalls(patientId), error: null });
  }),
);

patientsRouter.get(
  "/patients/:id",
  asyncHandler(async (request, response) => {
    const patientId = parsePatientId(request.params.id ?? "");
    response.status(200).json({ data: await getPatient(patientId), error: null });
  }),
);

patientsRouter.put(
  "/patients/:id",
  asyncHandler(async (request, response) => {
    const patientId = parsePatientId(request.params.id ?? "");
    response.status(200).json({ data: await updatePatient(patientId, request.body), error: null });
  }),
);

patientsRouter.delete(
  "/patients/:id",
  asyncHandler(async (request, response) => {
    const patientId = parsePatientId(request.params.id ?? "");
    response.status(200).json({ data: await softDeletePatient(patientId), error: null });
  }),
);
