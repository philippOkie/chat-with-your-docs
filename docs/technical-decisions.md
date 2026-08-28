# Technical decision record

This document captures the decisions actually represented by the repository. Each entry records the reason, the main alternative, and the cost accepted; it is not a list of technologies after the fact.

See [architecture.md](architecture.md) for the component diagram and end-to-end request sequences that these decisions produce.

## 1. One TypeScript codebase, separate runtime responsibilities

**Decision:** Next.js App Router owns the UI and HTTP surface, while a separate Node process imports the same server modules for ingestion work.

**Why:** A take-home benefits from one dependency graph and shared types, but document processing must not hold an upload request open. Web and worker can still scale separately because they are different processes.

**Alternative:** Separate frontend and backend repositories would make service ownership explicit but add deployment, versioning, and contract overhead without improving this single-user demo.

**Accepted cost:** The server directory needs discipline so framework, application, and adapter responsibilities do not collapse into route files.

## 2. PostgreSQL is both product database and vector store

**Decision:** Store documents, chats, messages, job data, chunks, and 1,536-dimension embeddings in PostgreSQL with pgvector and an HNSW cosine index.

**Why:** Relational filters are central to correctness: retrieval must join through `chat_documents` and ready documents before ordering chunks. Keeping filters and vectors in one query avoids cross-system consistency and another production dependency.

**Alternatives:** Pinecone, Weaviate, or another dedicated vector database could improve managed scaling features. They are unjustified at this corpus size. A PostgreSQL full-text/vector hybrid is the first retrieval experiment once an evaluation set exists.

**Accepted cost:** HNSW memory, index parameters, vacuum behavior, and query latency need measurement as the corpus grows.

## 3. Drizzle instead of a generic repository layer

**Decision:** Use Drizzle ORM directly in application/infrastructure modules, including vector operators and explicit joins.

**Why:** The important query is SQL-shaped. Drizzle keeps it readable and typed without hiding pgvector behavior. Database transactions remain visible around idempotent ingestion and message/source persistence.

**Alternative:** Handwritten SQL gives maximum control; Prisma offers a broader high-level API. Drizzle provided the clearest balance for this schema.

**Accepted cost:** Some database logic is coupled to PostgreSQL semantics, intentionally.

## 4. PostgreSQL-backed background jobs with pg-boss

**Decision:** Queue document ingestion in pg-boss with limited retries, backoff, a document singleton key, and application-level status.

**Why:** Uploads return quickly, work survives web restarts, and no Redis service is required. The document row remains the user-facing source of truth while pg-boss owns delivery mechanics.

**Alternatives:** Synchronous parsing is simpler but fragile for PDFs and model latency. BullMQ adds Redis. A cloud queue is appropriate only with the production deployment.

**Accepted cost:** Queue load competes with application load in the same database and should be isolated or capacity-planned at scale.

## 5. Local filesystem storage for the demo

**Decision:** Store uploaded bytes under generated keys in a shared mounted directory.

**Why:** It keeps local setup understandable and demonstrates the storage boundary without needing cloud credentials.

**Alternative:** S3-style object storage with presigned uploads is the production choice.

**Accepted cost:** Local storage is not horizontally scalable and has no built-in retention, malware scan, versioning, or regional policy.

## 6. Strict, structure-preserving ingestion

**Decision:** Support PDF, Markdown, and UTF-8 TXT only. PDF units retain pages, Markdown units retain heading paths, and TXT units retain paragraph ranges.

**Why:** Source location is part of product trust. Preserving structure before chunking makes excerpts understandable and avoids reconstructing citations later.

**Alternative:** A generic text extractor supports more formats quickly but loses predictable structure. OCR is deliberately deferred because it introduces a separate accuracy and cost surface.

**Accepted cost:** Office documents, scanned PDFs, tables, and images are outside current scope.

## 7. Natural-boundary chunking with forced-split overlap only

**Decision:** Combine compatible natural units up to 800 tokens, merge tiny compatible units, and use 120-token overlap only when an oversized unit must be windowed.

**Why:** Blind fixed windows duplicate unrelated material and weaken heading/page citations. Overlap is useful across an artificial split but harmful across unrelated sections.

**Alternatives:** Semantic chunking could improve some documents but adds a model call and harder reproducibility. Fixed character windows are simpler but ignore model token budgets.

**Accepted cost:** A page or heading boundary can create smaller chunks. Evaluation, not aesthetic uniformity, should decide whether to change that.

## 8. One embedding model and normalized embedding input

**Decision:** Embed filename, optional location, and content using `text-embedding-3-small` at 1,536 dimensions. Store the original content separately for display.

**Why:** The filename/heading can improve semantic disambiguation while the exact excerpt remains untouched. The model is a cost-effective baseline and its dimensions match the committed vector column.

**Alternative:** A larger embedding model could improve retrieval, but changing models requires re-embedding the corpus and comparative evaluation.

**Accepted cost:** The embedding schema and migration are dimension-specific.

## 9. Conversation-scoped vector-only retrieval

**Decision:** Embed a standalone query, inner-join chunks through the current chat's selected documents, require `ready`, order by cosine distance, take eight, remove exact/strong adjacent overlap, and pass at most six.

**Why:** The selection join is a correctness boundary, not a UI preference. Vector-only retrieval is a measurable baseline. Top-eight/max-six balances recall and generation context on the demo corpus.

**Alternatives:** BM25 hybrid search and reranking are promising, but adding them without a failure set would optimize by intuition.

**Accepted cost:** Exact identifiers and rare keywords may be weaker than hybrid retrieval. No universal distance threshold is claimed.

## 10. Rewrite follow-ups, skip the first question

**Decision:** The first user question is already standalone. Later questions use at most six recent completed messages and `gpt-5.6-luna` at the lowest current reasoning effort.

**Why:** Pronouns and phrases such as “during it” retrieve poorly without context. A small model keeps this frequent pre-retrieval step economical.

**Alternative:** Embed the whole transcript or let the answer model search it. Both increase noise and cost.

**Accepted cost:** Rewriting can drift. The manual “what can you do” case inherited the previous support topic, which is now a concrete future evaluation case.

## 11. Structured OpenAI Responses with storage disabled

**Decision:** Use the Responses API with `store: false`, `gpt-5.6-terra`, low reasoning, and a strict Zod-derived answer format.

**Why:** The schema makes grounded answer, outside knowledge, answerability, and cited IDs independently enforceable. Disabling provider-side response storage is the safer document default.

**Alternative:** Plain free-form Markdown is easier to stream but makes citations and knowledge separation heuristic.

**Accepted cost:** The streamed provider text is JSON. The server incrementally decodes partial JSON before emitting typed UI events.

## 12. Typed SSE from a Next.js Route Handler

**Decision:** Translate provider events into `status`, `answer.delta`, `general.delta`, `sources`, `usage`, `done`, and `error` server-sent events.

**Why:** The browser receives early progress and visible text without exposing provider event shapes. Exact sources can be delayed until the final structured result is validated.

**Alternative:** Polling is easy but gives poor perceived latency. WebSockets are unnecessary for a request/response stream.

**Accepted cost:** Once streaming starts, HTTP status cannot change. Mid-stream failures are represented as typed events and persisted failed state.

## 13. Persist partial output on interruption

**Decision:** Create a streaming assistant row before generation. On failure or cancellation, keep received grounded/general text, mark it `failed`, and expose retry.

**Why:** Losing a partially useful answer is frustrating and makes failures harder to inspect.

**Alternative:** Persist only completed messages, which simplifies history but hides interruption state.

**Accepted cost:** A process killed without cleanup can leave `streaming` rows. A production recovery job should expire them.

## 14. The model selects IDs; the database supplies citations

**Decision:** Allowlist and deduplicate `citedChunkIds`, persist only valid message/chunk links, then join document name, location, distance, and exact content from stored rows.

**Why:** Evidence text written by the model is not trustworthy enough for a source-inspection product.

**Alternative:** Ask the model to quote/cite inline. The live evaluation demonstrated why presentation and evidence should remain separate when raw IDs appeared in prose.

**Accepted cost:** The prompt and UI need a second citation presentation layer.

## 15. Grounded and general knowledge are separate fields and surfaces

**Decision:** Grounded claims may use only retrieved source data. Optional outside knowledge has its own schema field, database column, stream event, and visually labelled UI block.

**Why:** A helpful answer should not silently present model knowledge as document evidence.

**Alternative:** Forbid general knowledge entirely. That is safer but less useful for explicit requests such as productionization advice.

**Accepted cost:** Model classification is still probabilistic; evaluation and feedback are required.

## 16. Safe Markdown subset instead of HTML rendering

**Decision:** Render paragraphs, line breaks, bullet lists, bold, and inline code as React nodes. Never inject model or uploaded HTML.

**Why:** It provides readable answers with a small, auditable XSS surface.

**Alternative:** A full Markdown parser with sanitization supports more syntax but adds dependency and configuration surface beyond current answers.

**Accepted cost:** Tables, links, nested lists, and full CommonMark are not rendered.

## 17. Operational metadata, not content, in logs

**Decision:** Use request/chat/message/document IDs, stage latency, TTFT, token usage, batch counts, chunk IDs, ranks, distances, and stable error codes. Exclude API keys, authorization, raw files, chunks, prompts, and complete questions.

**Why:** Retrieval needs diagnosis, but source material may be confidential.

**Alternative:** Full prompt logging accelerates debugging but creates a new sensitive-data store.

**Accepted cost:** Content-specific incidents require controlled reproduction rather than ordinary log inspection.

## 18. Layered verification instead of inflated coverage claims

**Decision:** Combine deterministic unit tests, committed parser/chunker fixtures, type/lint/build gates, real database/model smoke tests, and browser visual checks. Describe the five-case manual RAG matrix as qualitative.

**Why:** Model quality cannot be proven by line coverage or five examples. The current layers catch code regressions and provide honest integration evidence.

**Alternative:** A large mocked end-to-end suite would be deterministic but would not validate provider/model behavior. A true evaluation harness is the highest-priority extension.

**Accepted cost:** Current CI does not independently reproduce the live OpenAI evaluation without credentials and a database.

## 19. Make cache identity and invalidation explicit before adding caching

**Decision:** The demo does not add a generic application cache. Production caching should be introduced in layers: edge caching for immutable assets, content-hash reuse for parsing and document embeddings, then tenant-scoped query-embedding and retrieval caches keyed by the selected document versions and model configuration. Final-answer caching remains optional and requires an identical authorized source snapshot.

**Why:** Documents and answers can be confidential and mutable. A cache that omits tenant, document-version, model, or chunking identity can return stale results or, worse, data from the wrong authorization scope. The invalidation contract matters more than adding Redis early.

**Alternative:** Put Redis in front of the main endpoints immediately. That may improve repeated-request latency, but it adds another service and hides invalidation/privacy risks before the single-user demo has measured cache demand.

**Accepted cost:** Repeated questions currently repeat query-embedding, retrieval, and answer-generation work. Production load tests should measure those costs and establish TTLs, size limits, encryption, and hit-rate targets before enabling shared caches.
