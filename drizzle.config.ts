import { defineConfig } from "drizzle-kit";

import { env } from "./src/server/config/env";

export default defineConfig({
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  migrations: {
    prefix: "timestamp",
  },
  out: "./drizzle",
  schema: "./src/server/db/schema.ts",
  strict: true,
  verbose: true,
});
