import { AppError } from "@/server/domain/errors";
import type {
  ParsedDocument,
  ParsedDocumentUnit,
} from "@/server/domain/documents";

type PdfTextItem = {
  hasEOL?: boolean;
  str: string;
};

export async function parsePdfDocument(bytes: Buffer): Promise<ParsedDocument> {
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = getDocument({
      data: new Uint8Array(bytes),
      stopAtErrors: false,
      useWorkerFetch: false,
    });
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    const units: ParsedDocumentUnit[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      let pageText = "";

      for (const item of textContent.items) {
        if (!("str" in item)) continue;
        const textItem = item as PdfTextItem;
        const value = textItem.str.trim();
        if (!value) continue;

        if (pageText && !pageText.endsWith("\n")) pageText += " ";
        pageText += value;
        if (textItem.hasEOL) pageText += "\n";
      }

      const content = pageText.replace(/[ \t]+\n/g, "\n").trim();
      if (content) {
        units.push({
          content,
          metadata: { page: pageNumber },
          pageFrom: pageNumber,
          pageTo: pageNumber,
        });
      }

      page.cleanup();
    }

    await loadingTask.destroy();

    if (units.length === 0) {
      throw new AppError({
        code: "PARSING_ERROR",
        message:
          "No readable text was found. Scanned or image-only PDFs need OCR, which is not supported yet.",
      });
    }

    return { pageCount, units };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError({
      cause: error,
      code: "PARSING_ERROR",
      message:
        "The PDF could not be read. It may be damaged or password protected.",
    });
  }
}
