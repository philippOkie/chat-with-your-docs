import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const documentStatusEnum = pgEnum("document_status", [
  "queued",
  "processing",
  "ready",
  "failed",
]);

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);
export const answerabilityEnum = pgEnum("answerability", [
  "grounded",
  "partial",
  "not_found",
]);
export const messageStatusEnum = pgEnum("message_status", [
  "streaming",
  "completed",
  "failed",
]);
export const llmOperationEnum = pgEnum("llm_operation", [
  "embedding",
  "query_rewrite",
  "answer_generation",
]);
export const operationStatusEnum = pgEnum("operation_status", [
  "succeeded",
  "failed",
]);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    status: documentStatusEnum("status").default("queued").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    pageCount: integer("page_count"),
    tokenCount: integer("token_count"),
    chunkCount: integer("chunk_count"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processed_at", {
      mode: "date",
      withTimezone: true,
    }),
  },
  (table) => [
    uniqueIndex("documents_storage_key_unique").on(table.storageKey),
    index("documents_status_idx").on(table.status),
    index("documents_sha256_idx").on(table.sha256),
  ],
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    tokenCount: integer("token_count").notNull(),
    pageFrom: integer("page_from"),
    pageTo: integer("page_to"),
    heading: text("heading"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
  },
  (table) => [
    uniqueIndex("document_chunks_document_ordinal_unique").on(
      table.documentId,
      table.ordinal,
    ),
    index("document_chunks_document_id_idx").on(table.documentId),
    index("document_chunks_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const chats = pgTable("chats", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const chatDocuments = pgTable(
  "chat_documents",
  {
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.documentId] }),
    index("chat_documents_document_id_idx").on(table.documentId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    generalKnowledge: text("general_knowledge"),
    answerability: answerabilityEnum("answerability"),
    status: messageStatusEnum("status").notNull(),
    originalQuery: text("original_query"),
    rewrittenQuery: text("rewritten_query"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("messages_chat_created_at_idx").on(table.chatId, table.createdAt),
    index("messages_status_idx").on(table.status),
  ],
);

export const messageSources = pgTable(
  "message_sources",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => documentChunks.id, { onDelete: "restrict" }),
    rank: integer("rank").notNull(),
    cosineDistance: real("cosine_distance").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.chunkId] }),
    index("message_sources_chunk_id_idx").on(table.chunkId),
  ],
);

export const llmOperations = pgTable(
  "llm_operations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: text("request_id").notNull(),
    operation: llmOperationEnum("operation").notNull(),
    model: text("model").notNull(),
    chatId: uuid("chat_id").references(() => chats.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    latencyMs: integer("latency_ms").notNull(),
    timeToFirstTokenMs: integer("time_to_first_token_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    status: operationStatusEnum("status").notNull(),
    errorCode: text("error_code"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("llm_operations_request_id_idx").on(table.requestId),
    index("llm_operations_created_at_idx").on(table.createdAt),
    index("llm_operations_document_id_idx").on(table.documentId),
    index("llm_operations_message_id_idx").on(table.messageId),
  ],
);

export type DocumentRecord = typeof documents.$inferSelect;
export type NewDocumentRecord = typeof documents.$inferInsert;
export type DocumentChunkRecord = typeof documentChunks.$inferSelect;
export type ChatRecord = typeof chats.$inferSelect;
export type MessageRecord = typeof messages.$inferSelect;
