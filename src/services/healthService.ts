import { query } from "../db/pool.js";

export async function checkHealth(): Promise<{ status: "ok" }> {
  await query("SELECT 1 AS ok");
  return { status: "ok" };
}
