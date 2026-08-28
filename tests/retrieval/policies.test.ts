import { describe, expect, it } from "vitest";

import type { RetrievedChunk } from "@/server/domain/chat";
import {
  deduplicateRetrievedChunks,
  validateCitedChunkIds,
} from "@/server/retrieval/policies";

function chunk(chunkId: string, content: string, ordinal = 0): RetrievedChunk {
  return {
    chunkId,
    content,
    cosineDistance: ordinal / 10,
    documentId: "document-1",
    documentName: "source.md",
    heading: null,
    metadata: {},
    ordinal,
    pageFrom: null,
    pageTo: null,
    rank: ordinal + 1,
  };
}

describe("retrieval policies", () => {
  it("removes duplicate adjacent chunks while retaining retrieval rank", () => {
    const first = chunk("chunk-1", "A repeated launch detail", 0);
    const result = deduplicateRetrievedChunks(
      [
        first,
        chunk("chunk-2", "A repeated launch detail", 1),
        chunk("chunk-3", "A distinct support detail", 2),
      ],
      6,
    );

    expect(result.map((item) => item.chunkId)).toEqual(["chunk-1", "chunk-3"]);
    expect(result[0].rank).toBe(first.rank);
  });

  it("drops invented and repeated citation IDs", () => {
    const available = [
      chunk("chunk-1", "Launch detail"),
      chunk("chunk-2", "Support detail", 1),
    ];
    const result = validateCitedChunkIds(
      ["chunk-2", "invented", "chunk-2", "chunk-1"],
      available,
    );

    expect(result.validChunks.map((item) => item.chunkId)).toEqual([
      "chunk-2",
      "chunk-1",
    ]);
    expect(result.invalidIds).toEqual(["invented"]);
  });
});
