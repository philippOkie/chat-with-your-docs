import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { toPublicDocument } from "@/server/application/documents";
import { db } from "@/server/db/client";
import {
  chatDocuments,
  chats,
  documentChunks,
  documents,
  messages,
  messageSources,
} from "@/server/db/schema";
import { AppError } from "@/server/domain/errors";
import { toPublicSource } from "@/server/retrieval/source";

function uniqueDocumentIds(documentIds: string[]): string[] {
  return [...new Set(documentIds)];
}

async function requireReadyDocuments(documentIds: string[]) {
  const ids = uniqueDocumentIds(documentIds);
  if (ids.length === 0) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Select at least one ready document.",
      statusCode: 400,
    });
  }
  if (ids.length > 12) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Select no more than 12 documents per conversation.",
      statusCode: 400,
    });
  }

  const ready = await db
    .select()
    .from(documents)
    .where(and(inArray(documents.id, ids), eq(documents.status, "ready")));
  if (ready.length !== ids.length) {
    throw new AppError({
      code: "DOCUMENT_NOT_READY",
      message:
        "Every selected document must exist and finish processing before it can be used in a conversation.",
      statusCode: 409,
    });
  }
  return { documents: ready, ids };
}

export async function listChats() {
  const chatRows = await db.select().from(chats).orderBy(desc(chats.updatedAt));
  if (chatRows.length === 0) return [];

  const ids = chatRows.map((chat) => chat.id);
  const [selectionRows, messageRows] = await Promise.all([
    db
      .select({
        chatId: chatDocuments.chatId,
        documentId: documents.id,
        documentName: documents.name,
      })
      .from(chatDocuments)
      .innerJoin(documents, eq(documents.id, chatDocuments.documentId))
      .where(inArray(chatDocuments.chatId, ids)),
    db
      .select({
        chatId: messages.chatId,
        content: messages.content,
        createdAt: messages.createdAt,
        role: messages.role,
      })
      .from(messages)
      .where(inArray(messages.chatId, ids))
      .orderBy(desc(messages.createdAt)),
  ]);

  const latestByChat = new Map<string, (typeof messageRows)[number]>();
  for (const message of messageRows) {
    if (!latestByChat.has(message.chatId))
      latestByChat.set(message.chatId, message);
  }

  return chatRows.map((chat) => ({
    ...chat,
    documents: selectionRows
      .filter((row) => row.chatId === chat.id)
      .map((row) => ({ id: row.documentId, name: row.documentName })),
    lastMessage: latestByChat.get(chat.id) ?? null,
  }));
}

export async function createChat(documentIds: string[]) {
  const selection = await requireReadyDocuments(documentIds);
  return db.transaction(async (transaction) => {
    const [chat] = await transaction
      .insert(chats)
      .values({ title: "New conversation" })
      .returning();
    await transaction
      .insert(chatDocuments)
      .values(
        selection.ids.map((documentId) => ({ chatId: chat.id, documentId })),
      );
    return {
      ...chat,
      documents: selection.documents.map(toPublicDocument),
      messages: [],
    };
  });
}

export async function getChat(chatId: string) {
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

  const [selectedDocuments, messageRows, sourceRows] = await Promise.all([
    db
      .select({ document: documents })
      .from(chatDocuments)
      .innerJoin(documents, eq(documents.id, chatDocuments.documentId))
      .where(eq(chatDocuments.chatId, chatId))
      .orderBy(asc(documents.createdAt)),
    db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.createdAt)),
    db
      .select({
        chunkId: documentChunks.id,
        content: documentChunks.content,
        cosineDistance: messageSources.cosineDistance,
        documentId: documents.id,
        documentName: documents.name,
        heading: documentChunks.heading,
        messageId: messageSources.messageId,
        metadata: documentChunks.metadata,
        ordinal: documentChunks.ordinal,
        pageFrom: documentChunks.pageFrom,
        pageTo: documentChunks.pageTo,
        rank: messageSources.rank,
      })
      .from(messageSources)
      .innerJoin(messages, eq(messages.id, messageSources.messageId))
      .innerJoin(documentChunks, eq(documentChunks.id, messageSources.chunkId))
      .innerJoin(documents, eq(documents.id, documentChunks.documentId))
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messageSources.rank)),
  ]);

  return {
    ...chat,
    documents: selectedDocuments.map((row) => toPublicDocument(row.document)),
    messages: messageRows.map((message) => ({
      ...message,
      sources: sourceRows
        .filter((source) => source.messageId === message.id)
        .map(toPublicSource),
    })),
  };
}

export async function replaceChatDocuments(
  chatId: string,
  documentIds: string[],
) {
  await getChat(chatId);
  const [activeMessage] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.status, "streaming")))
    .limit(1);
  if (activeMessage) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Wait for the current answer before changing sources.",
      statusCode: 409,
    });
  }

  const selection = await requireReadyDocuments(documentIds);
  await db.transaction(async (transaction) => {
    await transaction
      .delete(chatDocuments)
      .where(eq(chatDocuments.chatId, chatId));
    await transaction
      .insert(chatDocuments)
      .values(selection.ids.map((documentId) => ({ chatId, documentId })));
    await transaction
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, chatId));
  });
  return getChat(chatId);
}
