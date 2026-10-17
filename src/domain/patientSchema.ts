import { z } from "zod";
import type { ErrorDetail } from "../errors.js";

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
const NAME_PATTERN = /^[A-Za-z][A-Za-z '\-]*$/;
const CONTACT_NAME_PATTERN = /^[A-Za-z][A-Za-z '\-]*$/;
const MEMBER_ID_PATTERN = /^[A-Za-z0-9-]+$/;
const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;
const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

function cleanString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.trim().replace(/\s+/g, " ");
}

function optionalCleanString(value: unknown): unknown {
  const cleaned = cleanString(value);
  return cleaned === "" || cleaned === null ? undefined : cleaned;
}

function safeString(max: number, label: string) {
  return z.preprocess(
    cleanString,
    z
      .string({ required_error: `${label} is required` })
      .min(1, `${label} is required`)
      .max(max, `${label} must be ${max} characters or fewer`)
      .refine((value) => !CONTROL_CHARACTERS.test(value), `${label} contains invalid characters`),
  );
}

function optionalString(max: number, label: string) {
  return z.preprocess(
    optionalCleanString,
    z
      .string()
      .max(max, `${label} must be ${max} characters or fewer`)
      .refine((value) => !CONTROL_CHARACTERS.test(value), `${label} contains invalid characters`)
      .optional(),
  );
}

export function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits;
}

export function parseApiDate(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function apiDateToDatabase(value: string): string {
  const date = parseApiDate(value);
  if (!date) throw new Error("Cannot convert an invalid date of birth");
  return date.toISOString().slice(0, 10);
}

export function databaseDateToApi(value: string | Date): string {
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  const [year, month, day] = iso.split("-");
  return `${month}/${day}/${year}`;
}

const dateOfBirthSchema = z.preprocess(
  cleanString,
  z
    .string({ required_error: "Date of birth is required" })
    .refine((value) => parseApiDate(value) !== null, "Date of birth must be a real date in MM/DD/YYYY format")
    .refine((value) => {
      const date = parseApiDate(value);
      return date !== null && date.getTime() <= Date.now();
    }, "Date of birth cannot be in the future")
    .refine((value) => {
      const date = parseApiDate(value);
      return date !== null && date >= new Date(Date.UTC(1900, 0, 1));
    }, "Date of birth cannot be before January 1, 1900"),
);

const phoneSchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizePhone(value) : value),
  z.string({ required_error: "Phone number is required" }).regex(/^\d{10}$/, "Phone number must contain exactly 10 digits"),
);

const optionalPhoneSchema = z.preprocess(
  (value) => {
    const cleaned = optionalCleanString(value);
    return typeof cleaned === "string" ? normalizePhone(cleaned) : cleaned;
  },
  z.string().regex(/^\d{10}$/, "Emergency contact phone must contain exactly 10 digits").optional(),
);

const patientFields = {
  first_name: safeString(50, "First name").refine(
    (value) => NAME_PATTERN.test(value),
    "First name may contain only letters, spaces, hyphens, and apostrophes",
  ),
  last_name: safeString(50, "Last name").refine(
    (value) => NAME_PATTERN.test(value),
    "Last name may contain only letters, spaces, hyphens, and apostrophes",
  ),
  date_of_birth: dateOfBirthSchema,
  sex: z.enum(["Male", "Female", "Other", "Decline to Answer"], {
    errorMap: () => ({ message: "Sex must be Male, Female, Other, or Decline to Answer" }),
  }),
  phone_number: phoneSchema,
  email: z.preprocess(
    optionalCleanString,
    z.string().email("Email address is not valid").max(254, "Email must be 254 characters or fewer").optional(),
  ),
  address_line_1: safeString(100, "Street address"),
  address_line_2: optionalString(100, "Address line 2"),
  city: safeString(100, "City"),
  state: z.preprocess(
    (value) => (typeof cleanString(value) === "string" ? String(cleanString(value)).toUpperCase() : value),
    z.string({ required_error: "State is required" }).refine(
      (value) => US_STATES.has(value),
      "State must be a valid two-letter U.S. state abbreviation",
    ),
  ),
  zip_code: z.preprocess(
    cleanString,
    z.string({ required_error: "ZIP code is required" }).regex(ZIP_PATTERN, "ZIP code must be five digits or ZIP plus four"),
  ),
  insurance_provider: optionalString(100, "Insurance provider"),
  insurance_member_id: z.preprocess(
    optionalCleanString,
    z
      .string()
      .max(40, "Insurance member ID must be 40 characters or fewer")
      .regex(MEMBER_ID_PATTERN, "Insurance member ID may contain only letters, numbers, and hyphens")
      .optional(),
  ),
  preferred_language: z.preprocess(
    optionalCleanString,
    z.string().max(50, "Preferred language must be 50 characters or fewer").default("English"),
  ),
  emergency_contact_name: z.preprocess(
    optionalCleanString,
    z
      .string()
      .max(100, "Emergency contact name must be 100 characters or fewer")
      .regex(CONTACT_NAME_PATTERN, "Emergency contact name may contain only letters, spaces, hyphens, and apostrophes")
      .optional(),
  ),
  emergency_contact_phone: optionalPhoneSchema,
};

export const createPatientSchema = z.object(patientFields).strict();

export const updatePatientSchema = z
  .object(patientFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one patient field is required");

export const patientIdSchema = z.string().uuid("Patient ID must be a valid UUID");

export const patientListQuerySchema = z
  .object({
    last_name: z.preprocess(optionalCleanString, z.string().max(50).optional()),
    date_of_birth: z.preprocess(optionalCleanString, dateOfBirthSchema.optional()),
    phone_number: z.preprocess(
      (value) => {
        const cleaned = optionalCleanString(value);
        return typeof cleaned === "string" ? normalizePhone(cleaned) : cleaned;
      },
      z.string().regex(/^\d{10}$/, "Phone number filter must contain exactly 10 digits").optional(),
    ),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type PatientCreateInput = z.infer<typeof createPatientSchema>;
export type PatientUpdateInput = z.infer<typeof updatePatientSchema>;
export type PatientListQuery = z.infer<typeof patientListQuerySchema>;

export function zodErrorDetails(error: z.ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "request",
    message: issue.message,
  }));
}
