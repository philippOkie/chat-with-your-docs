import { and, eq, inArray } from "drizzle-orm";

import {
  buildEmbeddingInput,
  chunkDocument,
} from "@/server/chunking/chunk-document";
import { env } from "@/server/config/env";
import { db } from "@/server/db/client";
import { documentChunks, documents } from "@/server/db/schema";
import { AppError } from "@/server/domain/errors";
import type { SupportedDocumentMimeType } from "@/server/domain/documents";
import { parseDocument } from "@/server/documents/parsers";
import { readDocumentFile } from "@/server/storage/local-document-storage";
import { logger } from "@/server/telemetry/logger";
import { embedTexts } from "@/server/ai/embed-texts";

function normalizeIngestionError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError({
    cause: error,
    code: "UNEXPECTED_ERROR",
    message: "The document could not be processed. You can retry it.",
    retryable: true,
  });
}

export async function ingestDocument(
  documentId: string,
  requestId: string,
): Promise<void> {
  const startedAt = performance.now();
  const [document] = await db
    .update(documents)
    .set({
      errorCode: null,
      errorMessage: null,
      status: "processing",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documents.id, documentId),
        inArray(documents.status, ["queued", "failed"]),
      ),
    )
    .returning();

  if (!document) {
    logger.info(
      { documentId, requestId },
      "ingestion skipped because document is not queued or failed",
    );
    return;
  }

  try {
    const parseStartedAt = performance.now();
    const bytes = await readDocumentFile(document.storageKey);
    const parsed = await parseDocument(
      document.mimeType as SupportedDocumentMimeType,
      document.name,
      bytes,
    );
    const chunks = chunkDocument(parsed.units, {
      maxTokens: env.CHUNK_MAX_TOKENS,
      minTokens: env.CHUNK_MIN_TOKENS,
      overlapTokens: env.CHUNK_OVERLAP_TOKENS,
    });

    if (chunks.length === 0) {
      throw new AppError({
        code: "PARSING_ERROR",
        message: "The document does not contain enough readable text.",
      });
    }

    const parseDurationMs = Math.round(performance.now() - parseStartedAt);
    const embeddings = await embedTexts({
      documentId,
      requestId,
      texts: chunks.map((chunk) => buildEmbeddingInput(document.name, chunk)),
    });

    if (embeddings.length !== chunks.length) {
      throw new AppError({
        code: "PROVIDER_ERROR",
        message:
          "OpenAI returned an incomplete embedding result. Retry the document.",
        retryable: true,
      });
    }

    const tokenCount = chunks.reduce(
      (total, chunk) => total + chunk.tokenCount,
      0,
    );

    await db.transaction(async (transaction) => {
      await transaction
        .delete(documentChunks)
        .where(eq(documentChunks.documentId, documentId));
      await transaction.insert(documentChunks).values(
        chunks.map((chunk, index) => ({
          content: chunk.content,
          documentId,
          embedding: embeddings[index],
          heading: chunk.heading,
          metadata: chunk.metadata,
          ordinal: chunk.ordinal,
          pageFrom: chunk.pageFrom,
          pageTo: chunk.pageTo,
          tokenCount: chunk.tokenCount,
        })),
      );
      await transaction
        .update(documents)
        .set({
          chunkCount: chunks.length,
          errorCode: null,
          errorMessage: null,
          pageCount: parsed.pageCount,
          processedAt: new Date(),
          status: "ready",
          tokenCount,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));
    });

    logger.info(
      {
        chunkCount: chunks.length,
        documentId,
        durationMs: Math.round(performance.now() - startedAt),
        pageCount: parsed.pageCount,
        parseDurationMs,
        requestId,
        tokenCount,
      },
      "document ingestion completed",
    );
  } catch (error) {
    const appError = normalizeIngestionError(error);
    await db
      .update(documents)
      .set({
        errorCode: appError.code,
        errorMessage: appError.message,
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    logger.error(
      {
        code: appError.code,
        documentId,
        durationMs: Math.round(performance.now() - startedAt),
        errorName: appError.name,
        requestId,
        retryable: appError.retryable,
      },
      "document ingestion failed",
    );

    throw appError;
  }
}
