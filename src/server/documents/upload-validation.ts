import { extname, basename } from "node:path";

import { AppError } from "@/server/domain/errors";
import type { SupportedDocumentMimeType } from "@/server/domain/documents";

const MIME_TYPES_BY_EXTENSION: Record<
  string,
  readonly SupportedDocumentMimeType[]
> = {
  ".markdown": ["text/markdown", "text/plain"],
  ".md": ["text/markdown", "text/plain"],
  ".pdf": ["application/pdf"],
  ".txt": ["text/plain"],
};

export type ValidatedDocumentUpload = {
  bytes: Buffer;
  extension: ".markdown" | ".md" | ".pdf" | ".txt";
  mimeType: SupportedDocumentMimeType;
  name: string;
  sizeBytes: number;
};

type UploadCandidate = {
  bytes: Buffer;
  name: string;
  sizeBytes: number;
  type: string;
};

function validationError(message: string): AppError {
  return new AppError({
    code: "VALIDATION_ERROR",
    message,
    statusCode: 400,
  });
}

function cleanDisplayName(name: string): string {
  const cleaned = basename(name)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  if (!cleaned) throw validationError("The file must have a valid name.");
  return cleaned.slice(0, 255);
}

function validateText(bytes: Buffer): void {
  if (bytes.includes(0)) {
    throw validationError("Text documents must contain valid UTF-8 text.");
  }

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw validationError("Text documents must contain valid UTF-8 text.");
  }
}

export function validateDocumentUpload(
  candidate: UploadCandidate,
  maxUploadBytes: number,
): ValidatedDocumentUpload {
  if (candidate.sizeBytes === 0 || candidate.bytes.length === 0) {
    throw validationError("The selected file is empty.");
  }

  if (
    candidate.sizeBytes > maxUploadBytes ||
    candidate.bytes.length > maxUploadBytes
  ) {
    throw validationError(
      `The selected file exceeds the ${Math.floor(maxUploadBytes / 1024 / 1024)} MB limit.`,
    );
  }

  const name = cleanDisplayName(candidate.name);
  const extension = extname(name).toLowerCase();
  const allowedMimeTypes = MIME_TYPES_BY_EXTENSION[extension];

  if (!allowedMimeTypes) {
    throw validationError("Only PDF, TXT, and Markdown files are supported.");
  }

  if (!allowedMimeTypes.includes(candidate.type as SupportedDocumentMimeType)) {
    throw validationError(
      "The file type does not match its extension. Choose a PDF, TXT, or Markdown file.",
    );
  }

  if (extension === ".pdf") {
    if (candidate.bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw validationError("The selected file is not a valid PDF.");
    }
  } else {
    validateText(candidate.bytes);
  }

  return {
    bytes: candidate.bytes,
    extension: extension as ValidatedDocumentUpload["extension"],
    mimeType: candidate.type as SupportedDocumentMimeType,
    name,
    sizeBytes: candidate.sizeBytes,
  };
}
