# Voice AI Patient Registration System

A deployable take-home assessment that lets a reviewer call a real U.S. number, register a fake patient through a natural voice conversation, retrieve the record through a REST API, and review it in a live dashboard.

## Live demo

Fill these values after deployment:

| Resource | URL or value |
|---|---|
| U.S. phone number | `+1 XXX XXX XXXX` |
| API base URL | `https://YOUR-APP.vercel.app` |
| Dashboard | `https://YOUR-APP.vercel.app/dashboard` |
| Health check | `https://YOUR-APP.vercel.app/health` |

Use fake data only. This assessment system is not HIPAA compliant and must not receive real patient information.

## What is included

- Natural Vapi voice-agent prompt and four Function tool definitions
- Node.js 20, TypeScript, Express backend
- PostgreSQL schema, migrations, constraints, indexes, trigger, and fake seed data
- Shared Zod normalization and validation for REST and voice tools
- Full patient CRUD API with filters and soft deletion
- Authenticated Vapi webhook with duplicate detection and call-report persistence
- Responsive, no-build dashboard with filters, 10-second refresh, details, transcripts, and summaries
- Structured JSON logging and forced database-failure simulation
- Vitest, Supertest, and pg-mem test suite
- Vercel serverless deployment configuration and Docker support

## Architecture

```text
Caller -> Vapi U.S. number -> STT / LLM / TTS
                               |
                               | tool-calls + end-of-call-report
                               v
                     POST /vapi/webhook
                               |
REST clients -> /patients -> shared services + Zod schemas -> PostgreSQL
Dashboard    -> /dashboard               |
                                           -> patients + call_logs
```

Routes remain thin. REST and Vapi call the same service functions and schemas. Only services access the database, and every SQL query is parameterized.

## Technology choices

| Layer | Choice | Reason |
|---|---|---|
| Voice/telephony | Vapi | Provides phone, STT, TTS, interruptions, and tool calling so the implementation focuses on integration quality. |
| LLM | OpenAI `gpt-5.4-mini` through Vapi | Current Vapi-supported, efficient model with tool calling. The older GPT-4o suggestion in the starter pack is deprecated by OpenAI. |
| Backend | Express + strict TypeScript | Small, readable, and familiar to reviewers. |
| Validation | Zod | One source of truth for API and voice-tool data. |
| Database | PostgreSQL + `pg` | Durable storage with visible constraints and no ORM magic. |
| Dashboard | Static HTML/CSS/JavaScript | No frontend build step or second deployment. |
| Tests | Vitest + Supertest + pg-mem | Fast, isolated endpoint and webhook coverage without requiring Docker. |

## Local setup

Requirements: Node.js 20+, npm, and PostgreSQL.

```bash
npm install
copy .env.example .env
# Edit .env with a local PostgreSQL DATABASE_URL and a random VAPI_WEBHOOK_SECRET.
npm run migrate
npm run seed
npm run dev
```

macOS/Linux users can replace `copy` with `cp`.

If PostgreSQL is not installed and you only need a local browser preview, run:

```bash
npm run dev:memory
```

This temporary database is preloaded with two fake patients and resets whenever
the process stops. Vercel and other production deployments still require PostgreSQL.

Open:

- API: <http://localhost:3000/patients>
- Dashboard: <http://localhost:3000/dashboard>
- Health: <http://localhost:3000/health>

## Environment variables

| Variable | Required | Default | Purpose |
|---|---:|---|---|
| `DATABASE_URL` | Yes | None | PostgreSQL connection string |
| `VAPI_WEBHOOK_SECRET` | Yes | None | At least 16 characters; expected in `X-Vapi-Secret` |
| `PORT` | No | `3000` | HTTP listening port |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, or `error` |
| `SIMULATE_DB_FAILURE` | No | `false` | Makes `save_patient` return `temporary_failure` for a resilience demo |

## REST API

All REST responses use `{ "data": ..., "error": null }` or `{ "data": null, "error": {...} }`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Application and database health |
| GET | `/patients` | List/filter active patients |
| GET | `/patients/:id` | Retrieve one patient |
| POST | `/patients` | Create a patient |
| PUT | `/patients/:id` | Partial update; unknown fields rejected |
| DELETE | `/patients/:id` | Soft delete |
| GET | `/patients/:id/calls` | Calls linked to one patient |
| GET | `/calls` | Recent call reports |
| POST | `/vapi/webhook` | Authenticated Vapi tools and server reports |

`GET /patients` supports `last_name`, `date_of_birth`, `phone_number`, `limit`, and `offset`.

Example:

```bash
curl -X POST http://localhost:3000/patients \
  -H "Content-Type: application/json" \
  -d '{
    "first_name":"Jane",
    "last_name":"Doe",
    "date_of_birth":"04/12/1990",
    "sex":"Female",
    "phone_number":"(202) 555-0101",
    "address_line_1":"12 Main Street",
    "city":"Austin",
    "state":"tx",
    "zip_code":"78701"
  }'
```

## Voice prompt design

`vapi/system-prompt.md` is intentionally narrow and voice-specific:

- One short question at a time
- Accepts several fields in one answer and asks only for missing data
- Treats spelled names as authoritative
- Validates before read-back
- Requires complete read-back and explicit confirmation before saving
- Handles corrections and “start over” without saving partial data
- Checks for an existing patient immediately after collecting a valid phone number
- Retries a failed save once and always gives the caller a spoken outcome
- Prevents disclosure of another patient's demographics

The server independently validates every tool argument; the model is never trusted as the security or validation boundary.

## Vapi configuration

Follow [MANUAL_STEPS.md](MANUAL_STEPS.md). The repository uses the current saved-credential approach: create an `X-Vapi-Secret` custom credential in Vapi and reference its `credentialId` from saved tools and the assistant server configuration.

Relevant official documentation:

- <https://docs.vapi.ai/tools/custom-tools>
- <https://docs.vapi.ai/server-url/server-authentication>
- <https://docs.vapi.ai/providers/model/openai>
- <https://docs.vapi.ai/providers/transcriber/deepgram>
- <https://developers.openai.com/api/docs/models/gpt-5.4-mini>

## Testing

```bash
npm run typecheck
npm test
npm run build
npm audit
```

Tests use an isolated pg-mem PostgreSQL-compatible database. They cover validators, REST success and error paths, soft delete, filters, call endpoints, dashboard assets, webhook authentication, all four tools, duplicate detection, object and JSON-string arguments, completed calls, and abandoned calls.

## Logging and security

- Secrets are environment-only and `.env` is ignored.
- Vapi authentication uses constant-time comparison.
- Helmet headers, a 100 KB JSON limit, and patient endpoint rate limiting are enabled.
- SQL is parameterized and unknown update fields are rejected.
- Tool calls, auth failures, errors, and call-report results are structured JSON logs.
- The final patient payload is logged once on successful registration because the assessment explicitly requires it.
- Dashboard values are created with DOM nodes and assigned through `textContent`; patient data is never inserted with `innerHTML`.

## Edge cases handled

- Impossible, future, and pre-1900 dates
- Short or formatted phone numbers
- Invalid states and ZIP codes
- Caller corrections and restart requests through the prompt
- Duplicate phone lookup and update flow
- Database write failure with one spoken retry
- Mid-call hang-up logged as abandoned without a partial patient
- JSON-string or object tool arguments
- Unknown tools and malformed arguments returned safely
- Soft-deleted records excluded everywhere
- Repeated end-of-call reports upserted by Vapi call ID

## Known limitations and trade-offs

- Phone validation intentionally checks only normalized 10-digit length, not every NANP area/exchange rule.
- Phone number is not unique because family members may share it; the voice agent chooses whether to update or create.
- The public API and dashboard have no user authentication because the assessment asks for easy reviewer access. Never use real patient data.
- The call-to-patient link is held in memory during the live call. A server restart between save and end-of-call report can leave that report unlinked, although the patient remains saved.
- The Vapi dashboard and API evolve. `tools.json` follows the October 2026 saved-credential format; verify the model and UI labels when configuring the account.
- pg-mem tests exercise the application contract but do not replace one smoke test against real PostgreSQL after deployment.
- Vapi, Vercel, and Supabase resources, a real U.S. number, and final phone-call testing require the candidate's accounts.

## Next steps

1. Add authentication and role-based access before any non-demo usage.
2. Persist tool-call correlation instead of using an in-memory call map.
3. Add idempotency keys to patient creation.
4. Add encrypted storage, retention policies, and a formal compliance review.
5. Add Vapi simulations/evals for interruptions, spelling corrections, and noisy calls.
6. Add deployment smoke tests and monitoring alerts.
