import { describe, expect, it } from "vitest";

import type { RetrievedChunk } from "@/server/domain/chat";
import { toPublicSource } from "@/server/retrieval/source";

function source(overrides: Partial<RetrievedChunk>): RetrievedChunk {
  return {
    chunkId: "chunk-1",
    content: "Exact stored excerpt",
    cosineDistance: 0.3,
    documentId: "document-1",
    documentName: "source.txt",
    heading: null,
    metadata: {},
    ordinal: 0,
    pageFrom: null,
    pageTo: null,
    rank: 1,
    ...overrides,
  };
}

describe("source presentation", () => {
  it("uses PDF page ranges when present", () => {
    expect(toPublicSource(source({ pageFrom: 3, pageTo: 4 })).location).toBe(
      "Pages 3–4",
    );
  });

  it("derives TXT paragraph ranges from stored unit metadata", () => {
    const result = toPublicSource(
      source({
        metadata: {
          sourceUnits: [
            { paragraphFrom: 2, paragraphTo: 2 },
            { paragraphFrom: 3, paragraphTo: 4 },
          ],
        },
      }),
    );
    expect(result.location).toBe("Paragraphs 2–4");
    expect(result.excerpt).toBe("Exact stored excerpt");
  });
});
