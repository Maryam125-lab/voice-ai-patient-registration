import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { config } from "../config.js";

export interface DatabaseClient {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
  end?: () => Promise<void>;
}

let client: DatabaseClient | undefined;

function createProductionPool(): DatabaseClient {
  const isServerless = Boolean(process.env.VERCEL);
  return new Pool({
    connectionString: config.databaseUrl,
    ssl: config.nodeEnv === "production" ? { rejectUnauthorized: false } : undefined,
    // Supabase recommends one application-side connection per warm
    // serverless instance when using its transaction pooler.
    max: isServerless ? 1 : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export function database(): DatabaseClient {
  client ??= createProductionPool();
  return client;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  return database().query<T>(text, values);
}

export function setDatabaseForTests(testClient: DatabaseClient): void {
  if (config.nodeEnv !== "test") throw new Error("A test database can only be injected in test mode");
  client = testClient;
}

export async function closeDatabase(): Promise<void> {
  await client?.end?.();
  client = undefined;
}
