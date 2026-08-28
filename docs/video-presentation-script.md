# Video presentation script

This script is designed for a natural five-minute walkthrough. The bracketed lines are screen directions, not spoken text.

## 0:00–0:30 — Introduction

**On screen:** Home page, then briefly show the document library.

**Say:**

Hi, I’m Philipp, and this is Chat With Your Docs. I chose the classic RAG option because I wanted to focus on the engineering details that make document question-answering trustworthy: asynchronous ingestion, retrieval scope, grounded answers, inspectable citations, failure handling, and observability—not only the final model response.

The application supports PDF, Markdown, and text documents. A user can build a reusable document library, select which documents are available to a conversation, and ask follow-up questions against only that evidence.

## 0:30–1:20 — Document ingestion

**On screen:** Open the document library. Show a ready document and, if practical, upload a small file.

**Say:**

Uploads are validated at the HTTP boundary and return immediately in a queued state. A separate pg-boss worker reads the file, preserves useful structure such as PDF pages, Markdown heading paths, or text paragraph ranges, and then creates token-bounded chunks. I use overlap only when a large natural section must be split, rather than blindly overlapping every chunk.

The worker generates embeddings with text-embedding-3-small and writes the chunks and their vectors transactionally to PostgreSQL with pgvector. The job is idempotent, so retrying replaces prior chunks instead of duplicating them. The UI exposes queued, processing, ready, and failed states, including a safe retry action.

## 1:20–2:25 — Grounded conversation

**On screen:** Open a conversation, select a document, and ask a factual question. Expand one or two source cards.

**Say:**

In the chat workspace, retrieval is always scoped to the ready documents explicitly selected for this conversation. The first question is searched directly. Follow-up questions use recent conversation history to create a standalone search query, which helps with references such as “during it” without sending an unlimited transcript.

The query is embedded, PostgreSQL performs cosine search, overlapping results are removed, and a bounded set of chunks is sent to the answer model. The answer streams back through typed server-sent events so the UI can show progress and partial text.

The important trust decision is that the model never writes the source cards. It can select only chunk IDs that were supplied in the prompt. The server validates those IDs and joins the exact stored excerpt and location from the database. If the documents contain only part of an answer, the UI says partially grounded. If the evidence is insufficient, it says not found. Any requested general knowledge appears in a separately labelled section.

## 2:25–3:20 — Architecture and engineering choices

**On screen:** Show the architecture diagram in the README or `docs/architecture.md`.

**Say:**

The repository is one TypeScript codebase with three runtime responsibilities: a Next.js web process, an independently runnable ingestion worker, and PostgreSQL. PostgreSQL stores the application data, pg-boss jobs, and pgvector embeddings. This keeps local setup small while still allowing the web and worker processes to scale separately.

I deliberately avoided a general RAG orchestration framework. The pipeline is compact, and direct typed modules make the rewrite, retrieval, citation, persistence, and streaming decisions easier to inspect and test. OpenAI calls use structured outputs and provider-side response storage is disabled.

The project includes strict TypeScript, Zod boundary validation, stable user-safe errors, structured logs, database migrations, Docker Compose, and thirty automated tests across ten files. I also ran a real five-case evaluation covering direct evidence, follow-ups, partial evidence, missing evidence, and clearly labelled general context.

## 3:20–4:20 — Production readiness and trade-offs

**On screen:** Show the productionization section in the README.

**Say:**

I consider this complete for the take-home, but not production-ready yet. The clearest missing infrastructure piece is S3. Files currently use a local shared volume. My first AWS change would move them to private S3 with presigned uploads, encryption, tenant-aware object keys, malware scanning, lifecycle rules, and reliable deletion. The web and worker containers could then scale independently on ECS or Fargate, with PostgreSQL and pgvector on RDS.

Caching is another deliberate gap. I would not put a generic cache in front of sensitive document answers. I would first reuse parsing and embeddings by content hash, then add tenant-scoped query-embedding and retrieval caches keyed by the selected document versions and model configuration. Answer caching would require an identical authorized source snapshot and a short TTL. ElastiCache could provide the shared cache once load testing shows the benefit.

Other production work includes authentication and tenant isolation, audit and retention controls, provider timeouts and backpressure, recovery for abandoned streams, a larger RAG evaluation set, and load testing.

## 4:20–5:00 — AI-assisted process and closing

**On screen:** Return to the working chat and source cards.

**Say:**

I used Codex to accelerate scaffolding, implementation, tests, documentation, and browser checks, but the product direction and main architecture and model choices were planned before implementation. I reviewed changes through typed boundaries, diffs, automated checks, primary documentation, and real end-to-end behavior.

That review found and corrected real issues, including a worker that initially missed its environment file, raw citation identifiers appearing in generated prose, Markdown presentation, an ambiguous query-rewrite case, and a responsive sidebar overflow.

The result is a small but complete RAG product with inspectable evidence and clear boundaries. With more time, I would prioritize the evaluation harness, S3, tenant isolation, and measured caching before adding more model or retrieval complexity. Thanks for watching.

## Recording checklist

- Keep the browser zoom at 100% and hide unrelated tabs or notifications.
- Use one short ready document so the upload and answer flow remains easy to follow.
- Expand at least one source card to prove that the excerpt and location are inspectable.
- Briefly show the architecture diagram, tests, and productionization section.
- Speak naturally rather than reading every sentence exactly; the script is a structure for your own explanation.
- Avoid displaying `.env`, API keys, raw logs, or other credentials.
