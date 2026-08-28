import { pool } from "@/server/db/client";
import { isOpenAIConfigured } from "@/server/jobs/document-ingestion";
import { getRequestId } from "@/server/http/route-response";
import { logger } from "@/server/telemetry/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const startedAt = performance.now();
  const requestId = getRequestId(request);

  try {
    await pool.query("select 1");

    const latencyMs = Math.round(performance.now() - startedAt);
    logger.info({ latencyMs, requestId }, "health check succeeded");

    return Response.json(
      {
        checks: {
          database: "up",
          openai: isOpenAIConfigured() ? "configured" : "not_configured",
        },
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
        checks: {
          database: "down",
          openai: isOpenAIConfigured() ? "configured" : "not_configured",
        },
        requestId,
        status: "error",
      },
      { headers: { "x-request-id": requestId }, status: 503 },
    );
  }
}
