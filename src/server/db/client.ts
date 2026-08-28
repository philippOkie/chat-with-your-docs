import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/server/config/env";

import * as schema from "./schema";

const globalForDatabase = globalThis as unknown as {
  databasePool?: Pool;
};

export const pool =
  globalForDatabase.databasePool ??
  new Pool({
    application_name: env.SERVICE_NAME,
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
  });

if (env.NODE_ENV !== "production") {
  globalForDatabase.databasePool = pool;
}

export const db = drizzle(pool, { schema });
