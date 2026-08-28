import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@/server/documents/parsers/markdown";
import { parsePdfDocument } from "@/server/documents/parsers/pdf";
import { parseTextDocument } from "@/server/documents/parsers/text";

function createTextPdf(text: string): Buffer {
  const escapedText = text.replace(/[()\\]/g, "\\$&");
  const stream = `BT /F1 12 Tf 72 720 Td (${escapedText}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "ascii");
}

describe("document text parsers", () => {
  it("preserves Markdown heading paths", () => {
    const result = parseMarkdownDocument(
      Buffer.from(
        "# Launch plan\n\nOpening paragraph.\n\n## Risks\n\nRisk paragraph.\n\n# Appendix\n\nExtra detail.",
      ),
    );

    expect(result.units.map((unit) => unit.heading)).toEqual([
      "Launch plan",
      "Launch plan › Risks",
      "Appendix",
    ]);
    expect(result.units[1].metadata).toMatchObject({
      headingPath: ["Launch plan", "Risks"],
    });
  });

  it("preserves TXT paragraph positions", () => {
    const result = parseTextDocument(
      Buffer.from("First paragraph.\n\nSecond paragraph."),
    );

    expect(result.units).toHaveLength(2);
    expect(result.units[1].metadata).toEqual({
      paragraphFrom: 2,
      paragraphTo: 2,
    });
  });

  it("extracts text and page metadata from PDFs", async () => {
    const result = await parsePdfDocument(
      createTextPdf("Atlas launches on 14 October."),
    );

    expect(result.pageCount).toBe(1);
    expect(result.units).toHaveLength(1);
    expect(result.units[0]).toMatchObject({
      content: "Atlas launches on 14 October.",
      pageFrom: 1,
      pageTo: 1,
    });
  });
});
