import { and, desc, eq } from "drizzle-orm";

import { embedQuery } from "@/server/ai/embed-query";
import { generateAnswer } from "@/server/ai/generate-answer";
import { rewriteQuery } from "@/server/ai/rewrite-query";
import { env } from "@/server/config/env";
import { db } from "@/server/db/client";
import {
  chatDocuments,
  chats,
  documents,
  messages,
  messageSources,
} from "@/server/db/schema";
import type {
  ConversationMessage,
  QuestionStreamEvent,
} from "@/server/domain/chat";
import { AppError } from "@/server/domain/errors";
import { validateCitedChunkIds } from "@/server/retrieval/policies";
import { retrieveChunks } from "@/server/retrieval/retrieve-chunks";
import { toPublicSource } from "@/server/retrieval/source";
import { logger } from "@/server/telemetry/logger";

type AskQuestionInput = {
  chatId: string;
  emit: (event: QuestionStreamEvent) => void;
  question: string;
  requestId: string;
  signal: AbortSignal;
};

function titleFromQuestion(question: string): string {
  const normalized = question.replaceAll(/\s+/g, " ").trim();
  return normalized.length <= 58
    ? normalized
    : `${normalized.slice(0, 57).trimEnd()}…`;
}

function normalizeQuestionError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError({
    cause: error,
    code: "UNEXPECTED_ERROR",
    message: "The answer could not be completed. Please retry the question.",
    retryable: true,
  });
}

export async function askQuestion({
  chatId,
  emit,
  question,
  requestId,
  signal,
}: AskQuestionInput): Promise<void> {
  const normalizedQuestion = question.trim();
  if (!normalizedQuestion) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Write a question before sending it.",
      statusCode: 400,
    });
  }
  if (normalizedQuestion.length > env.MAX_QUESTION_CHARACTERS) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: `Questions can contain up to ${env.MAX_QUESTION_CHARACTERS.toLocaleString()} characters.`,
      statusCode: 400,
    });
  }

  const [chat] = await db
    .select()
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(1);
  if (!chat) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Conversation not found.",
      statusCode: 404,
    });
  }

  const [activeMessage] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.status, "streaming")))
    .limit(1);
  if (activeMessage) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "This conversation is already generating an answer.",
      statusCode: 409,
    });
  }

  const selectedDocuments = await db
    .select({ id: chatDocuments.documentId })
    .from(chatDocuments)
    .innerJoin(documents, eq(documents.id, chatDocuments.documentId))
    .where(
      and(eq(chatDocuments.chatId, chatId), eq(documents.status, "ready")),
    );
  if (selectedDocuments.length === 0) {
    throw new AppError({
      code: "DOCUMENT_NOT_READY",
      message: "Select at least one ready document before asking a question.",
      statusCode: 409,
    });
  }

  const historyRows = await db
    .select({ content: messages.content, role: messages.role })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.status, "completed")))
    .orderBy(desc(messages.createdAt))
    .limit(6);
  const history: ConversationMessage[] = historyRows.toReversed();
  const hasPreviousUserMessage = history.some(
    (message) => message.role === "user",
  );

  const created = await db.transaction(async (transaction) => {
    const [userMessage] = await transaction
      .insert(messages)
      .values({
        chatId,
        content: normalizedQuestion,
        originalQuery: normalizedQuestion,
        role: "user",
        status: "completed",
      })
      .returning();
    const [assistantMessage] = await transaction
      .insert(messages)
      .values({
        chatId,
        content: "",
        role: "assistant",
        status: "streaming",
      })
      .returning();
    await transaction
      .update(chats)
      .set({
        title:
          chat.title === "New conversation"
            ? titleFromQuestion(normalizedQuestion)
            : chat.title,
        updatedAt: new Date(),
      })
      .where(eq(chats.id, chatId));
    return { assistantMessage, userMessage };
  });

  let answerBuffer = "";
  let generalBuffer = "";

  try {
    emit({ stage: "rewriting", type: "status" });
    const retrievalQuery = hasPreviousUserMessage
      ? await rewriteQuery({
          chatId,
          history,
          messageId: created.userMessage.id,
          question: normalizedQuestion,
          requestId,
        })
      : normalizedQuestion;

    await db
      .update(messages)
      .set({ rewrittenQuery: retrievalQuery, updatedAt: new Date() })
      .where(eq(messages.id, created.userMessage.id));

    emit({ stage: "retrieving", type: "status" });
    const queryEmbedding = await embedQuery({
      chatId,
      messageId: created.userMessage.id,
      query: retrievalQuery,
      requestId,
    });
    const retrievedChunks = await retrieveChunks(
      chatId,
      queryEmbedding,
      requestId,
    );

    emit({ stage: "answering", type: "status" });
    const generation = await generateAnswer({
      chatId,
      chunks: retrievedChunks,
      history,
      messageId: created.assistantMessage.id,
      onAnswerDelta(text) {
        answerBuffer += text;
        emit({ text, type: "answer.delta" });
      },
      onGeneralDelta(text) {
        generalBuffer += text;
        emit({ text, type: "general.delta" });
      },
      question: normalizedQuestion,
      requestId,
      signal,
    });

    const citations = validateCitedChunkIds(
      generation.output.citedChunkIds,
      retrievedChunks,
    );
    if (citations.invalidIds.length > 0) {
      logger.warn(
        {
          chatId,
          invalidCitationCount: citations.invalidIds.length,
          invalidCitationIds: citations.invalidIds,
          messageId: created.assistantMessage.id,
          requestId,
        },
        "invalid model citations dropped",
      );
    }

    const citedChunks =
      generation.output.answerability === "not_found"
        ? []
        : citations.validChunks.map((chunk, index) => ({
            ...chunk,
            rank: index + 1,
          }));
    const groundedAnswer = generation.output.groundedAnswerMarkdown?.trim();
    const generalKnowledge =
      generation.output.generalKnowledgeMarkdown?.trim() || null;
    const answerability =
      groundedAnswer &&
      citedChunks.length === 0 &&
      generation.output.answerability === "grounded"
        ? "partial"
        : generation.output.answerability;
    const persistedAnswer =
      groundedAnswer ||
      "I couldn’t find enough support for that answer in the selected documents.";

    await db.transaction(async (transaction) => {
      await transaction
        .update(messages)
        .set({
          answerability,
          content: persistedAnswer,
          generalKnowledge,
          status: "completed",
          updatedAt: new Date(),
        })
        .where(eq(messages.id, created.assistantMessage.id));
      if (citedChunks.length > 0) {
        await transaction.insert(messageSources).values(
          citedChunks.map((chunk) => ({
            chunkId: chunk.chunkId,
            cosineDistance: chunk.cosineDistance,
            messageId: created.assistantMessage.id,
            rank: chunk.rank,
          })),
        );
      }
      await transaction
        .update(chats)
        .set({ updatedAt: new Date() })
        .where(eq(chats.id, chatId));
    });

    const publicSources = citedChunks.map(toPublicSource);
    emit({ sources: publicSources, type: "sources" });
    emit({
      inputTokens: generation.inputTokens,
      latencyMs: generation.latencyMs,
      model: env.ANSWER_MODEL,
      outputTokens: generation.outputTokens,
      timeToFirstTokenMs: generation.timeToFirstTokenMs,
      type: "usage",
    });
    emit({
      answerability,
      messageId: created.assistantMessage.id,
      type: "done",
    });
  } catch (error) {
    const appError = normalizeQuestionError(error);
    try {
      await db
        .update(messages)
        .set({
          content: answerBuffer,
          generalKnowledge: generalBuffer || null,
          status: "failed",
          updatedAt: new Date(),
        })
        .where(eq(messages.id, created.assistantMessage.id));
    } catch (persistenceError) {
      logger.error(
        {
          chatId,
          err: persistenceError,
          messageId: created.assistantMessage.id,
          requestId,
        },
        "failed answer state could not be persisted",
      );
    }
    throw appError;
  }
}
