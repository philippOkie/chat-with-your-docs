import { PgBoss } from "pg-boss";

import { env } from "@/server/config/env";
import { logger } from "@/server/telemetry/logger";

export const DOCUMENT_INGEST_QUEUE = "document.ingest";

export function createJobBoss() {
  const boss = new PgBoss({
    application_name: `${env.SERVICE_NAME}-pg-boss`,
    connectionString: env.DATABASE_URL,
  });

  boss.on("error", (error) => {
    logger.error({ err: error }, "pg-boss emitted an error");
  });

  return boss;
}
