import { randomUUID } from "node:crypto";

import { zodTextFormat } from "openai/helpers/zod";

import { env } from "@/server/config/env";
import { db } from "@/server/db/client";
import { llmOperations } from "@/server/db/schema";
import type { ConversationMessage, RetrievedChunk } from "@/server/domain/chat";
import { logger } from "@/server/telemetry/logger";

import { getOpenAIClient } from "./openai-client";
import { readPartialJsonStringField } from "./partial-json";
import { buildGenerationInput } from "./prompts";
import { toProviderError } from "./provider-error";
import { AnswerSchema, type AnswerOutput } from "./schemas";

type GenerateAnswerInput = {
  chatId: string;
  chunks: RetrievedChunk[];
  history: ConversationMessage[];
  messageId: string;
  onAnswerDelta: (text: string) => void;
  onGeneralDelta: (text: string) => void;
  question: string;
  requestId: string;
  signal: AbortSignal;
};

export type GenerationResult = {
  inputTokens: number | null;
  latencyMs: number;
  output: AnswerOutput;
  outputTokens: number | null;
  timeToFirstTokenMs: number | null;
};

export async function generateAnswer({
  chatId,
  chunks,
  history,
  messageId,
  onAnswerDelta,
  onGeneralDelta,
  question,
  requestId,
  signal,
}: GenerateAnswerInput): Promise<GenerationResult> {
  const startedAt = performance.now();
  const operationId = randomUUID();
  let answerLength = 0;
  let generalLength = 0;
  let timeToFirstTokenMs: number | null = null;
  let structuredSnapshot = "";

  const emitPartial = (snapshot: string) => {
    const groundedAnswerMarkdown = readPartialJsonStringField(
      snapshot,
      "groundedAnswerMarkdown",
    );
    const generalKnowledgeMarkdown = readPartialJsonStringField(
      snapshot,
      "generalKnowledgeMarkdown",
    );

    if (
      typeof groundedAnswerMarkdown === "string" &&
      groundedAnswerMarkdown.length > answerLength
    ) {
      const delta = groundedAnswerMarkdown.slice(answerLength);
      answerLength = groundedAnswerMarkdown.length;
      timeToFirstTokenMs ??= Math.round(performance.now() - startedAt);
      onAnswerDelta(delta);
    }

    if (
      typeof generalKnowledgeMarkdown === "string" &&
      generalKnowledgeMarkdown.length > generalLength
    ) {
      const delta = generalKnowledgeMarkdown.slice(generalLength);
      generalLength = generalKnowledgeMarkdown.length;
      timeToFirstTokenMs ??= Math.round(performance.now() - startedAt);
      onGeneralDelta(delta);
    }
  };

  try {
    const stream = getOpenAIClient().responses.stream(
      {
        input: buildGenerationInput(history, question, chunks),
        instructions:
          "You are a document-grounded assistant. Obey the output schema exactly and keep document evidence separate from outside knowledge.",
        max_output_tokens: 2_400,
        model: env.ANSWER_MODEL,
        reasoning: { effort: "low" },
        store: false,
        text: {
          format: zodTextFormat(AnswerSchema, "document_grounded_answer"),
        },
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        structuredSnapshot += event.delta;
        emitPartial(structuredSnapshot);
      }
    }

    const response = await stream.finalResponse();
    const output =
      response.output_parsed ??
      AnswerSchema.parse(JSON.parse(response.output_text));

    if (
      typeof output.groundedAnswerMarkdown === "string" &&
      output.groundedAnswerMarkdown.length > answerLength
    ) {
      onAnswerDelta(output.groundedAnswerMarkdown.slice(answerLength));
      timeToFirstTokenMs ??= Math.round(performance.now() - startedAt);
    }
    if (
      typeof output.generalKnowledgeMarkdown === "string" &&
      output.generalKnowledgeMarkdown.length > generalLength
    ) {
      onGeneralDelta(output.generalKnowledgeMarkdown.slice(generalLength));
      timeToFirstTokenMs ??= Math.round(performance.now() - startedAt);
    }

    const latencyMs = Math.round(performance.now() - startedAt);
    await db.insert(llmOperations).values({
      chatId,
      id: operationId,
      inputTokens: response.usage?.input_tokens,
      latencyMs,
      messageId,
      metadata: {
        answerability: output.answerability,
        contextChunkCount: chunks.length,
      },
      model: env.ANSWER_MODEL,
      operation: "answer_generation",
      outputTokens: response.usage?.output_tokens,
      requestId,
      status: "succeeded",
      timeToFirstTokenMs: timeToFirstTokenMs ?? undefined,
      totalTokens: response.usage?.total_tokens,
    });

    logger.info(
      {
        answerability: output.answerability,
        chatId,
        contextChunkCount: chunks.length,
        latencyMs,
        messageId,
        model: env.ANSWER_MODEL,
        requestId,
        timeToFirstTokenMs,
      },
      "answer generation completed",
    );

    return {
      inputTokens: response.usage?.input_tokens ?? null,
      latencyMs,
      output,
      outputTokens: response.usage?.output_tokens ?? null,
      timeToFirstTokenMs,
    };
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
        metadata: { contextChunkCount: chunks.length },
        model: env.ANSWER_MODEL,
        operation: "answer_generation",
        requestId,
        status: "failed",
        timeToFirstTokenMs: timeToFirstTokenMs ?? undefined,
      });
    } catch (loggingError) {
      logger.error(
        { chatId, err: loggingError, messageId, requestId },
        "answer generation operation record failed",
      );
    }
    throw appError;
  }
}
