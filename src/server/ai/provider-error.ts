import { AppError } from "@/server/domain/errors";

export function toProviderError(
  error: unknown,
  fallbackMessage = "OpenAI is temporarily unavailable. Please try again.",
): AppError {
  if (error instanceof AppError) return error;

  const status =
    typeof error === "object" && error && "status" in error
      ? Number(error.status)
      : undefined;
  const retryable =
    status === undefined ||
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500;

  return new AppError({
    cause: error,
    code: "PROVIDER_ERROR",
    message: retryable
      ? fallbackMessage
      : "OpenAI rejected the request. Check the API key and project access, then retry.",
    retryable,
    statusCode: retryable ? 503 : 400,
  });
}
