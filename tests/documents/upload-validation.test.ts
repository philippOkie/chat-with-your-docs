import { describe, expect, it } from "vitest";

import { validateDocumentUpload } from "@/server/documents/upload-validation";

const MAX_BYTES = 15 * 1024 * 1024;

describe("validateDocumentUpload", () => {
  it("accepts a PDF only when extension, MIME type, and signature agree", () => {
    const bytes = Buffer.from("%PDF-1.7\nfixture");
    const result = validateDocumentUpload(
      {
        bytes,
        name: "../quarterly-report.pdf",
        sizeBytes: bytes.length,
        type: "application/pdf",
      },
      MAX_BYTES,
    );

    expect(result.name).toBe("quarterly-report.pdf");
    expect(result.mimeType).toBe("application/pdf");
  });

  it("rejects a MIME type that does not match the extension", () => {
    const bytes = Buffer.from("plain text");

    expect(() =>
      validateDocumentUpload(
        {
          bytes,
          name: "notes.pdf",
          sizeBytes: bytes.length,
          type: "text/plain",
        },
        MAX_BYTES,
      ),
    ).toThrow("does not match its extension");
  });

  it("rejects empty and oversized files", () => {
    expect(() =>
      validateDocumentUpload(
        {
          bytes: Buffer.alloc(0),
          name: "empty.txt",
          sizeBytes: 0,
          type: "text/plain",
        },
        MAX_BYTES,
      ),
    ).toThrow("empty");

    const bytes = Buffer.from("too large");
    expect(() =>
      validateDocumentUpload(
        { bytes, name: "large.txt", sizeBytes: 11, type: "text/plain" },
        10,
      ),
    ).toThrow("exceeds");
  });

  it("rejects binary content masquerading as text", () => {
    const bytes = Buffer.from([0, 1, 2, 3]);

    expect(() =>
      validateDocumentUpload(
        {
          bytes,
          name: "binary.txt",
          sizeBytes: bytes.length,
          type: "text/plain",
        },
        MAX_BYTES,
      ),
    ).toThrow("valid UTF-8");
  });
});
