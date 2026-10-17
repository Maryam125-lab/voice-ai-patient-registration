# Software Requirements Specification (SRS)
Voice AI Patient Registration System | Version 1.0 | CareCloud take-home assessment

## 1. Introduction

### 1.1 Purpose
Defines what must be built: a voice agent that registers patients by phone, a database, a REST API, a dashboard, and the glue between them.

### 1.2 Scope
In scope: phone agent (Vapi), webhook backend, PostgreSQL, REST API, dashboard, tests, README. Out of scope: HIPAA compliance, real patient data, authentication/roles, production scaling.

### 1.3 Definitions
- **Agent / Ava**: the Vapi voice assistant.
- **Tool**: a function the LLM can call; implemented as an HTTP webhook on our backend.
- **Service layer**: backend module containing validation and business rules, shared by REST routes and the webhook.
- **Soft delete**: setting deleted_at instead of removing the row.

## 2. Overall description

Actors: **Caller** (speaks to agent), **Reviewer** (calls the number, uses API and dashboard), **Vapi** (calls webhook), **Admin** (Maryam; deploys).

Assumptions: Vapi webhook reachable over public HTTPS; all data is fake; one clinic; English default.

Constraints: no hardcoded secrets; data must survive restarts; API envelope `{ "data": ..., "error": null }`.

## 3. Functional requirements

### 3.1 Telephony and voice agent
| ID | Requirement |
|---|---|
| FR-1 | A real, dialable US phone number routes to the Vapi assistant. |
| FR-2 | The agent greets, introduces itself, and conducts a natural conversation (not an IVR menu). |
| FR-3 | The agent collects required fields: first_name, last_name, date_of_birth, sex, phone_number, address_line_1, city, state, zip_code. |
| FR-4 | After required fields it offers optional fields (email, address_line_2 if not already asked, insurance_provider, insurance_member_id, preferred_language, emergency_contact_name, emergency_contact_phone) and collects only those the caller opts into. |
| FR-5 | The agent asks one question at a time and accepts out-of-order or multi-field answers. |
| FR-6 | The agent handles corrections to any previously given field, including spelled-out letters. |
| FR-7 | On invalid input the agent re-prompts specifically for that field with a helpful reason. |
| FR-8 | Before saving, the agent reads back ALL collected data and asks for confirmation or corrections. |
| FR-9 | The agent saves only after an explicit confirmation. |
| FR-10 | After a successful save the agent says a brief confirmation including first name ("You're all set, Jane.") and ends the call. |
| FR-11 | If the save fails, the agent tells the caller (never silence), retries once, then gives a graceful message and ends the call. |
| FR-12 | The caller can say "start over" at any time; the agent discards collected data and restarts. |
| FR-13 | (Bonus) After the phone number is collected the agent calls check_existing_patient; if a match exists it offers to update the existing record instead of creating a new one. |
| FR-14 | (Bonus, optional) Spanish switch when caller says "Hablo espanol". |
| FR-15 | (Bonus, optional) Mock appointment offer after registration via a book_appointment tool. |

### 3.2 Data validation rules (shared by API and voice tools)
| Field | Type | Rule | Required |
|---|---|---|---|
| first_name | string | 1-50 chars, letters + hyphen + apostrophe (spaces inside allowed, trimmed) | yes |
| last_name | string | same as first_name | yes |
| date_of_birth | date | real calendar date, not in future, not before 1900-01-01. API input and output format: **MM/DD/YYYY**. Stored as DATE. | yes |
| sex | enum | `Male`, `Female`, `Other`, `Decline to Answer` | yes |
| phone_number | string | After stripping non-digits and a leading country code "1", exactly 10 digits. Stored as 10 digits. (Lenient on purpose: reviewers may type 1234567890; we do not enforce NANP area/exchange rules. Document this trade-off.) | yes |
| email | string | valid email format, max 254 | no |
| address_line_1 | string | 1-100 chars | yes |
| address_line_2 | string | max 100 chars | no |
| city | string | 1-100 chars | yes |
| state | string | valid 2-letter US state/DC abbreviation, uppercase | yes |
| zip_code | string | `^\d{5}(-\d{4})?$` | yes |
| insurance_provider | string | max 100 chars | no |
| insurance_member_id | string | alphanumeric (hyphens allowed), max 40 | no |
| preferred_language | string | max 50, default `English` | no |
| emergency_contact_name | string | max 100, letters/space/hyphen/apostrophe | no |
| emergency_contact_phone | string | same rule as phone_number | no |
| patient_id | uuid | auto-generated | auto |
| created_at / updated_at | timestamptz | auto, UTC | auto |
| deleted_at | timestamptz | null unless soft-deleted | auto |

Sanitization: trim all strings, collapse repeated spaces, reject control characters, always use parameterized SQL.

### 3.3 Database
| ID | Requirement |
|---|---|
| FR-20 | PostgreSQL with proper types and constraints; schema in db/schema.sql, applied idempotently at startup or via `npm run migrate`. |
| FR-21 | Data persists across restarts. |
| FR-22 | Seed script inserts 2 fake patients (`npm run seed`). |
| FR-23 | call_logs table stores transcript, summary, ended reason, final payload, linked patient_id. |

Reference schema:

```
CREATE TABLE IF NOT EXISTS patients (
  patient_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(50) NOT NULL CHECK (first_name ~ '^[A-Za-z][A-Za-z '' -]*$'),
  last_name VARCHAR(50) NOT NULL CHECK (last_name ~ '^[A-Za-z][A-Za-z '' -]*$'),
  date_of_birth DATE NOT NULL CHECK (date_of_birth <= CURRENT_DATE
                                     AND date_of_birth >= DATE '1900-01-01'),
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
  emergency_contact_phone CHAR(10) CHECK (emergency_contact_phone ~ '^[0-9]{10}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_last_name ON patients(lower(last_name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_dob ON patients(date_of_birth) WHERE deleted_at IS NULL;

-- trigger: set updated_at = now() on every UPDATE

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
```

Note: phone is deliberately NOT unique (family members can share a number); duplicates are handled conversationally.

### 3.4 REST API
Base: `https://<host>`. All responses JSON with envelope.
Success: `{ "data": <object|array>, "error": null }`
Error: `{ "data": null, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [ { "field": "zip_code", "message": "..." } ] } }`

| Method | Path | Behavior | Success | Errors |
|---|---|---|---|---|
| GET | /patients | List non-deleted patients. Optional filters: `last_name` (case-insensitive exact), `date_of_birth` (MM/DD/YYYY), `phone_number` (any format, normalized). Optional `limit` (default 50, max 200), `offset`. | 200 | 400 bad filter format |
| GET | /patients/:id | One patient. | 200 | 400 invalid UUID, 404 not found/deleted |
| POST | /patients | Create. Body = patient fields. Returns created record with patient_id. | 201 | 400 malformed JSON, 422 validation |
| PUT | /patients/:id | Partial update; only supplied fields change; validated; updated_at refreshed. Unknown fields rejected. | 200 | 400, 404, 422 |
| DELETE | /patients/:id | Soft delete (sets deleted_at). Idempotent-safe: second call returns 404. | 200 (data = {patient_id, deleted_at}) | 400, 404 |
| GET | /health | `{ "data": {"status":"ok"}, "error": null }` and DB ping | 200 | 500 |
| GET | /patients/:id/calls | Call logs linked to the patient (for dashboard). | 200 | 404 |
| GET | /calls | Recent call logs (dashboard). | 200 | |

Status code policy: 200 ok, 201 created, 400 malformed request (bad JSON, bad UUID, bad query format), 404 not found, 422 well-formed but fails validation, 500 unexpected (generic message, details only in logs). Add 404 JSON handler and a global error handler that always uses the envelope.

Example POST body:
```
{ "first_name":"Jane", "last_name":"Doe", "date_of_birth":"04/12/1990", "sex":"Female",
  "phone_number":"(555) 123-4567", "address_line_1":"12 Main St", "city":"Austin",
  "state":"tx", "zip_code":"78701" }
```
Response 201 returns phone_number "5551234567", state "TX", date_of_birth "04/12/1990", patient_id, created_at, updated_at.

### 3.5 Voice-to-backend integration (webhook)
Endpoint: `POST /vapi/webhook`. Header `X-Vapi-Secret` must equal VAPI_WEBHOOK_SECRET, else 401. (Codex: confirm the exact header/auth mechanism against current Vapi docs before finalizing.)

Handles `message.type`:
- `tool-calls`: for each item in the tool call list run the named tool and return `{ "results": [ { "toolCallId": "<id>", "result": "<single-line JSON string>" } ] }`. Tool arguments may arrive as object or JSON string; handle both. Always HTTP 200.
- `end-of-call-report`: upsert call_logs row; status `completed` if a patient was saved/updated during the call, else `abandoned`; store transcript, summary, endedReason, caller number.
- anything else (status-update, speech-update, etc.): return 200 `{}`.

Tools:
| Tool | Args | Behavior | Returns (inside result string) |
|---|---|---|---|
| check_existing_patient | phone_number | Normalize, look up non-deleted patient | `{"exists":false}` or `{"exists":true,"patient_id","first_name","last_name"}` |
| validate_patient | all patient fields collected so far | Run zod validation without saving | `{"valid":true}` or `{"valid":false,"errors":[{"field","message"}]}` |
| save_patient | all patient fields | Validate then INSERT; log final payload | `{"ok":true,"patient_id","first_name"}` or `{"ok":false,"errors":[...]}` or `{"ok":false,"error":"temporary_failure"}` |
| update_patient | patient_id + only changed fields | Validate partial then UPDATE | `{"ok":true}` or `{"ok":false,"errors":[...]}` |
| book_appointment (optional bonus) | patient_id, preferred_date, preferred_time | Mock: store/return a fake slot | `{"ok":true,"slot":"..."}` |

Error messages in `errors[].message` must be written so the LLM can speak them (e.g. "Date of birth cannot be in the future").

### 3.6 Dashboard
| ID | Requirement |
|---|---|
| FR-30 | `GET /dashboard` serves a single-page UI (static files, no build). |
| FR-31 | Table of patients: name, DOB, sex, phone, city/state, insurance, created time. |
| FR-32 | Search/filter by last name, DOB, phone (uses the same API query params). |
| FR-33 | Click a row to see full details and linked call transcript/summary. |
| FR-34 | Auto-refresh every 10 s plus a manual refresh button (so reviewers see their new call appear). |
| FR-35 | Clean, readable design; empty and error states handled. Must escape all rendered data (no innerHTML with raw values). |

## 4. Voice agent specification

### 4.1 Persona
Name: Ava. Warm, calm, efficient intake coordinator at a generic clinic. Never claims to be human if asked directly; says it is a virtual assistant.

### 4.2 Vapi assistant settings (verify field names in current Vapi docs)
- Model: OpenAI gpt-4o, temperature about 0.3, system prompt from `/vapi/system-prompt.md`
- Transcriber: Deepgram (nova-2/3), language en (or multi if doing Spanish)
- Voice: a natural Vapi/ElevenLabs/Cartesia voice
- First message: "Hi, thanks for calling. This is Ava, and I'll help you register as a new patient. It only takes a few minutes. Could I start with your first and last name?"
- Tools: the 4 function tools + built-in end call tool
- Server URL: `https://<host>/vapi/webhook`, secret = VAPI_WEBHOOK_SECRET
- Server messages enabled: `tool-calls`, `end-of-call-report`
- silenceTimeoutSeconds about 30, maxDurationSeconds about 600, background denoising on, endCall message "Thank you for calling. Goodbye."

### 4.3 Prompt engineering requirements
- Document the prompt with comments (the repo copy) and explain the design choices in the README: one question at a time, voice-specific formatting, explicit state checklist, confirm-before-save, tool-use rules, error recovery scripts.
- The prompt keeps an internal checklist of fields: collected / missing.
- Dates: the agent converts spoken dates ("April twelfth nineteen ninety") to MM/DD/YYYY when calling tools and reads them back in spoken form.
- Phone numbers: digits only in tool args; read back in 3-3-4 groups.
- Email: asks caller to spell it; reads back with "at" and "dot".
- States: map names to abbreviations.

## 5. Non-functional requirements
| Area | Requirement |
|---|---|
| Deployment | Live and callable at review time (Railway or similar). README lists phone, API URL, dashboard URL. |
| Persistence | Postgres on managed host, survives redeploy. |
| Performance | Tool webhook p95 under 1.5 s; no blocking work. |
| Security | No secrets in source; .env.example only; webhook secret check; parameterized SQL; helmet; JSON body size limit (100 KB); basic rate limit on API; CORS limited or same-origin. |
| Observability | Structured JSON logs to stdout: each tool call (name, outcome, no full PII in debug), final payload on registration, errors with stack, webhook auth failures. |
| Code quality | TypeScript strict, ESLint/Prettier optional, folder layout per section 6, small functions, comments only where intent is non-obvious. |
| Testing | vitest + supertest: validators (unit), each REST endpoint (happy + failure), webhook tool handling, duplicate detection, soft delete. Use a test database or pg-mem alternative; document how to run. |
| Documentation | README with setup, architecture, stack justification, env vars, prompt design, known limitations, Next Steps. |

## 6. Repository layout

```
/
  package.json  tsconfig.json  .env.example  .gitignore  README.md  AGENTS.md
  src/
    index.ts                 (server bootstrap)
    app.ts                   (express app, middleware, routes)
    config.ts                (env parsing with zod, fail fast)
    logger.ts                (JSON logger)
    db/
      pool.ts  schema.sql  migrate.ts  seed.ts
    domain/
      patientSchema.ts       (zod schemas + normalizers: phone, dob, state)
    services/
      patientService.ts      (create, get, list, update, softDelete, findByPhone)
      callLogService.ts
    routes/
      patients.ts  calls.ts  health.ts  vapi.ts
    middleware/
      errorHandler.ts  vapiAuth.ts  rateLimit.ts
  public/dashboard/
      index.html  app.js  styles.css
  vapi/
      system-prompt.md  tools.json  assistant-notes.md
  tests/
      patientSchema.test.ts  patients.api.test.ts  vapi.webhook.test.ts
```

## 7. Acceptance criteria (definition of done)
1. Calling the number reaches Ava; a full registration completes and the record is visible via GET /patients and on /dashboard within seconds.
2. Calling again with the same phone number triggers the duplicate message and update flow.
3. Invalid DOB (future) and 3-digit phone cause a specific re-prompt for that field only.
4. Correction ("my last name is D-A-V-I-S") is reflected in the final read-back and the DB.
5. "Start over" resets the collection.
6. Stopping the DB or forcing an insert error leads to a spoken apology, not silence (test with a forced-failure env flag such as `SIMULATE_DB_FAILURE=true`, documented in README).
7. Hanging up mid-call creates no patient row and a call_logs row with status abandoned.
8. All REST endpoints return correct codes and the envelope; PUT is partial; DELETE sets deleted_at and the row disappears from GET.
9. Restarting the server loses no data.
10. `npm test` passes. No secrets in git history. README complete.

## 8. Traceability to the evaluation rubric
| Rubric (20% each) | Covered by |
|---|---|
| Working system | FR-1..FR-11, section 7 items 1, 2, 9 |
| Conversational quality | FR-5..FR-8, FR-12, section 4 |
| Technical architecture | Sections 3.3, 3.4, 4.3, 6; shared service layer |
| Code quality and docs | Sections 5, 6; prompt file with comments; README |
| Edge cases and resilience | FR-7, FR-11, FR-12, section 7 items 3-7 |
