import { randomUUID } from "node:crypto";

import { AppError } from "@/server/domain/errors";
import { logger } from "@/server/telemetry/logger";

export function getRequestId(request: Request): string {
  const supplied = request.headers.get("x-request-id");
  return supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)
    ? supplied
    : randomUUID();
}

export function routeErrorResponse(
  error: unknown,
  requestId: string,
): Response {
  const appError =
    error instanceof AppError
      ? error
      : new AppError({
          cause: error,
          code: "UNEXPECTED_ERROR",
          message: "Something went wrong. Please try again.",
          retryable: true,
        });

  logger.error(
    { code: appError.code, err: appError, requestId },
    "request failed",
  );

  return Response.json(
    { error: appError.toSafeResponse(), requestId },
    {
      headers: { "x-request-id": requestId },
      status: appError.statusCode,
    },
  );
}
