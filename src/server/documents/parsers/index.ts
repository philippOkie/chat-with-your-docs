import type {
  ParsedDocument,
  SupportedDocumentMimeType,
} from "@/server/domain/documents";

import { parseMarkdownDocument } from "./markdown";
import { parsePdfDocument } from "./pdf";
import { parseTextDocument } from "./text";

export async function parseDocument(
  mimeType: SupportedDocumentMimeType,
  fileName: string,
  bytes: Buffer,
): Promise<ParsedDocument> {
  if (mimeType === "application/pdf") return parsePdfDocument(bytes);
  if (/\.md(?:own)?$/i.test(fileName)) return parseMarkdownDocument(bytes);
  return parseTextDocument(bytes);
}
