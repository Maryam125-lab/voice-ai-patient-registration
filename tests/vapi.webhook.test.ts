import request from "supertest";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { clearCallLinksForTests } from "../src/services/vapiService.js";
import { resetTestDatabase } from "./testDatabase.js";

const app = createApp();
const auth = { "X-Vapi-Secret": config.vapiWebhookSecret };
const patient = {
  first_name: "Jane",
  last_name: "Doe",
  date_of_birth: "04/12/1990",
  sex: "Female",
  phone_number: "2025550101",
  address_line_1: "12 Main Street",
  city: "Austin",
  state: "TX",
  zip_code: "78701",
};

function toolBody(id: string, name: string, args: unknown, callId = "call-test") {
  return {
    message: {
      type: "tool-calls",
      call: { id: callId },
      toolCallList: [{ id, type: "function", function: { name, arguments: args } }],
    },
  };
}

async function callTool(id: string, name: string, args: unknown, callId?: string) {
  const response = await request(app)
    .post("/vapi/webhook")
    .set(auth)
    .send(toolBody(id, name, args, callId));
  return { response, result: JSON.parse(response.body.results[0].result as string) as Record<string, unknown> };
}

describe("Vapi webhook", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    clearCallLinksForTests();
  });

  it("rejects requests without the shared secret", async () => {
    const response = await request(app).post("/vapi/webhook").send(toolBody("1", "validate_patient", patient));
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("validates patient data and accepts string arguments", async () => {
    const valid = await callTool("validate-1", "validate_patient", JSON.stringify(patient));
    expect(valid.response.status).toBe(200);
    expect(valid.response.body.results[0].toolCallId).toBe("validate-1");
    expect(valid.result).toEqual({ valid: true });

    const invalid = await callTool("validate-2", "validate_patient", { ...patient, phone_number: "123" });
    expect(invalid.result.valid).toBe(false);
    expect(invalid.result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: "phone_number" })]));
  });

  it("saves a patient and detects the duplicate by phone", async () => {
    const saved = await callTool("save-1", "save_patient", patient);
    expect(saved.result.ok).toBe(true);

    const found = await callTool("check-1", "check_existing_patient", { phone_number: "(202) 555-0101" });
    expect(found.result).toMatchObject({ exists: true, first_name: "Jane", last_name: "Doe" });
  });

  it("updates an existing patient with only changed fields", async () => {
    const saved = await callTool("save-1", "save_patient", patient);
    const patientId = saved.result.patient_id as string;
    const updated = await callTool("update-1", "update_patient", { patient_id: patientId, city: "Dallas" });
    expect(updated.result).toMatchObject({ ok: true, patient_id: patientId });

    const record = await request(app).get(`/patients/${patientId}`);
    expect(record.body.data.city).toBe("Dallas");
  });

  it("returns a safe result for unknown tools and malformed arguments", async () => {
    const unknown = await callTool("unknown-1", "does_not_exist", {});
    expect(unknown.result).toMatchObject({ ok: false, error: "unknown_tool" });

    const malformed = await callTool("bad-1", "save_patient", "not json");
    expect(malformed.response.status).toBe(200);
    expect(malformed.result.ok).toBe(false);
  });

  it("stores a completed end-of-call report linked to the saved patient", async () => {
    const saved = await callTool("save-1", "save_patient", patient, "call-complete");
    const patientId = saved.result.patient_id as string;

    const report = await request(app)
      .post("/vapi/webhook")
      .set(auth)
      .send({
        message: {
          type: "end-of-call-report",
          call: {
            id: "call-complete",
            customer: { number: "+12025550101" },
            startedAt: "2026-10-18T00:00:00.000Z",
            endedAt: "2026-10-18T00:03:00.000Z",
          },
          endedReason: "assistant-ended-call",
          transcript: "Ava: Welcome\nUser: Jane Doe",
          summary: "Patient registration completed",
        },
      });
    expect(report.status).toBe(200);

    const calls = await request(app).get(`/patients/${patientId}/calls`);
    expect(calls.body.data[0]).toMatchObject({
      vapi_call_id: "call-complete",
      status: "completed",
      summary: "Patient registration completed",
    });
  });

  it("stores an abandoned call when no patient was saved", async () => {
    await request(app)
      .post("/vapi/webhook")
      .set(auth)
      .send({
        message: {
          type: "end-of-call-report",
          call: { id: "call-abandoned" },
          endedReason: "customer-ended-call",
        },
      });
    const calls = await request(app).get("/calls");
    expect(calls.body.data[0]).toMatchObject({ vapi_call_id: "call-abandoned", status: "abandoned" });
  });
});
