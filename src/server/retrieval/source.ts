import type { PublicSource, RetrievedChunk } from "@/server/domain/chat";

function paragraphLocation(metadata: Record<string, unknown>): string | null {
  const units = Array.isArray(metadata.sourceUnits) ? metadata.sourceUnits : [];
  const paragraphNumbers = units.flatMap((unit) => {
    if (!unit || typeof unit !== "object") return [];
    const record = unit as Record<string, unknown>;
    const from = Number(record.paragraphFrom);
    const to = Number(record.paragraphTo);
    return [from, to].filter(Number.isFinite);
  });
  if (paragraphNumbers.length === 0) return null;

  const from = Math.min(...paragraphNumbers);
  const to = Math.max(...paragraphNumbers);
  return from === to ? `Paragraph ${from}` : `Paragraphs ${from}–${to}`;
}

export function toPublicSource(chunk: RetrievedChunk): PublicSource {
  const location = chunk.pageFrom
    ? chunk.pageFrom === chunk.pageTo || !chunk.pageTo
      ? `Page ${chunk.pageFrom}`
      : `Pages ${chunk.pageFrom}–${chunk.pageTo}`
    : chunk.heading
      ? chunk.heading
      : (paragraphLocation(chunk.metadata) ?? `Chunk ${chunk.ordinal + 1}`);

  return {
    chunkId: chunk.chunkId,
    cosineDistance: chunk.cosineDistance,
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    excerpt: chunk.content,
    heading: chunk.heading,
    location,
    pageFrom: chunk.pageFrom,
    pageTo: chunk.pageTo,
    rank: chunk.rank,
  };
}
