import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { env } from "@/server/config/env";
import { db } from "@/server/db/client";
import { documents } from "@/server/db/schema";
import type { DocumentRecord } from "@/server/db/schema";
import { AppError } from "@/server/domain/errors";
import { enqueueDocumentIngestion } from "@/server/jobs/document-ingestion";
import {
  deleteDocumentFile,
  writeDocumentFile,
} from "@/server/storage/local-document-storage";
import { logger } from "@/server/telemetry/logger";
import { validateDocumentUpload } from "@/server/documents/upload-validation";

export async function listDocuments() {
  return db.select().from(documents).orderBy(desc(documents.createdAt));
}

export function toPublicDocument(document: DocumentRecord) {
  return {
    chunkCount: document.chunkCount,
    createdAt: document.createdAt,
    errorCode: document.errorCode,
    errorMessage: document.errorMessage,
    id: document.id,
    mimeType: document.mimeType,
    name: document.name,
    pageCount: document.pageCount,
    processedAt: document.processedAt,
    sizeBytes: document.sizeBytes,
    status: document.status,
    tokenCount: document.tokenCount,
    updatedAt: document.updatedAt,
  };
}

export async function getDocument(documentId: string) {
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Document not found.",
      statusCode: 404,
    });
  }

  return document;
}

export async function createDocumentFromFile(file: File, requestId: string) {
  const startedAt = performance.now();
  const bytes = Buffer.from(await file.arrayBuffer());
  const upload = validateDocumentUpload(
    {
      bytes,
      name: file.name,
      sizeBytes: file.size,
      type: file.type,
    },
    env.MAX_UPLOAD_BYTES,
  );
  const storageKey = `${randomUUID()}${upload.extension}`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  await writeDocumentFile(storageKey, bytes);

  try {
    const [document] = await db
      .insert(documents)
      .values({
        mimeType: upload.mimeType,
        name: upload.name,
        sha256,
        sizeBytes: upload.sizeBytes,
        storageKey,
      })
      .returning();

    try {
      await enqueueDocumentIngestion({ documentId: document.id, requestId });
    } catch (error) {
      await db
        .update(documents)
        .set({
          errorCode: "QUEUE_ERROR",
          errorMessage:
            "The document was stored but could not be queued. Retry it shortly.",
          status: "failed",
          updatedAt: new Date(),
        })
        .where(eq(documents.id, document.id));

      throw new AppError({
        cause: error,
        code: "QUEUE_ERROR",
        message: "The document could not be queued. Retry it shortly.",
        retryable: true,
        statusCode: 503,
      });
    }

    logger.info(
      {
        documentId: document.id,
        durationMs: Math.round(performance.now() - startedAt),
        mimeType: document.mimeType,
        requestId,
        sizeBytes: document.sizeBytes,
      },
      "document upload stored and queued",
    );

    return document;
  } catch (error) {
    if (error instanceof AppError && error.code === "QUEUE_ERROR") throw error;
    await deleteDocumentFile(storageKey);
    throw error;
  }
}

export async function retryDocument(documentId: string, requestId: string) {
  const [document] = await db
    .update(documents)
    .set({
      errorCode: null,
      errorMessage: null,
      status: "queued",
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, documentId), eq(documents.status, "failed")))
    .returning();

  if (!document) {
    const existing = await getDocument(documentId);
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: `Only failed documents can be retried. This document is ${existing.status}.`,
      statusCode: 409,
    });
  }

  try {
    await enqueueDocumentIngestion({ documentId, requestId });
  } catch (error) {
    await db
      .update(documents)
      .set({
        errorCode: "QUEUE_ERROR",
        errorMessage:
          "The retry could not be queued. Please try again shortly.",
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));
    throw new AppError({
      cause: error,
      code: "QUEUE_ERROR",
      message: "The retry could not be queued. Please try again shortly.",
      retryable: true,
      statusCode: 503,
    });
  }

  return document;
}
