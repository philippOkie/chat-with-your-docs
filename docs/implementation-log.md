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
