import { randomUUID } from "node:crypto";

import { pool } from "@/server/db/client";
import { logger } from "@/server/telemetry/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const startedAt = performance.now();
  const suppliedRequestId = request.headers.get("x-request-id");
  const requestId =
    suppliedRequestId && /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();

  try {
    await pool.query("select 1");

    const latencyMs = Math.round(performance.now() - startedAt);
    logger.info({ latencyMs, requestId }, "health check succeeded");

    return Response.json(
      {
        checks: { database: "up" },
        requestId,
        status: "ok",
      },
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startedAt);
    logger.error({ err: error, latencyMs, requestId }, "health check failed");

    return Response.json(
      {
        checks: { database: "down" },
        requestId,
        status: "error",
      },
      { headers: { "x-request-id": requestId }, status: 503 },
    );
  }
}
