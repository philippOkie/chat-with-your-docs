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

## 2026-08-28 — Phases 3–4 chats, retrieval, and streaming

### Implemented

- Added conversation creation, recent-chat listing, persisted history, and ready-document source selection with replacement between turns.
- Added standalone follow-up rewriting with at most six recent messages. The first question deliberately skips the extra model call.
- Added query embeddings and one SQL vector query that filters through the chat selection and ready document state before cosine ordering.
- Added top-eight retrieval, exact/strong adjacent overlap removal, and a maximum six-chunk generation context.
- Added a strict structured answer schema for grounded content, outside knowledge, answerability, and cited chunk IDs.
- Added OpenAI Responses streaming with `store: false`. Partial JSON snapshots are decoded into separate answer/general deltas.
- Added typed SSE stages, usage, sources, completion, and safe error events.
- Added citation allowlisting and exact database-backed source cards for PDF pages, Markdown headings, and TXT paragraph ranges.
- Added incomplete-stream persistence and retry UX.

### Verification

- Sent two real questions through HTTP, OpenAI, pgvector, persistence, and the source join. The direct question cited two launch-plan chunks; the conversational follow-up was rewritten and cited Markdown plus TXT evidence.
- Confirmed query rewrite, retrieval, generation latency, TTFT, token usage, ranks, chunk IDs, and cosine distances in structured logs.
- Confirmed no storage key, file hash, prompt, or raw secret is exposed by public chat/document responses.

### Corrections from live review

- The current GPT-5.6 API exposes `none` as its lowest reasoning effort; this is used for the narrow rewrite step in place of the plan's older “minimal” wording.
- A general-context evaluation produced raw chunk IDs in grounded prose. The prompt was tightened to reserve IDs for the structured citation field and source cards.
- The first chat UI rendered safe Markdown as plain text, exposing emphasis markers. A small React-only Markdown subset now renders bold, code, lists, and paragraphs without HTML injection.

## 2026-08-28 — Phase 5 submission polish

### Implemented

- Completed the responsive three-panel conversation workspace, empty states, selection controls, streaming stages, exact expandable sources, labelled general context, keyboard composer, and retry state.
- Added prompt, partial-stream decoding, schema, retrieval-policy, citation-validation, and source-location tests. The suite now contains 30 passing tests across ten files.
- Ran the five required manual RAG cases plus one explicit general-context case and recorded observed output and latency in `docs/manual-evaluation.md`.
- Captured desktop chat, document library, and 354 px responsive screenshots under `docs/screenshots/`.
- Rewrote the README around the actual repository and assignment checklist.
- Added the detailed technical decision record and requirements traceability matrix.

### Remaining production risks

- Query rewriting can drift on ambiguous meta-questions; the observed case should enter an automated rewrite evaluation set.
- Vector-only retrieval and the absence of a distance threshold are conscious baselines, not proven optimal choices.
- A process killed without application cleanup can leave a `streaming` message; production needs expiry/recovery.
- Local filesystem storage, single-user scope, and missing auth/retention/malware controls are demo boundaries.
- Docker Compose remains the intended workflow, but this host's Docker BuildKit storage fault required direct local PostgreSQL/pgvector verification.
