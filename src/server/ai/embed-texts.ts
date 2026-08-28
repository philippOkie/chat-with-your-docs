import { randomUUID } from "node:crypto";

import { env } from "@/server/config/env";
import { db } from "@/server/db/client";
import { llmOperations } from "@/server/db/schema";
import { AppError } from "@/server/domain/errors";
import { logger } from "@/server/telemetry/logger";

import { getOpenAIClient } from "./openai-client";

type EmbedTextsInput = {
  documentId: string;
  requestId: string;
  texts: string[];
};

function toProviderError(error: unknown): AppError {
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
      ? "OpenAI is temporarily unavailable. The document can be retried."
      : "OpenAI rejected the embedding request. Check the API key and project access, then retry.",
    retryable,
    statusCode: retryable ? 503 : 400,
  });
}

export async function embedTexts({
  documentId,
  requestId,
  texts,
}: EmbedTextsInput): Promise<number[][]> {
  if (texts.length === 0) return [];

  const startedAt = performance.now();
  const operationId = randomUUID();
  let batchCount = 0;
  let totalTokens = 0;

  try {
    const client = getOpenAIClient();
    const embeddings: number[][] = [];

    for (
      let offset = 0;
      offset < texts.length;
      offset += env.EMBEDDING_BATCH_SIZE
    ) {
      const batch = texts.slice(offset, offset + env.EMBEDDING_BATCH_SIZE);
      const response = await client.embeddings.create({
        dimensions: env.EMBEDDING_DIMENSIONS,
        input: batch,
        model: env.EMBEDDING_MODEL,
      });

      batchCount += 1;
      totalTokens += response.usage.total_tokens;
      embeddings.push(
        ...response.data
          .toSorted((left, right) => left.index - right.index)
          .map((item) => item.embedding),
      );
    }

    const latencyMs = Math.round(performance.now() - startedAt);
    await db.insert(llmOperations).values({
      documentId,
      id: operationId,
      inputTokens: totalTokens,
      latencyMs,
      metadata: { batchCount, inputCount: texts.length },
      model: env.EMBEDDING_MODEL,
      operation: "embedding",
      requestId,
      status: "succeeded",
      totalTokens,
    });

    logger.info(
      {
        batchCount,
        documentId,
        inputCount: texts.length,
        latencyMs,
        model: env.EMBEDDING_MODEL,
        requestId,
        totalTokens,
      },
      "document embeddings completed",
    );

    return embeddings;
  } catch (error) {
    const providerError = toProviderError(error);
    const latencyMs = Math.round(performance.now() - startedAt);

    try {
      await db.insert(llmOperations).values({
        documentId,
        errorCode: providerError.code,
        id: operationId,
        latencyMs,
        metadata: { batchCount, inputCount: texts.length },
        model: env.EMBEDDING_MODEL,
        operation: "embedding",
        requestId,
        status: "failed",
        totalTokens: totalTokens || undefined,
      });
    } catch (loggingError) {
      logger.error(
        { documentId, err: loggingError, requestId },
        "embedding operation record failed",
      );
    }

    throw providerError;
  }
}
