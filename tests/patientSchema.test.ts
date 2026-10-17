import {
  apiDateToDatabase,
  createPatientSchema,
  databaseDateToApi,
  normalizePhone,
  updatePatientSchema,
} from "../src/domain/patientSchema.js";

const validPatient = {
  first_name: "  Jane  ",
  last_name: "O'Brien-Smith",
  date_of_birth: "04/12/1990",
  sex: "Female",
  phone_number: "+1 (202) 555-0101",
  address_line_1: "12 Main Street",
  city: "Austin",
  state: "tx",
  zip_code: "78701",
};

describe("patient schema", () => {
  it("normalizes a valid patient", () => {
    const patient = createPatientSchema.parse(validPatient);
    expect(patient.first_name).toBe("Jane");
    expect(patient.phone_number).toBe("2025550101");
    expect(patient.state).toBe("TX");
    expect(patient.preferred_language).toBe("English");
  });

  it("rejects impossible and future dates", () => {
    expect(() => createPatientSchema.parse({ ...validPatient, date_of_birth: "02/30/2000" })).toThrow();
    expect(() => createPatientSchema.parse({ ...validPatient, date_of_birth: "01/01/2999" })).toThrow();
  });

  it("rejects short phone numbers", () => {
    expect(() => createPatientSchema.parse({ ...validPatient, phone_number: "123" })).toThrow();
  });

  it("rejects invalid state abbreviations and unknown fields", () => {
    expect(() => createPatientSchema.parse({ ...validPatient, state: "ZZ" })).toThrow();
    expect(() => createPatientSchema.parse({ ...validPatient, unexpected: true })).toThrow();
  });

  it("accepts partial updates but not empty updates", () => {
    expect(updatePatientSchema.parse({ first_name: "Ana-Maria" })).toEqual({ first_name: "Ana-Maria" });
    expect(() => updatePatientSchema.parse({})).toThrow();
  });

  it("converts API and database dates without timezone drift", () => {
    expect(apiDateToDatabase("04/12/1990")).toBe("1990-04-12");
    expect(databaseDateToApi("1990-04-12")).toBe("04/12/1990");
  });

  it("strips only a leading US country code", () => {
    expect(normalizePhone("+1 (202) 555-0101")).toBe("2025550101");
    expect(normalizePhone("202.555.0101")).toBe("2025550101");
  });
});
