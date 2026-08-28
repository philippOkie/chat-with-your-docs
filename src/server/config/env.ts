import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const environmentSchema = z.object({
  ANSWER_MODEL: z.string().min(1).default("gpt-5.6-terra"),
  DATABASE_URL: z
    .string()
    .refine(
      (value) =>
        value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL must use the postgres or postgresql protocol",
    )
    .default(
      "postgresql://postgres:postgres@localhost:5432/chat_with_your_docs",
    ),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  EMBEDDING_DIMENSIONS: z.coerce
    .number()
    .int()
    .refine(
      (value) => value === 1536,
      "EMBEDDING_DIMENSIONS must remain 1536 to match the database schema",
    )
    .default(1536),
  EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 1024 * 1024),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  OPENAI_API_KEY: optionalSecret,
  REWRITE_MODEL: z.string().min(1).default("gpt-5.6-luna"),
  SERVICE_NAME: z.string().min(1).default("web"),
  STORAGE_DIR: z.string().min(1).default("./data/uploads"),
});

export type AppEnvironment = z.infer<typeof environmentSchema>;

export function parseEnv(
  input: Record<string, string | undefined>,
): AppEnvironment {
  return environmentSchema.parse(input);
}

export const env = parseEnv(process.env);
