import { closeDatabase, query } from "./pool.js";
import { logger } from "../logger.js";

const seedPatients = [
  {
    patientId: "11111111-1111-4111-8111-111111111111",
    firstName: "Jane",
    lastName: "Doe",
    dateOfBirth: "1990-04-12",
    sex: "Female",
    phoneNumber: "2025550101",
    email: "jane.doe@example.test",
    address: "12 Main Street",
    city: "Austin",
    state: "TX",
    zipCode: "78701",
  },
  {
    patientId: "22222222-2222-4222-8222-222222222222",
    firstName: "Miguel",
    lastName: "Santos",
    dateOfBirth: "1985-09-23",
    sex: "Male",
    phoneNumber: "2025550102",
    email: "miguel.santos@example.test",
    address: "44 Oak Avenue",
    city: "Denver",
    state: "CO",
    zipCode: "80202",
  },
] as const;

async function seed(): Promise<void> {
  for (const patient of seedPatients) {
    await query(
      `INSERT INTO patients (
        patient_id, first_name, last_name, date_of_birth, sex, phone_number,
        email, address_line_1, city, state, zip_code
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (patient_id) DO NOTHING`,
      [
        patient.patientId,
        patient.firstName,
        patient.lastName,
        patient.dateOfBirth,
        patient.sex,
        patient.phoneNumber,
        patient.email,
        patient.address,
        patient.city,
        patient.state,
        patient.zipCode,
      ],
    );
  }
  logger.info("database_seeded", { count: seedPatients.length });
}

seed()
  .catch((error: unknown) => {
    logger.error("database_seed_failed", { error });
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
