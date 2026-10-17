# AGENTS.md - Voice AI Patient Registration

Read this first. Source-of-truth docs live in /docs: `01_flow_architecture`, `02_srs`. If code and docs disagree, the SRS wins; ask before changing requirements.

## Project
Vapi voice agent ("Ava") registers patients by phone. Node.js 20 + TypeScript + Express backend, PostgreSQL, REST API under /patients, static dashboard at /dashboard, Vapi tool webhook at /vapi/webhook.

## Commands
- `npm run dev` - start with reload
- `npm run build && npm start` - production
- `npm run migrate` - apply db/schema.sql (idempotent)
- `npm run seed` - insert 2 fake patients
- `npm test` - vitest + supertest
- `npm run lint` / `npm run typecheck`

## Architecture rules (do not break)
1. Routes are thin. All business logic and validation live in `src/services` and `src/domain`.
2. REST routes and the Vapi webhook call the SAME service functions and the SAME zod schemas.
3. Only `src/services` imports `src/db`. Always use parameterized SQL.
4. Every response from the REST API uses the envelope `{ "data": ..., "error": null }` or `{ "data": null, "error": {code,message,details?} }`.
5. The Vapi webhook ALWAYS returns HTTP 200 with `{ results: [{ toolCallId, result }] }` for tool-calls; `result` is a single-line JSON string. Errors go inside `result`. Never leave the caller in silence.
6. Soft delete only (deleted_at). Never hard-delete patients. Exclude deleted rows everywhere.
7. Phone numbers are stored as 10 digits; DOB is MM/DD/YYYY at the API boundary and DATE in the DB.

## Security
- No secrets in code or git. Config via env, parsed and validated in `src/config.ts` (fail fast). Keep `.env.example` current.
- Verify `X-Vapi-Secret` on /vapi/webhook. Use helmet, body size limit, basic rate limiting.
- Fake data only. Never log full PII at debug level; the final registered payload is logged once at info (required by the brief).

## Style
- TypeScript strict. No `any` without a comment. Small functions. Comments explain why, not what.
- Error messages from validation must be speakable by a voice agent (plain English).
- Tests for every endpoint (happy + failure), validators, duplicate detection, webhook handling.

## Definition of done
All acceptance criteria in SRS section 7 pass, `npm test` is green, README is complete (setup, architecture, stack justification, env vars, prompt design, limitations, Next Steps).

## Do not
- Do not invent Vapi API fields from memory: check current Vapi docs and note anything uncertain in README "Known limitations".
- Do not add features outside the SRS before the core call flow works end to end.
- Do not touch /vapi/system-prompt.md wording without a reason; it is tuned for voice.
