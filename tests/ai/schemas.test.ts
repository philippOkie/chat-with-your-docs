import { describe, expect, it } from "vitest";

import { AnswerSchema } from "@/server/ai/schemas";

describe("AnswerSchema", () => {
  it("keeps outside knowledge structurally separate from grounded content", () => {
    const result = AnswerSchema.parse({
      answerability: "partial",
      citedChunkIds: ["chunk-1"],
      generalKnowledgeMarkdown: "Outside context",
      groundedAnswerMarkdown: "Supported claim",
    });

    expect(result.groundedAnswerMarkdown).toBe("Supported claim");
    expect(result.generalKnowledgeMarkdown).toBe("Outside context");
  });

  it("rejects an answer without an explicit answerability classification", () => {
    expect(() =>
      AnswerSchema.parse({
        citedChunkIds: [],
        generalKnowledgeMarkdown: null,
        groundedAnswerMarkdown: null,
      }),
    ).toThrow();
  });
});
