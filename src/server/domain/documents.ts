export const DOCUMENT_STATUSES = [
  "queued",
  "processing",
  "ready",
  "failed",
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const SUPPORTED_DOCUMENT_TYPES = {
  "application/pdf": [".pdf"],
  "text/markdown": [".md", ".markdown"],
  "text/plain": [".txt"],
} as const;

export type SupportedDocumentMimeType = keyof typeof SUPPORTED_DOCUMENT_TYPES;

export function isReadyDocumentStatus(
  status: DocumentStatus,
): status is "ready" {
  return status === "ready";
}
