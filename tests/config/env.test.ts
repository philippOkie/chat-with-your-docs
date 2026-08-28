import { describe, expect, it } from "vitest";

import { parseEnv } from "@/server/config/env";

describe("parseEnv", () => {
  it("provides safe local defaults", () => {
    const result = parseEnv({});

    expect(result.ANSWER_MODEL).toBe("gpt-5.6-terra");
    expect(result.EMBEDDING_DIMENSIONS).toBe(1536);
    expect(result.MAX_UPLOAD_BYTES).toBe(15 * 1024 * 1024);
    expect(result.OPENAI_API_KEY).toBeUndefined();
    expect(result.REWRITE_MODEL).toBe("gpt-5.6-luna");
  });

  it("treats an empty OpenAI key as absent", () => {
    const result = parseEnv({ OPENAI_API_KEY: "" });

    expect(result.OPENAI_API_KEY).toBeUndefined();
  });

  it("rejects invalid database protocols", () => {
    expect(() => parseEnv({ DATABASE_URL: "https://example.com/db" })).toThrow(
      "DATABASE_URL must use the postgres or postgresql protocol",
    );
  });

  it("rejects non-positive upload limits", () => {
    expect(() => parseEnv({ MAX_UPLOAD_BYTES: "0" })).toThrow();
  });

  it("keeps the embedding size aligned with the vector column", () => {
    expect(() => parseEnv({ EMBEDDING_DIMENSIONS: "768" })).toThrow(
      "EMBEDDING_DIMENSIONS must remain 1536 to match the database schema",
    );
  });
});
