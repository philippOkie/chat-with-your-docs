import { describe, expect, it } from "vitest";

import { AppError } from "@/server/domain/errors";

describe("AppError", () => {
  it("exposes only safe application details", () => {
    const providerError = new Error("secret provider response");
    const error = new AppError({
      cause: providerError,
      code: "PROVIDER_ERROR",
      message: "The model provider is temporarily unavailable.",
      retryable: true,
      statusCode: 503,
    });

    expect(error.cause).toBe(providerError);
    expect(error.statusCode).toBe(503);
    expect(error.toSafeResponse()).toEqual({
      code: "PROVIDER_ERROR",
      message: "The model provider is temporarily unavailable.",
      retryable: true,
    });
    expect(JSON.stringify(error.toSafeResponse())).not.toContain("secret");
  });
});
