import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { config } from "../config.js";

export interface DatabaseClient {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
  end?: () => Promise<void>;
}

let client: DatabaseClient | undefined;

function createProductionPool(): DatabaseClient {
  const isServerless = Boolean(process.env.VERCEL);
  const connectionUrl = new URL(config.databaseUrl);

  // node-postgres lets SSL query parameters in the connection string replace
  // the explicit ssl object. Supabase pooler URLs commonly include
  // `sslmode=require`, so remove it and keep the intended serverless TLS
  // policy below.
  connectionUrl.searchParams.delete("sslmode");

  return new Pool({
    connectionString: connectionUrl.toString(),
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
