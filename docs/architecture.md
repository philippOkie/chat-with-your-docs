# Architecture

The application is a modular TypeScript system with three separately runnable processes: the Next.js web application, the ingestion worker, and PostgreSQL. PostgreSQL also provides pgvector search and the durable pg-boss queue, which keeps the local stack small without merging runtime responsibilities.

## Component view

```mermaid
flowchart TB
    USER[Browser user]

    subgraph WEB[Next.js web process]
        UI[React interface]
        HTTP[Route Handlers<br/>validation and SSE]
        DOCS[Document application service]
        CHAT[Chat orchestrator]
        REWRITE[Follow-up rewrite]
        RETRIEVE[Scoped vector retrieval]
        ANSWER[Structured answer stream]

        UI --> HTTP
        HTTP --> DOCS
        HTTP --> CHAT
        CHAT --> REWRITE --> RETRIEVE --> ANSWER
    end

    subgraph WORKER[Ingestion worker process]
        JOB[pg-boss consumer]
        PARSE[PDF / Markdown / TXT parser]
        CHUNK[Structure-aware chunker]
        EMBED[Embedding batches]

        JOB --> PARSE --> CHUNK --> EMBED
    end

    subgraph INFRA[Shared infrastructure]
        DB[(PostgreSQL<br/>product data + pgvector)]
        QUEUE[(pg-boss tables)]
        FILES[(Local file store)]
        OPENAI[OpenAI APIs<br/>Responses + embeddings]
    end

    USER --> UI
    DOCS --> FILES
    DOCS --> QUEUE
    QUEUE --> JOB
    JOB --> FILES
    EMBED --> OPENAI
    EMBED --> DB
    HTTP --> DB
    REWRITE --> OPENAI
    RETRIEVE --> DB
    RETRIEVE --> OPENAI
    ANSWER --> OPENAI
    ANSWER --> DB
    ANSWER -. typed SSE events .-> UI
```

## Document-ingestion sequence

```mermaid
sequenceDiagram
    actor User
    participant UI as Document library
    participant API as Upload Route Handler
    participant Store as File store
    participant DB as PostgreSQL / pg-boss
    participant Worker as Ingestion worker
    participant OpenAI as Embeddings API

    User->>UI: Upload PDF, Markdown, or TXT
    UI->>API: POST /api/documents
    API->>API: Validate size, MIME, and contents
    API->>Store: Save under generated key
    API->>DB: Create queued document and job
    API-->>UI: 202 Accepted
    DB-->>Worker: Deliver durable job
    Worker->>Store: Read uploaded bytes
    Worker->>Worker: Parse and structure-aware chunk
    Worker->>OpenAI: Embed chunk batches
    OpenAI-->>Worker: 1,536-dimension vectors
    Worker->>DB: Transactionally replace chunks and mark ready
    UI->>API: Poll document state
    API-->>UI: queued / processing / ready / failed
```

## Grounded-answer sequence

```mermaid
sequenceDiagram
    actor User
    participant UI as Chat workspace
    participant API as Message Route Handler
    participant Chat as Chat orchestrator
    participant OpenAI as OpenAI APIs
    participant DB as PostgreSQL + pgvector

    User->>UI: Ask a question
    UI->>API: POST /api/chats/:id/messages
    API->>Chat: Validated question and chat scope
    Chat->>DB: Load recent completed messages
    opt Follow-up question
        Chat->>OpenAI: Rewrite to standalone query
        OpenAI-->>Chat: Search query
    end
    Chat->>OpenAI: Embed query
    OpenAI-->>Chat: Query vector
    Chat->>DB: Cosine search within selected ready documents
    DB-->>Chat: Ranked chunks and distances
    Chat->>Chat: Remove duplicate or overlapping chunks
    Chat->>OpenAI: Structured grounded-answer request
    loop Provider stream
        OpenAI-->>Chat: Partial structured JSON
        Chat-->>UI: Typed status and text SSE events
    end
    Chat->>Chat: Validate and allowlist cited chunk IDs
    Chat->>DB: Persist answer, usage, and source links
    DB-->>Chat: Exact stored excerpts and locations
    Chat-->>UI: Sources, usage, and done events
```

## Boundary responsibilities

| Boundary             | Owns                                                                     | Does not own                                          |
| -------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| React UI             | Upload/chat interaction, selected-source controls, safe answer rendering | Secrets, retrieval, provider calls                    |
| Route Handlers       | HTTP validation, serialization, SSE lifecycle, stable errors             | Parsing, chunking, retrieval policy                   |
| Application services | Use-case ordering, state transitions, retry behavior                     | Framework rendering or raw provider transport details |
| Ingestion worker     | Durable parse, chunk, embed, and persistence pipeline                    | Browser request lifecycle                             |
| PostgreSQL           | Product state, message/source relations, queue delivery, vector search   | Raw file bytes                                        |
| File store           | Uploaded bytes behind generated storage keys                             | User-facing metadata or authorization decisions       |
| OpenAI adapters      | Query rewrite, embeddings, structured answer generation                  | Source-of-truth excerpts or citation authorization    |

The database is the authority for citation text. The model may select only supplied chunk IDs; the server validates those IDs before joining the exact excerpt and location shown to the user.
