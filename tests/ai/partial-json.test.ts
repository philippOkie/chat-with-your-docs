import { describe, expect, it } from "vitest";

import { readPartialJsonStringField } from "@/server/ai/partial-json";

describe("readPartialJsonStringField", () => {
  it("returns progressive content from an unfinished JSON string", () => {
    const snapshot = '{"groundedAnswerMarkdown":"First line\\nSecond';
    expect(readPartialJsonStringField(snapshot, "groundedAnswerMarkdown")).toBe(
      "First line\nSecond",
    );
  });

  it("decodes quotes, backslashes, and unicode escapes", () => {
    const snapshot =
      '{"groundedAnswerMarkdown":"A \\"quote\\" and \\\\ path \\u2192"}';
    expect(readPartialJsonStringField(snapshot, "groundedAnswerMarkdown")).toBe(
      'A "quote" and \\ path →',
    );
  });

  it("distinguishes null from a field that has not arrived", () => {
    expect(
      readPartialJsonStringField(
        '{"groundedAnswerMarkdown":null}',
        "groundedAnswerMarkdown",
      ),
    ).toBeNull();
    expect(
      readPartialJsonStringField(
        '{"groundedAnswerMarkdown":null}',
        "generalKnowledgeMarkdown",
      ),
    ).toBeUndefined();
  });
});
