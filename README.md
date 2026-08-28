# Chat With Your Docs

A full-stack document question-answering application built around a reusable document library, conversation-scoped retrieval, streamed answers, and inspectable source excerpts.

The repository is currently at **Phase 2: Document library and ingestion**. It contains the application foundation plus validated PDF, TXT, and Markdown uploads, durable background processing, structure-aware chunking, batched OpenAI embeddings, pgvector persistence, live status updates, and safe retries. Chats and grounded answer streaming are the next implementation phases.

## Stack

- Next.js App Router with TypeScript
- PostgreSQL 17 with pgvector
- Drizzle ORM and migrations
- pg-boss for durable background jobs
- OpenAI SDK and `text-embedding-3-small` embeddings
- Pino structured logging
- Vitest, ESLint, and Prettier

## Quick start

Prerequisites: Docker Desktop with Compose v2.

```bash
cp .env.example .env
docker compose up --build
```

The web application is available at [http://localhost:3000](http://localhost:3000). Open the document library at [http://localhost:3000/documents](http://localhost:3000/documents). The database and OpenAI configuration health endpoint is [http://localhost:3000/api/health](http://localhost:3000/api/health).

The Compose stack starts three long-running services and one migration job:

- `web`: Next.js development server
- `worker`: pg-boss worker process
- `db`: PostgreSQL with pgvector
- `migrate`: runs the application migrations before web and worker start

Stop the stack with:

```bash
docker compose down
```

## Local development

```bash
npm install
docker compose up -d db
npm run db:migrate
npm run dev
```

Run `npm run worker:dev` in a second terminal. The worker loads `.env`, watches for changes, and processes queued documents.

Useful checks:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## Configuration

Copy `.env.example` to `.env`. The web application can boot without an OpenAI key, but document ingestion requires a server-side `OPENAI_API_KEY`. A missing or rejected key produces a safe failed-document state with a retry action; it is never exposed to the browser.

The locked model defaults are:

- Answers: `gpt-5.6-terra`
- Query rewriting: `gpt-5.6-luna`
- Embeddings: `text-embedding-3-small` at 1,536 dimensions

## Architecture

```text
Next.js UI and route handlers
    -> application services
        -> domain policies and ports
            -> PostgreSQL/Drizzle, pg-boss, file storage, OpenAI

PostgreSQL + pgvector <- web
PostgreSQL + pgvector <- worker
shared file volume    <- web + worker
```

Framework code will remain thin: route handlers validate HTTP boundaries, application services coordinate use cases, and adapters own external systems.

## Document ingestion

`POST /api/documents` accepts one multipart `file` and returns `202 Accepted`. The route verifies size, extension, MIME type, PDF signature or UTF-8 text, stores the raw file under a generated UUID key, creates a queued document, and publishes a document-scoped pg-boss job.

The worker performs this idempotent pipeline:

1. Transition `queued` or `failed` to `processing`.
2. Extract page-aware PDF text, heading-aware Markdown sections, or TXT paragraphs.
3. Build chunks with an 800-token maximum and overlap only for forced splits.
4. Embed chunks in configurable batches using `text-embedding-3-small`.
5. Replace existing chunks in one transaction and mark the document `ready`.

The library polls `GET /api/documents` for live status changes. Failed documents can be requeued through `POST /api/documents/:id/retry`.

## Current scope

Implemented:

- Responsive application shell and health endpoint
- Complete initial application schema and vector index
- Idempotent migration runner
- Database-backed worker bootstrap and ingestion queue declaration
- Shared local storage volume
- Environment validation and privacy-conscious JSON logs
- Unit-test, formatting, linting, and type-check foundations
- PDF, TXT, and Markdown upload and parsing
- Structure-aware chunking and batched embeddings
- Document library processing states and retries

Next:

- Chat creation and per-chat ready-document selection
- Query rewriting and document-filtered vector retrieval
- Answer generation, streaming, labelled general context, and exact source cards

See [docs/implementation-log.md](docs/implementation-log.md) for implementation decisions and unresolved risks.
