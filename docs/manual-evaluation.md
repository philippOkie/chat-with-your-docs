# Manual RAG evaluation

Evaluation date: 28 August 2026. Corpus: `demo-launch-plan.md` plus `demo-support-notes.txt`, both ingested through the real worker and OpenAI embedding path. The questions were sent through the HTTP SSE route against PostgreSQL/pgvector and the configured OpenAI models.

These cases are smoke evidence, not a statistically meaningful quality score.

| Case                     | Question                                                                                                                   | Expected behavior                                                             | Observed result                                                                                                                                                                                    | Evidence / timing                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Direct fact + synthesis  | “When does the Atlas pilot begin, and what happens before stage two?”                                                      | Combine the launch and rollout sections; cite both.                           | `grounded`; correctly answered 14 October, design-partner stage, and seven-day <2% error-budget gate.                                                                                              | 2 exact Markdown excerpts; generation 4,517 ms; visible token 3,219 ms.                         |
| Conversational follow-up | “And what support hours apply during it?”                                                                                  | Resolve “it” to the Atlas pilot and retrieve support coverage.                | Rewritten to “What support hours apply during the Atlas pilot’s stage-one design-partner cohort before stage two?”; `grounded`; answered 08:00–20:00 UTC weekdays, escalation lead, and P1 target. | Markdown support section + TXT paragraphs 1–3; generation 1,498 ms; visible token 878 ms.       |
| Partial evidence         | “What is the pilot start date, and who is the executive sponsor?”                                                          | Give the supported date and explicitly state that sponsor evidence is absent. | `partial`; answered 14 October and said the supplied documents do not identify an executive sponsor.                                                                                               | 1 exact launch excerpt; generation 2,157 ms; visible token 1,604 ms.                            |
| Not answered             | “Which cloud provider should host Atlas, and why?”                                                                         | Do not invent a document-grounded provider choice.                            | `not_found`; no sources were emitted; persisted fallback explains that selected documents do not provide enough support.                                                                           | 0 sources; generation 1,056 ms; no grounded/general visible token.                              |
| Explicit general context | “The documents may not cover this: using clearly labelled general knowledge, what cloud hosting approach could fit Atlas?” | Separate the limited document facts from outside deployment advice.           | `partial`; grounded field states what the documents establish; a separate general field proposes a managed-cloud approach.                                                                         | 2 document excerpts plus labelled general context; generation 5,252 ms; visible token 1,535 ms. |

## Additional observed edge case

The ambiguous follow-up “what can you do” was rewritten toward the preceding support topic. The answer remained grounded, but this is evidence that rewriting needs its own evaluation set and probably an instruction to preserve meta-questions rather than force topical resolution.

One early general-context response also placed raw chunk IDs in the answer prose. Source cards were still validated correctly, but the presentation was poor. The generation prompt was changed to prohibit inline chunk IDs, bracketed citations, and source markers; citations now belong exclusively to the structured ID field and database-backed cards.

## What should become automated

1. Freeze these fixtures and expected source IDs in a credentialed evaluation job.
2. Score retrieval recall separately from answer faithfulness.
3. Add cases for exact identifiers, negation, conflicting documents, prompt injection, and source-selection isolation.
4. Compare raw follow-up embedding against rewrite output to catch drift.
5. Run the set for every change to prompt, model, dimensions, chunking, top-k, or deduplication.
