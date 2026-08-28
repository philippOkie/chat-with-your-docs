import OpenAI from "openai";

import { env } from "@/server/config/env";
import { AppError } from "@/server/domain/errors";

let client: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new AppError({
      code: "PROVIDER_ERROR",
      message:
        "OpenAI is not configured. Add OPENAI_API_KEY to .env, then retry this document.",
      statusCode: 503,
    });
  }

  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}
