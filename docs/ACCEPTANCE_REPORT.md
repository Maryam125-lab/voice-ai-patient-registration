# Acceptance report

Status reflects automated and static verification in the local environment. Items requiring external accounts are explicitly marked manual.

| # | Acceptance criterion | Status | Evidence |
|---:|---|---|---|
| 1 | Full phone registration appears in API/dashboard | Manual account step | Backend save tool, REST API, dashboard, and persistence path are implemented and tested. A real Vapi number and Railway deployment are still required. |
| 2 | Second call detects duplicate and offers update | Code pass / call manual | `check_existing_patient` and `update_patient` pass webhook tests; the prompt contains the required branch. |
| 3 | Invalid DOB and short phone are re-prompted | Code pass / call manual | Shared validator tests reject future/impossible DOB and short phone; the prompt tells Ava to ask only for the failed field. |
| 4 | Spelled correction reaches read-back and DB | Code pass / call manual | Partial update is tested; the prompt gives spelled values priority and requires a complete final read-back. |
| 5 | “Start over” resets collection | Prompt pass / call manual | Explicit START OVER section exists in the Vapi system prompt. |
| 6 | Forced DB failure produces spoken apology | Code pass / call manual | `SIMULATE_DB_FAILURE` returns `temporary_failure`; prompt retries once and then ends gracefully. |
| 7 | Mid-call hang-up creates abandoned call only | Pass | End-of-call report without a saved patient is tested as `abandoned`; no partial patient write exists. |
| 8 | REST status/envelope, partial PUT, soft DELETE | Pass | Integration tests cover 200, 201, 400, 404, 422, partial update, unknown-field rejection, and repeated delete. |
| 9 | Restart preserves data | Code pass / deploy manual | PostgreSQL is the only patient store and migration is idempotent. Persistence across a Railway restart must be smoke-tested after deployment. |
| 10 | Tests pass, no secrets, README complete | Pass | Full test, typecheck, build, audit, `.gitignore`, `.env.example`, README, and manual deployment guide are present. |

## Automated test inventory

- Patient validators and normalizers
- Health, dashboard, and every REST endpoint
- Filters, malformed JSON, invalid UUID, validation errors, and not-found handling
- Partial update and soft delete
- Call lists and patient-linked calls
- Vapi authentication
- All four Vapi tools
- Duplicate lookup
- Object and JSON-string tool arguments
- Unknown/malformed tool calls
- Completed and abandoned end-of-call reports

## Required final human verification

1. Deploy to Railway with managed PostgreSQL.
2. Configure Vapi saved credentials, tools, assistant, and phone number.
3. Complete a new-patient call.
4. Make a second call with the same phone to test the update branch.
5. Test a forced database failure and restore the flag.
6. Restart the Railway service and verify the patient remains.
7. Fill in the README live-demo values before submitting.
