# Assignment requirements traceability

The attached assignment asks for Option 1, “Chat With Your Docs,” plus evidence of engineering judgment. This matrix maps each requested submission item to the implemented artifact.

| Assignment requirement                       | Implementation evidence                                                                             | Status                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------- |
| GitHub repository with code                  | Repository configured for `philippOkie/chat-with-your-docs`                                         | Complete                     |
| Working document-based conversational AI     | `/documents`, `/chats`, ingestion worker, pgvector retrieval, Responses streaming                   | Complete                     |
| Simple, well-designed interface              | Responsive library and three-panel chat workspace with empty/loading/error/retry states             | Complete                     |
| Quick setup                                  | README Quick start, local development, configuration, and checks                                    | Complete                     |
| Architecture overview / diagram              | README Mermaid diagram and process/boundary explanation                                             | Complete                     |
| Productionization and hyperscaler deployment | README AWS reference architecture and ordered application changes                                   | Complete                     |
| LLM choice and alternatives                  | README RAG table and technical decision 11                                                          | Complete                     |
| Embedding choice and alternatives            | README RAG table and technical decision 8                                                           | Complete                     |
| Vector database choice and alternatives      | README RAG table and technical decision 2                                                           | Complete                     |
| Orchestration framework decision             | Direct typed pipeline, with no-framework rationale in README and decision 1                         | Complete                     |
| Prompt and context management                | Six-message rewrite, untrusted source delimiters, structured output, top-six context                | Complete                     |
| Guardrails                                   | Upload allowlists, path containment, `store:false`, citation allowlist, safe rendering, safe errors | Complete                     |
| Quality controls                             | 30 deterministic tests, real integration run, five-case manual matrix                               | Complete for take-home scope |
| Observability                                | Pino correlation logs and `llm_operations` latency/token/error records                              | Complete                     |
| Key technical decisions and why              | `docs/technical-decisions.md`                                                                       | Complete                     |
| Engineering standards followed/skipped       | README standards and deliberately-not-implemented sections                                          | Complete                     |
| AI-assisted development approach             | README candid workflow, corrections, and do/don't rule                                              | Complete                     |
| What would be done with more time            | README prioritized next steps based on observed risk                                                | Complete                     |
| Screenshots                                  | `docs/screenshots/` and README walkthrough                                                          | Complete                     |
| Optional video                               | Not recorded                                                                                        | Deliberately skipped         |

## Reviewer path

1. Run the stack and open `/documents`.
2. Upload the fixtures in `tests/fixtures/` and wait for `Ready`.
3. Open `/chats`, select one or both fixtures, and ask the five questions in `docs/manual-evaluation.md`.
4. Expand source cards and compare their excerpts with the fixture files.
5. Run `npm run check` and `npm run build`.
6. Read `docs/technical-decisions.md` for tradeoffs and the README productionization/AI-use sections for the remaining rubric.
