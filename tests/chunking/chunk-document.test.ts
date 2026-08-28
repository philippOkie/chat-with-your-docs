import { encode } from "gpt-tokenizer";
import { describe, expect, it } from "vitest";

import { chunkDocument } from "@/server/chunking/chunk-document";

describe("chunkDocument", () => {
  it("does not combine unrelated headings", () => {
    const chunks = chunkDocument(
      [
        { content: "Alpha section content.", heading: "Alpha" },
        { content: "Beta section content.", heading: "Beta" },
      ],
      { maxTokens: 100, minTokens: 1, overlapTokens: 10 },
    );

    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.heading)).toEqual(["Alpha", "Beta"]);
  });

  it("merges tiny adjacent units within the same structural boundary", () => {
    const chunks = chunkDocument(
      [
        {
          content: "First note.",
          heading: "Notes",
          metadata: { paragraphFrom: 1 },
        },
        {
          content: "Second note.",
          heading: "Notes",
          metadata: { paragraphFrom: 2 },
        },
      ],
      { maxTokens: 100, minTokens: 30, overlapTokens: 10 },
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("First note.\n\nSecond note.");
    expect(chunks[0].metadata?.sourceUnits).toHaveLength(2);
  });

  it("splits oversized units within budget and overlaps forced windows", () => {
    const content = Array.from(
      { length: 80 },
      (_, index) => `word${index}`,
    ).join(" ");
    const chunks = chunkDocument([{ content, pageFrom: 4, pageTo: 4 }], {
      maxTokens: 30,
      minTokens: 1,
      overlapTokens: 6,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.tokenCount <= 30)).toBe(true);
    expect(chunks.every((chunk) => chunk.metadata?.forcedSplit === true)).toBe(
      true,
    );
    const firstTokens = encode(chunks[0].content);
    const secondTokens = encode(chunks[1].content);
    expect(firstTokens.slice(-6)).toEqual(secondTokens.slice(0, 6));
  });

  it("keeps pages as independent citation boundaries", () => {
    const chunks = chunkDocument(
      [
        { content: "Page one content.", pageFrom: 1, pageTo: 1 },
        { content: "Page two content.", pageFrom: 2, pageTo: 2 },
      ],
      { maxTokens: 100, minTokens: 1, overlapTokens: 10 },
    );

    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.pageFrom)).toEqual([1, 2]);
  });
});
