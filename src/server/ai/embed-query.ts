import { randomUUID } from "node:crypto";

import { env } from "@/server/config/env";
import { db } from "@/server/db/client";
import { llmOperations } from "@/server/db/schema";
import { logger } from "@/server/telemetry/logger";

import { getOpenAIClient } from "./openai-client";
import { toProviderError } from "./provider-error";

type EmbedQueryInput = {
  chatId: string;
  messageId: string;
  query: string;
  requestId: string;
};

export async function embedQuery({
  chatId,
  messageId,
  query,
  requestId,
}: EmbedQueryInput): Promise<number[]> {
  const startedAt = performance.now();
  const operationId = randomUUID();

  try {
    const response = await getOpenAIClient().embeddings.create({
      dimensions: env.EMBEDDING_DIMENSIONS,
      input: query,
      model: env.EMBEDDING_MODEL,
    });
    const embedding = response.data[0]?.embedding;
    if (!embedding) throw new Error("OpenAI returned no query embedding");

    const latencyMs = Math.round(performance.now() - startedAt);
    await db.insert(llmOperations).values({
      chatId,
      id: operationId,
      inputTokens: response.usage.total_tokens,
      latencyMs,
      messageId,
      metadata: { inputCount: 1, purpose: "retrieval_query" },
      model: env.EMBEDDING_MODEL,
      operation: "embedding",
      requestId,
      status: "succeeded",
      totalTokens: response.usage.total_tokens,
    });
    return embedding;
  } catch (error) {
    const appError = toProviderError(error);
    const latencyMs = Math.round(performance.now() - startedAt);
    try {
      await db.insert(llmOperations).values({
        chatId,
        errorCode: appError.code,
        id: operationId,
        latencyMs,
        messageId,
        metadata: { inputCount: 1, purpose: "retrieval_query" },
        model: env.EMBEDDING_MODEL,
        operation: "embedding",
        requestId,
        status: "failed",
      });
    } catch (loggingError) {
      logger.error(
        { chatId, err: loggingError, messageId, requestId },
        "query embedding operation record failed",
      );
    }
    throw appError;
  }
}
