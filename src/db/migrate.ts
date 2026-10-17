import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { closeDatabase, query } from "./pool.js";
import { logger } from "../logger.js";

async function migrate(): Promise<void> {
  const schemaPath = join(process.cwd(), "src", "db", "schema.sql");
  const sql = await readFile(schemaPath, "utf8");
  await query(sql);
  logger.info("database_migrated");
}

migrate()
  .catch((error: unknown) => {
    logger.error("database_migration_failed", { error });
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
