import { randomUUID } from "node:crypto";

import { env } from "@/server/config/env";
import { db } from "@/server/db/client";
import { llmOperations } from "@/server/db/schema";
import type { ConversationMessage } from "@/server/domain/chat";
import { logger } from "@/server/telemetry/logger";

import { getOpenAIClient } from "./openai-client";
import { buildRewriteInput } from "./prompts";
import { toProviderError } from "./provider-error";

type RewriteQueryInput = {
  chatId: string;
  history: ConversationMessage[];
  messageId: string;
  question: string;
  requestId: string;
};

export async function rewriteQuery({
  chatId,
  history,
  messageId,
  question,
  requestId,
}: RewriteQueryInput): Promise<string> {
  const startedAt = performance.now();
  const operationId = randomUUID();

  try {
    const response = await getOpenAIClient().responses.create({
      input: buildRewriteInput(history, question),
      max_output_tokens: 160,
      model: env.REWRITE_MODEL,
      reasoning: { effort: "none" },
      store: false,
    });
    const rewritten = response.output_text.trim();
    if (!rewritten) throw new Error("OpenAI returned an empty query rewrite");

    const latencyMs = Math.round(performance.now() - startedAt);
    await db.insert(llmOperations).values({
      chatId,
      id: operationId,
      inputTokens: response.usage?.input_tokens,
      latencyMs,
      messageId,
      metadata: { historyMessageCount: history.length },
      model: env.REWRITE_MODEL,
      operation: "query_rewrite",
      outputTokens: response.usage?.output_tokens,
      requestId,
      status: "succeeded",
      totalTokens: response.usage?.total_tokens,
    });
    logger.info(
      {
        chatId,
        historyMessageCount: history.length,
        latencyMs,
        messageId,
        model: env.REWRITE_MODEL,
        requestId,
      },
      "query rewrite completed",
    );
    return rewritten;
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
        metadata: { historyMessageCount: history.length },
        model: env.REWRITE_MODEL,
        operation: "query_rewrite",
        requestId,
        status: "failed",
      });
    } catch (loggingError) {
      logger.error(
        { chatId, err: loggingError, messageId, requestId },
        "query rewrite operation record failed",
      );
    }
    throw appError;
  }
}
