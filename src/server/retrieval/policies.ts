import type { RetrievedChunk } from "@/server/domain/chat";

function normalizedWords(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean),
  );
}

function stronglyOverlaps(left: string, right: string): boolean {
  const leftWords = normalizedWords(left);
  const rightWords = normalizedWords(right);
  if (leftWords.size === 0 || rightWords.size === 0) return false;

  let shared = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) shared += 1;
  }

  return shared / Math.min(leftWords.size, rightWords.size) >= 0.9;
}

export function deduplicateRetrievedChunks(
  chunks: RetrievedChunk[],
  limit: number,
): RetrievedChunk[] {
  const selected: RetrievedChunk[] = [];

  for (const chunk of chunks) {
    const duplicate = selected.some(
      (candidate) =>
        candidate.content.trim() === chunk.content.trim() ||
        (candidate.documentId === chunk.documentId &&
          Math.abs(candidate.ordinal - chunk.ordinal) <= 1 &&
          stronglyOverlaps(candidate.content, chunk.content)),
    );
    if (!duplicate) selected.push(chunk);
    if (selected.length === limit) break;
  }

  return selected;
}

export function validateCitedChunkIds(
  citedChunkIds: string[],
  chunks: RetrievedChunk[],
): { invalidIds: string[]; validChunks: RetrievedChunk[] } {
  const available = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
  const invalidIds: string[] = [];
  const validChunks: RetrievedChunk[] = [];
  const seen = new Set<string>();

  for (const id of citedChunkIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const chunk = available.get(id);
    if (chunk) validChunks.push(chunk);
    else invalidIds.push(id);
  }

  return { invalidIds, validChunks };
}
