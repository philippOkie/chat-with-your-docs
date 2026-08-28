import pino from "pino";

import { env } from "@/server/config/env";

export const logger = pino({
  base: {
    environment: env.NODE_ENV,
    service: env.SERVICE_NAME,
  },
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "apiKey",
      "authorization",
      "req.headers.authorization",
      "request.headers.authorization",
      "OPENAI_API_KEY",
    ],
    remove: true,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
