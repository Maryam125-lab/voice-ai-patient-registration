# Manual setup and deployment

These steps create the resources that cannot be provisioned safely without the candidate's own accounts. Use fake patient data only.

## 1. Create the GitHub repository

1. Create an empty repository in your GitHub account.
2. From this project's directory run:

   ```bash
   git init
   git add .
   git commit -m "Build Voice AI patient registration system"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
   git push -u origin main
   ```

3. If the repository is private, grant the reviewer access.

## 2. Create the free PostgreSQL database on Supabase

1. Create a Supabase project on the Free plan. No paid add-on is required.
2. In SQL Editor, run `src/db/schema.sql`.
3. Open **Connect**, choose **Transaction pooler**, and copy the port `6543` connection string.
4. Replace `[YOUR-PASSWORD]` with the database password. This becomes `DATABASE_URL`.

The schema enables RLS and revokes Data API access for both tables. The public
dashboard talks only to the Express API; do not expose database keys in frontend code.

## 3. Deploy the backend on Vercel Hobby

1. Import the GitHub repository into a personal Vercel Hobby account.
2. Keep Framework Preset and build settings on their detected defaults.
3. Add these environment variables for Production, Preview, and Development:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Supabase Transaction pooler connection string |
   | `NODE_ENV` | `production` |
   | `VAPI_WEBHOOK_SECRET` | A new random value of at least 32 characters |
   | `LOG_LEVEL` | `info` |
   | `SIMULATE_DB_FAILURE` | `false` |

4. Deploy on the Hobby plan. Do not start a Pro trial or add a payment method.
5. Verify:

   ```bash
   curl https://YOUR-APP.vercel.app/health
   curl https://YOUR-APP.vercel.app/patients
   ```

6. Open `https://YOUR-APP.vercel.app/dashboard`.

## 4. Create the Vapi webhook credential

Current Vapi accounts use saved credentials rather than an inline `server.secret`.

1. Open Vapi organization settings and create a custom credential.
2. Select **Bearer Token**.
3. Set the header name to `X-Vapi-Secret`.
4. Disable the Bearer prefix.
5. Use exactly the same token stored in Vercel as `VAPI_WEBHOOK_SECRET`.
6. Save the credential and copy its credential ID.

Official reference: <https://docs.vapi.ai/server-url/server-authentication>

## 5. Create the four Vapi Function tools

The safest route is Vapi Dashboard → Tools → Create Tool → Function tool.

For each object in `vapi/tools.json`:

1. Create a Function tool with the same function name, description, and parameter schema.
2. Set Server URL to `https://YOUR-APP.vercel.app/vapi/webhook`.
3. Attach the saved credential from step 3.
4. Keep the tool synchronous and set the timeout to 20 seconds.
5. Add a short request-start message such as "One moment while I check that."
6. Save and publish the tool.

The backend accepts the documented `message.toolCallList` format and common legacy variants. It returns one flat string result per `toolCallId` and always uses HTTP 200 for tool-call processing.

Official reference: <https://docs.vapi.ai/tools/custom-tools>

## 6. Create the Ava assistant

1. Create a blank assistant named **Ava - Patient Registration**.
2. Model:
   - Provider: OpenAI
   - Model: `gpt-5.4-mini` (or the nearest currently available fast mini model)
   - Temperature: approximately `0.3`
3. Paste `vapi/system-prompt.md` into the system prompt. The `{{"now" | date: ...}}` expression is supported by Vapi Liquid variables.
4. Set the first message to:

   > Hi, thanks for calling. This is Ava, and I'll help you register as a new patient. It only takes a few minutes. Could I start with your first and last name?

5. Transcriber:
   - Provider: Deepgram
   - Model: `nova-3`
   - Language: `en`
6. Select a natural English voice.
7. Attach the four saved Function tools and Vapi's built-in End Call tool.
8. Assistant server URL: `https://YOUR-APP.vercel.app/vapi/webhook`.
9. Attach the same saved `X-Vapi-Secret` credential.
10. Enable server messages `tool-calls` and `end-of-call-report`.
11. Configure a maximum call duration around 600 seconds and a silence timeout around 30 seconds.
12. Save and publish the assistant.

Model reference: <https://docs.vapi.ai/providers/model/openai>

Transcriber reference: <https://docs.vapi.ai/providers/transcriber/deepgram>

## 7. Provision and attach the U.S. number

1. In Vapi, open Phone Numbers and provision a U.S. number.
2. Attach the Ava assistant to the number.
3. Place a test call and complete one registration using fake data.
4. Confirm the patient appears in `/patients` and `/dashboard`.
5. Call again using the same patient phone number and verify that Ava offers to update the existing record.

## 8. Test failure and interruption paths

1. Set Vercel `SIMULATE_DB_FAILURE=true`, redeploy, and make a call through confirmation.
2. Confirm Ava apologizes, retries once, and ends gracefully instead of going silent.
3. Restore `SIMULATE_DB_FAILURE=false` immediately.
4. Start another registration and hang up before confirmation.
5. Confirm `/calls` contains an `abandoned` record and no partial patient record was created.

## 9. Final submission values

Send the reviewer:

- Repository URL
- U.S. phone number
- API base URL
- Dashboard URL (`/dashboard`)
- API documentation/testing notes
- Any access notes for a private repository

Do not send API keys, Supabase database credentials, or the Vapi webhook secret.
