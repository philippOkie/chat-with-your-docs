import { AppError } from "@/server/domain/errors";
import type { ParsedDocument } from "@/server/domain/documents";

export function decodeUtf8(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .replace(/\r\n?/g, "\n")
      .trim();
  } catch (error) {
    throw new AppError({
      cause: error,
      code: "PARSING_ERROR",
      message: "The document is not valid UTF-8 text.",
    });
  }
}

export function parseTextDocument(bytes: Buffer): ParsedDocument {
  const text = decodeUtf8(bytes);
  const paragraphs = text
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim());
  const units = paragraphs.filter(Boolean).map((content, index) => ({
    content,
    metadata: {
      paragraphFrom: index + 1,
      paragraphTo: index + 1,
    },
  }));

  if (units.length === 0) {
    throw new AppError({
      code: "PARSING_ERROR",
      message: "The text document does not contain readable content.",
    });
  }

  return { units };
}
