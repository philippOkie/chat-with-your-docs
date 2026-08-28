import { and, cosineDistance, eq } from "drizzle-orm";

import { env } from "@/server/config/env";
import { db } from "@/server/db/client";
import { chatDocuments, documentChunks, documents } from "@/server/db/schema";
import type { RetrievedChunk } from "@/server/domain/chat";
import { logger } from "@/server/telemetry/logger";

import { deduplicateRetrievedChunks } from "./policies";

export async function retrieveChunks(
  chatId: string,
  embedding: number[],
  requestId: string,
): Promise<RetrievedChunk[]> {
  const startedAt = performance.now();
  const distance = cosineDistance(documentChunks.embedding, embedding);
  const rows = await db
    .select({
      chunkId: documentChunks.id,
      content: documentChunks.content,
      cosineDistance: distance,
      documentId: documentChunks.documentId,
      documentName: documents.name,
      heading: documentChunks.heading,
      metadata: documentChunks.metadata,
      ordinal: documentChunks.ordinal,
      pageFrom: documentChunks.pageFrom,
      pageTo: documentChunks.pageTo,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documents.id, documentChunks.documentId))
    .innerJoin(
      chatDocuments,
      and(
        eq(chatDocuments.documentId, documentChunks.documentId),
        eq(chatDocuments.chatId, chatId),
      ),
    )
    .where(eq(documents.status, "ready"))
    .orderBy(distance)
    .limit(env.RETRIEVAL_TOP_K);

  const ranked: RetrievedChunk[] = rows.map((row, index) => ({
    ...row,
    cosineDistance: Number(row.cosineDistance),
    rank: index + 1,
  }));
  const selected = deduplicateRetrievedChunks(
    ranked,
    env.GENERATION_MAX_CHUNKS,
  );

  logger.info(
    {
      chatId,
      chunkIds: selected.map((chunk) => chunk.chunkId),
      cosineDistances: selected.map((chunk) => chunk.cosineDistance),
      durationMs: Math.round(performance.now() - startedAt),
      ranks: selected.map((chunk) => chunk.rank),
      requestId,
      resultCount: selected.length,
    },
    "retrieval completed",
  );

  return selected;
}
