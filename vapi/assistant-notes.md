# Vapi assistant settings (verify field names against current Vapi docs)

- Name: Ava - Patient Registration
- Model: OpenAI gpt-5.4-mini, temperature 0.3, system prompt = vapi/system-prompt.md
- Transcriber: Deepgram nova-3 (language: en; use multi only if testing Spanish)
- Voice: natural Vapi / ElevenLabs / Cartesia voice
- First message: "Hi, thanks for calling. This is Ava, and I'll help you register as a new patient. It only takes a few minutes. Could I start with your first and last name?"
- Tools: the 4 function tools in tools.json + built-in End Call
- Server URL: https://<host>/vapi/webhook. Attach a saved custom credential whose header is X-Vapi-Secret, bearer prefix is disabled, and token equals VAPI_WEBHOOK_SECRET.
- Server messages: tool-calls, end-of-call-report
- silenceTimeoutSeconds: 30 | maxDurationSeconds: 600 | backgroundDenoisingEnabled: true
- End call message: "Thank you for calling. Goodbye."
- Phone number: free US number from the Vapi dashboard, attach to this assistant

The original assessment suggested GPT-4o. As of October 2026, OpenAI marks GPT-4o deprecated; gpt-5.4-mini is a current Vapi-supported low-cost model with tool calling. Confirm availability in the Vapi model picker before publishing.
