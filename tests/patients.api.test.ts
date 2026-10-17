import request from "supertest";
import { createApp } from "../src/app.js";
import { upsertCallLog } from "../src/services/callLogService.js";
import { resetTestDatabase } from "./testDatabase.js";

const app = createApp();
const validPatient = {
  first_name: "Jane",
  last_name: "Doe",
  date_of_birth: "04/12/1990",
  sex: "Female",
  phone_number: "(202) 555-0101",
  address_line_1: "12 Main Street",
  city: "Austin",
  state: "tx",
  zip_code: "78701",
};

async function createPatient(overrides: Record<string, unknown> = {}) {
  return request(app).post("/patients").send({ ...validPatient, ...overrides });
}

describe("patient REST API", () => {
  beforeEach(async () => resetTestDatabase());

  it("reports health only when the database responds", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: "ok" }, error: null });
  });

  it("serves the no-build dashboard", async () => {
    const response = await request(app).get("/dashboard");
    expect(response.status).toBe(200);
    expect(response.text).toContain("Ava Intake Console");
    expect((await request(app).get("/dashboard/app.js")).status).toBe(200);
  });

  it("creates, normalizes, lists, filters, and retrieves a patient", async () => {
    const created = await createPatient();
    expect(created.status).toBe(201);
    expect(created.body.error).toBeNull();
    expect(created.body.data.phone_number).toBe("2025550101");
    expect(created.body.data.state).toBe("TX");

    const patientId = created.body.data.patient_id as string;
    const list = await request(app).get("/patients").query({ last_name: "doe", phone_number: "202-555-0101" });
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const single = await request(app).get(`/patients/${patientId}`);
    expect(single.status).toBe(200);
    expect(single.body.data.date_of_birth).toBe("04/12/1990");
  });

  it("supports partial updates and rejects unknown fields", async () => {
    const created = await createPatient();
    const patientId = created.body.data.patient_id as string;

    const updated = await request(app).put(`/patients/${patientId}`).send({ city: "Dallas" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.city).toBe("Dallas");
    expect(updated.body.data.first_name).toBe("Jane");

    const invalid = await request(app).put(`/patients/${patientId}`).send({ nickname: "J" });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("soft deletes and hides the patient", async () => {
    const created = await createPatient();
    const patientId = created.body.data.patient_id as string;

    const deleted = await request(app).delete(`/patients/${patientId}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.patient_id).toBe(patientId);

    expect((await request(app).get(`/patients/${patientId}`)).status).toBe(404);
    expect((await request(app).delete(`/patients/${patientId}`)).status).toBe(404);
    expect((await request(app).get("/patients")).body.data).toHaveLength(0);
  });

  it("returns 400, 404, and 422 envelopes", async () => {
    const malformed = await request(app)
      .post("/patients")
      .set("Content-Type", "application/json")
      .send('{"first_name":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("MALFORMED_JSON");

    const invalid = await createPatient({ date_of_birth: "01/01/2999", phone_number: "123" });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "date_of_birth" }),
        expect.objectContaining({ field: "phone_number" }),
      ]),
    );

    expect((await request(app).get("/patients/not-a-uuid")).status).toBe(400);
    expect((await request(app).get("/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).status).toBe(404);
    expect((await request(app).get("/missing")).body).toEqual({
      data: null,
      error: { code: "NOT_FOUND", message: "No route matches GET /missing" },
    });
  });

  it("validates list filters", async () => {
    const response = await request(app).get("/patients").query({ date_of_birth: "yesterday" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_QUERY");
  });

  it("lists all calls and calls linked to a patient", async () => {
    const created = await createPatient();
    const patientId = created.body.data.patient_id as string;
    await upsertCallLog({
      vapi_call_id: "call-api-test",
      patient_id: patientId,
      status: "completed",
      transcript: "Test transcript",
      summary: "Test summary",
    });

    const patientCalls = await request(app).get(`/patients/${patientId}/calls`);
    expect(patientCalls.status).toBe(200);
    expect(patientCalls.body.data[0].transcript).toBe("Test transcript");

    const calls = await request(app).get("/calls");
    expect(calls.status).toBe(200);
    expect(calls.body.data).toHaveLength(1);
  });
});
