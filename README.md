# Chat With Your Docs

A full-stack document question-answering application built around a reusable document library, conversation-scoped retrieval, streamed answers, and inspectable source excerpts.

The repository is currently at **Phase 1: Foundation**. It contains the application shell, PostgreSQL and pgvector schema, Drizzle migrations, pg-boss worker bootstrap, validated configuration, structured logging, and local Docker workflow. Document ingestion and chat features are the next implementation phases.

## Stack

- Next.js App Router with TypeScript
- PostgreSQL 17 with pgvector
- Drizzle ORM and migrations
- pg-boss for durable background jobs
- OpenAI Responses API and embeddings (integration begins in Phase 2)
- Pino structured logging
- Vitest, ESLint, and Prettier

## Quick start

Prerequisites: Docker Desktop with Compose v2.

```bash
cp .env.example .env
docker compose up --build
```

The web application is available at [http://localhost:3000](http://localhost:3000). Its database-aware health endpoint is [http://localhost:3000/api/health](http://localhost:3000/api/health).

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

Run `npm run worker:dev` in a second terminal when working on background ingestion.

Useful checks:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## Configuration

Copy `.env.example` to `.env`. The OpenAI API key is optional during Phase 1 so the local foundation can boot without making provider requests. It will be required at the model-call boundary when ingestion and chat are implemented.

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

## Current scope

Implemented:

- Responsive application shell and health endpoint
- Complete initial application schema and vector index
- Idempotent migration runner
- Database-backed worker bootstrap and ingestion queue declaration
- Shared local storage volume
- Environment validation and privacy-conscious JSON logs
- Unit-test, formatting, linting, and type-check foundations

Next:

- PDF, TXT, and Markdown upload and parsing
- Structure-aware chunking and batched embeddings
- Document library processing states and retries
- Chat creation, filtered retrieval, answer generation, streaming, and sources

See [docs/implementation-log.md](docs/implementation-log.md) for implementation decisions and unresolved risks.
