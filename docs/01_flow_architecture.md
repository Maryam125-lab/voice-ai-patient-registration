# Voice AI Patient Registration - Flow & Architecture
Project: CareCloud AI Engineer take-home | Version 1.0 | Audience: Maryam + Codex/ChatGPT

## 1. One-paragraph summary

A caller dials a real US phone number. A Vapi voice assistant (STT + LLM + TTS) answers as "Ava", an intake coordinator, and collects patient demographics one question at a time. The LLM never touches the database directly. It calls **tools** (HTTP webhooks) on our Node.js backend. The backend validates everything server-side, writes to PostgreSQL, and returns a short string the LLM speaks back. The same backend exposes a REST API (/patients) and a small dashboard (/dashboard). After the call, Vapi sends an end-of-call report (transcript + summary) which we store in a call_logs table linked to the patient.

## 2. Stack decisions (and why)

| Layer | Choice | Why |
|---|---|---|
| Telephony + STT + TTS | **Vapi** (free US number from Vapi dashboard) | Fastest path; the brief explicitly encourages it. We spend time on prompt + backend, not audio plumbing. |
| LLM | OpenAI gpt-5.4-mini inside Vapi | Current, efficient model with tool calling. Swappable in the Vapi dashboard. |
| Backend | Node.js 20 + TypeScript + Express | Maryam already works in TS/MERN. Easy to read for reviewers. |
| Validation | zod (one shared schema for API + voice tools) | Single source of truth, so the voice agent and REST API can never disagree. |
| Database | PostgreSQL (Railway plugin or Neon) | Survives restarts, real constraints, UUID + timestamptz + CHECKs. |
| DB access | `pg` + plain SQL (no heavy ORM) | Fewer moving parts, schema is visible and reviewable. |
| Dashboard | Static HTML + vanilla JS served by Express | No build step, nothing to break. Required by the email. |
| Tests | vitest + supertest | Bonus points: API tests. |
| Hosting | Railway (app + Postgres) | One-click deploy from GitHub, public HTTPS URL for Vapi webhooks. |

## 3. System diagram

```
  Caller (phone)
      |
      v
  +--------------------------+        tool-calls / end-of-call-report
  |  VAPI (cloud)            |  ----------------------------------------+
  |  STT -> LLM -> TTS       |        HTTPS POST /vapi/webhook           |
  |  system prompt + tools   |  <----------------------------------------+
  +--------------------------+        JSON { results: [...] }            |
                                                                         v
  +---------------------------------------------------------------------------+
  |  Node.js / Express backend (Railway)                                      |
  |                                                                           |
  |  routes/vapi.ts  -->  services/patientService.ts  <--  routes/patients.ts |
  |   (webhook)            (validation + business         (REST API)          |
  |                         rules, dup detection)                             |
  |                              |                                            |
  |                              v                                            |
  |                        db/ (pg pool + SQL)          public/dashboard/     |
  +------------------------------|--------------------------------------------+
                                 v
                        PostgreSQL (persistent)
                        tables: patients, call_logs
```

Separation of concerns (this is graded):
- **Telephony / audio**: Vapi only. Zero audio code in our repo.
- **Conversation logic**: Vapi system prompt + tool definitions (versioned in repo under /vapi).
- **Business logic**: services/ layer. Both the REST routes and the Vapi webhook call the SAME service functions.
- **Data layer**: db/ folder. Only the service layer imports it.
- **Transport**: routes/ are thin. Parse, call service, format envelope.

## 4. Conversation flow (what the caller experiences)

```
START
  |
  v
[1 GREET] "Hi, thanks for calling. This is Ava... can I get your first and last name?"
  |
  v
[2 REQUIRED FIELDS - one question at a time, in this order]
   first+last name -> date of birth -> sex -> phone number
        |
        +--> after phone: TOOL check_existing_patient(phone)
                 |-- found --> [DUPLICATE BRANCH] (section 6)
                 |-- not found --> continue
   -> street address -> apt/unit (only if applicable) -> city -> state -> zip
  |
  v
[3 OPTIONAL OFFER] "I can also collect insurance, emergency contact, preferred
   language, or an email. Would you like to add any of those?"
   yes -> collect only what they pick   |   no -> skip
  |
  v
[4 PRE-VALIDATE] TOOL validate_patient(payload)
   errors? -> re-prompt ONLY the failing field(s) -> validate again
  |
  v
[5 READ-BACK] Read every collected field in natural sentences.
   "Did I get everything right?"
   correction -> update that field -> re-read the changed part -> re-confirm
   "start over" -> clear everything, go to [2]
  |
  v
[6 SAVE] TOOL save_patient(payload)   (only after explicit yes)
   success -> "You're all set, {first_name}." -> endCall
   failure -> apologize, retry once, else give graceful message + endCall
```

Conversation rules (these go in the system prompt):
1. One question at a time. Short spoken sentences. No lists, no markdown, no emojis.
2. Accept out-of-order answers ("my number is... and I'm born in 1990") - store everything, then ask only for what is still missing.
3. Corrections at any time ("actually it's D-A-V-I-S") - update the field, acknowledge briefly, continue.
4. Spelled-out letters beat the transcribed word.
5. Phone numbers, zip codes and member IDs are read back digit by digit in groups.
6. Never save before the caller says yes to the read-back.
7. Never invent a value. If unsure, ask again.
8. If caller asks something off-topic, answer in one sentence and steer back.
9. Never give medical advice.

## 5. Tool-call sequence (technical)

```
Caller says phone number
  Vapi LLM --> tool check_existing_patient { phone_number: "5551234567" }
  Vapi --> POST /vapi/webhook  (header X-Vapi-Secret)
  backend: normalize phone -> SELECT ... WHERE phone_number=$1 AND deleted_at IS NULL
  backend --> { results:[{ toolCallId, result:'{"exists":true,"patient_id":"...","first_name":"Jane","last_name":"Doe"}' }] }
  LLM speaks: "It looks like we already have a record for Jane Doe. Would you like to update it?"

Caller confirms read-back
  Vapi LLM --> tool save_patient { ...all fields }
  backend: zod validate -> INSERT -> log final payload to stdout
  backend --> { results:[{ toolCallId, result:'{"ok":true,"patient_id":"..."}' }] }
     or    { results:[{ toolCallId, result:'{"ok":false,"errors":[{"field":"zip_code","message":"..."}]}' }] }

Call ends
  Vapi --> POST /vapi/webhook  { message: { type:"end-of-call-report", ... } }
  backend: INSERT/UPSERT call_logs (vapi_call_id, transcript, summary, ended_reason, patient_id if known)
```

Rules for the webhook:
- Always respond HTTP 200 with `{ results: [...] }` for tool-calls, even on errors (put the error in `result`). Never leave the caller in silence.
- Respond fast (< 2 s). No slow work inside tool calls.
- Verify the shared secret header; reject others with 401.
- toolCallId must be echoed back exactly.

## 6. Duplicate detection branch (bonus, build it - it is cheap)

```
check_existing_patient -> exists
   |
   v
Agent: "It looks like we already have a record for {First} {Last}. Would you like to update your information instead?"
   |-- Yes -> ask "What would you like to change?" -> collect only changed fields
   |         -> read back the changes -> caller confirms -> TOOL update_patient(patient_id, fields)
   |         -> "Done, {First}. Your record is updated." -> endCall
   |-- No  -> "No problem." Ask if the number was misheard or belongs to a different person;
             if it is a different person sharing the number, continue as NEW registration
             (phone is intentionally NOT a unique constraint: family members share numbers).
```

Privacy touch: the agent only says the NAME on file, never address/DOB/insurance, before the caller confirms who they are.

## 7. Edge cases & what happens

| Situation | Behavior |
|---|---|
| Invalid DOB (future date, Feb 30, 3-digit year) | Agent re-asks DOB specifically: "That date looks off. What is your date of birth, month day and year?" Server also rejects with 422 / field error. |
| Invalid phone (not 10 digits) | "I only caught 7 digits. Could you give me the full 10-digit number including area code?" |
| Invalid state / zip | Specific re-prompt. State names ("Texas") are mapped to abbreviations ("TX") by the LLM and re-checked server-side. |
| Caller corrects a field | Update that field only, confirm it, move on. Final read-back shows the corrected value. |
| Caller says "start over" | Agent clears all collected data, says so, begins at name again. |
| Caller gives several answers in one sentence | Store all, only ask for missing fields. |
| Caller interrupts the agent | Vapi stopSpeakingPlan handles barge-in; prompt tells agent to stay short so interruptions are rare. |
| Caller silent for a long time | Vapi silenceTimeoutSeconds + prompt: "Are you still there?" once, then polite goodbye. |
| Call drops mid-registration | Nothing is saved (no partial records). end-of-call-report arrives with endedReason; stored in call_logs with status "abandoned" and the transcript. Caller can call back and start fresh. |
| DB write fails | save_patient returns ok:false with a safe message. Agent: "I'm sorry, I had trouble saving that. Let me try once more." Retry once; if it fails again: "I'm sorry, our system is having a problem. Please call back in a few minutes." then endCall. Error logged with details to stdout. |
| Webhook unreachable / timeout | Vapi tool timeout -> prompt tells agent to apologize and ask the caller to call back. |
| Duplicate phone | See section 6. |
| Caller declines to give a required field | Explain briefly why it is needed. For sex, "Decline to Answer" is a valid value. For others, offer to continue later by calling back. |
| Caller speaks Spanish (bonus) | Prompt line: switch language, keep field values in English/enum form when calling tools. |
| Prompt injection ("ignore your instructions") | Prompt: stay in role. Server validation limits damage anyway. |

## 8. After-call data flow

1. save_patient succeeds -> patients row created. Final payload logged to stdout as one JSON line: `{"event":"patient_registered","patient_id":...,"payload":{...}}`.
2. Vapi sends end-of-call-report -> backend stores transcript, summary, endedReason, call id.
3. Link call_logs.patient_id to the patient (use the id returned by save_patient; keep a short in-memory map callId -> patientId set when save_patient runs, or have the report handler look it up by the phone number in the call's tool history).
4. Dashboard shows patients, and each patient's call transcript.

## 9. Environment variables

| Name | Required | Purpose |
|---|---|---|
| DATABASE_URL | yes | Postgres connection string |
| PORT | no (Railway sets it) | HTTP port |
| VAPI_WEBHOOK_SECRET | yes | Shared secret checked on /vapi/webhook |
| NODE_ENV | no | production/development |
| LOG_LEVEL | no | info/debug |
| VAPI_API_KEY | no | Only if you add an optional provisioning script |

Never commit .env. Commit .env.example with placeholder values only.

## 10. Build order (recommended time plan)

| Phase | Work | Target time |
|---|---|---|
| 0 | Manual: create Vapi account, Railway project + Postgres, GitHub repo | 20 min |
| 1 | Backend skeleton, schema, zod validators, service layer, REST API, seed | 60 min |
| 2 | /vapi/webhook with 4 tools + end-of-call-report; deploy to Railway | 30 min |
| 3 | Vapi assistant: paste system prompt + tools, attach phone number, test calls | 30 min |
| 4 | Dashboard page | 20 min |
| 5 | Tests, README, final end-to-end calls, record notes | 30 min |

Rule from the brief: a simple system that works beats an ambitious one that crashes. Get one full call working BEFORE adding bonuses.

## 11. Things only Maryam can do (Codex cannot)

1. Create a Vapi account, get the free US phone number, create the assistant, paste prompt + tools, set the server URL and secret.
2. Create the Railway project, add Postgres, set env vars, connect the GitHub repo.
3. Make the real test calls and fix wording in the prompt based on how it sounds.
4. Email the submission (see checklist).

## 12. Submission checklist (reply to Muhammad Akhtar)

- [ ] GitHub repository URL (public, or private with reviewer access)
- [ ] US phone number to call
- [ ] API base URL (https://your-app.up.railway.app)
- [ ] Dashboard URL (https://your-app.up.railway.app/dashboard)
- [ ] Notes: no auth needed on API; fake data only; seed patients listed; how to test duplicate detection
- [ ] README has setup, architecture, stack justification, env vars, limitations, Next Steps
- [ ] Do two full test calls (register, then call back with the same phone number) before sending
