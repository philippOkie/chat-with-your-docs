# Implementation log

## 2026-08-28 — Phase 1 foundation

### Implemented

- Initialized the Next.js App Router application with current stable React and TypeScript-compatible tooling.
- Added a PostgreSQL 17 + pgvector Compose service and pinned the pgvector image to `0.8.6`.
- Added the complete initial Drizzle application schema, including a 1,536-dimensional vector column and HNSW cosine index.
- Added a migration service that creates the vector extension before applying Drizzle migrations.
- Added a separate pg-boss worker process and declared the `document.ingest` queue with bounded exponential retries.
- Added environment validation, Pino JSON logging with secret redaction, stable application errors, and a database-aware health endpoint.
- Added an initial responsive product shell and automated code-quality commands.

### Verification

- Formatting, ESLint, TypeScript, Vitest, Drizzle migration consistency, Compose configuration, and the optimized Next.js production build pass.
- Applied the migration to an isolated PostgreSQL instance with pgvector and verified all seven application tables plus the HNSW cosine index.
- Started the worker, verified the `document.ingest` singleton queue and retry policy in pg-boss, and observed a graceful shutdown.
- Started the production web server against that database and received a database-aware `200` health response with a correlation ID.
- The host Docker Desktop daemon was unresponsive, so the full Compose runtime could not be exercised. Compose configuration is valid; the equivalent web, worker, migration, PostgreSQL, and pgvector components were verified directly.

### Small implementation clarifications

- `messages.updated_at` was added to the planned schema. Streaming responses will need durable progress updates and stale-stream recovery; the timestamp makes those updates observable without changing the product behavior.
- `OPENAI_API_KEY` is optional only while booting the Phase 1 foundation. Each model-backed use case will fail fast with a safe configuration error if the key is absent.
- The document file volume is mounted into both web and worker services. Original filenames will never become storage paths; generated storage keys will be implemented in Phase 2.

### Unresolved risks

- Structured Outputs stream serialized JSON deltas rather than semantic field deltas. Before Phase 4, choose and test the server-side partial parsing approach used to emit separate grounded-answer and general-context events.
- Automatic pg-boss retries and user-triggered retries must share one document-scoped idempotency policy. The queue is configured, but enqueue semantics belong in Phase 2.
- Similarity thresholds remain deliberately unset until the manual RAG matrix provides evidence. Retrieval will initially log ranks and cosine distances for tuning.

## 2026-08-28 — Phase 2 document library and ingestion

### Implemented

- Added a responsive `/documents` workspace with multi-file selection, automatic status polling, queued/processing/ready/failed presentation, and retry controls.
- Added `POST` and `GET /api/documents`, `GET /api/documents/:id`, and `POST /api/documents/:id/retry` route handlers with request IDs and stable safe errors.
- Added extension, MIME, size, non-empty, UTF-8, and PDF-signature validation. Raw files use UUID storage keys rather than original filenames.
- Added PDF.js page extraction, Markdown heading paths, and TXT paragraph metadata without logging document contents.
- Added token-aware structural chunking. Pages and headings remain citation boundaries; overlap is used only for forced token-window splits.
- Added batched OpenAI embeddings at the schema-locked 1,536 dimensions and persisted aggregate latency, batch count, and token usage in `llm_operations`.
- Added an idempotent worker that replaces prior chunks transactionally, records safe failure states, skips automatic retry for terminal validation/configuration errors, and uses pg-boss backoff for retryable failures.
- Updated the standalone worker command to load the server-side `.env` file explicitly.

### Verification

- Added upload-validation, TXT/Markdown/PDF parser, and chunking tests. The suite now covers 18 assertions across five files.
- Ran a real Markdown upload through the HTTP endpoint, local storage, pg-boss worker, OpenAI embeddings API, Drizzle transaction, and pgvector.
- Verified the uploaded fixture reached `ready`, produced four searchable chunks, recorded 122 source tokens and 190 embedding input tokens, and stored four vectors with exactly 1,536 dimensions.
- Verified `/documents` renders the ready record and the health endpoint reports both the database and OpenAI configuration as available.
- Production dependency audit reports zero known vulnerabilities. Development-only tooling currently reports four moderate advisories through the full audit.

### Runtime note

- Docker Desktop became reachable but its BuildKit storage returned an input/output error, then the database container command stalled. Development verification therefore uses the installed PostgreSQL + pgvector runtime on port 5432 while web and worker run from the repository. Compose configuration remains the intended one-command workflow once Docker Desktop storage is repaired.

### Next checkpoint

- Phase 3 adds chats, ready-document selection, standalone query rewriting, filtered cosine retrieval, and source metadata persistence. Phase 4 adds structured streaming answers and source cards.
