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

export type ParsedDocumentUnit = {
  content: string;
  heading?: string;
  metadata?: Record<string, unknown>;
  pageFrom?: number;
  pageTo?: number;
};

export type ParsedDocument = {
  pageCount?: number;
  units: ParsedDocumentUnit[];
};

export type DocumentChunkDraft = ParsedDocumentUnit & {
  ordinal: number;
  tokenCount: number;
};

export type IngestDocumentJobData = {
  documentId: string;
  requestId: string;
};

export function isReadyDocumentStatus(
  status: DocumentStatus,
): status is "ready" {
  return status === "ready";
}
