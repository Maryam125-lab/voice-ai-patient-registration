import "dotenv/config";
import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  VAPI_WEBHOOK_SECRET: z
    .string()
    .min(16, "VAPI_WEBHOOK_SECRET must be at least 16 characters"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SIMULATE_DB_FAILURE: booleanFromString,
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment configuration: ${problems.join("; ")}`);
}

export const config = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  databaseUrl: parsed.data.DATABASE_URL,
  vapiWebhookSecret: parsed.data.VAPI_WEBHOOK_SECRET,
  logLevel: parsed.data.LOG_LEVEL,
  simulateDbFailure: parsed.data.SIMULATE_DB_FAILURE,
} as const;
