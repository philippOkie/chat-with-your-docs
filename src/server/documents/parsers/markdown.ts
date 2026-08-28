import { AppError } from "@/server/domain/errors";
import type {
  ParsedDocument,
  ParsedDocumentUnit,
} from "@/server/domain/documents";

import { decodeUtf8 } from "./text";

export function parseMarkdownDocument(bytes: Buffer): ParsedDocument {
  const text = decodeUtf8(bytes);
  const lines = text.split("\n");
  const headingPath: string[] = [];
  const units: ParsedDocumentUnit[] = [];
  let paragraphLines: string[] = [];
  let paragraphNumber = 0;

  const flushParagraph = () => {
    const content = paragraphLines.join("\n").trim();
    paragraphLines = [];
    if (!content) return;

    paragraphNumber += 1;
    units.push({
      content,
      heading: headingPath.join(" › ") || undefined,
      metadata: {
        headingPath: [...headingPath],
        paragraphFrom: paragraphNumber,
        paragraphTo: paragraphNumber,
      },
    });
  };

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      headingPath.splice(level - 1);
      headingPath[level - 1] = heading[2].trim();
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
    } else {
      paragraphLines.push(line);
    }
  }
  flushParagraph();

  if (units.length === 0) {
    throw new AppError({
      code: "PARSING_ERROR",
      message: "The Markdown document does not contain readable content.",
    });
  }

  return { units };
}
