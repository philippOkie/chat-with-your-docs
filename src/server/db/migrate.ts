import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db, pool } from "@/server/db/client";
import { logger } from "@/server/telemetry/logger";

async function runMigrations() {
  const startedAt = performance.now();

  logger.info("database migration started");
  await migrate(db, { migrationsFolder: "./drizzle" });

  logger.info(
    { latencyMs: Math.round(performance.now() - startedAt) },
    "database migration completed",
  );
}

runMigrations()
  .catch((error: unknown) => {
    logger.fatal({ err: error }, "database migration failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
