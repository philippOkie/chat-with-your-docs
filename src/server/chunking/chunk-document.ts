import { countTokens, decode, encode } from "gpt-tokenizer";

import type {
  DocumentChunkDraft,
  ParsedDocumentUnit,
} from "@/server/domain/documents";

export type ChunkingOptions = {
  maxTokens: number;
  minTokens: number;
  overlapTokens: number;
};

type WorkingChunk = Omit<DocumentChunkDraft, "ordinal">;

function boundaryKey(unit: ParsedDocumentUnit): string {
  return JSON.stringify([
    unit.pageFrom ?? null,
    unit.pageTo ?? null,
    unit.heading ?? null,
  ]);
}

function sourceMetadata(unit: ParsedDocumentUnit) {
  return unit.metadata ? [unit.metadata] : [];
}

function makeChunk(
  unit: ParsedDocumentUnit,
  content: string,
  forcedSplit = false,
): WorkingChunk {
  return {
    content,
    heading: unit.heading,
    metadata: {
      forcedSplit,
      sourceUnits: sourceMetadata(unit),
    },
    pageFrom: unit.pageFrom,
    pageTo: unit.pageTo,
    tokenCount: countTokens(content),
  };
}

function splitOversizedUnit(
  unit: ParsedDocumentUnit,
  options: ChunkingOptions,
): WorkingChunk[] {
  const tokens = encode(unit.content);
  const chunks: WorkingChunk[] = [];
  const step = Math.max(1, options.maxTokens - options.overlapTokens);

  for (let start = 0; start < tokens.length; start += step) {
    const window = tokens.slice(start, start + options.maxTokens);
    const content = decode(window);
    if (content.trim()) chunks.push(makeChunk(unit, content, true));
    if (start + options.maxTokens >= tokens.length) break;
  }

  return chunks;
}

function canMerge(left: WorkingChunk, right: WorkingChunk): boolean {
  return boundaryKey(left) === boundaryKey(right);
}

function mergeChunks(left: WorkingChunk, right: WorkingChunk): WorkingChunk {
  const content = `${left.content}\n\n${right.content}`;
  const leftSources = Array.isArray(left.metadata?.sourceUnits)
    ? left.metadata.sourceUnits
    : [];
  const rightSources = Array.isArray(right.metadata?.sourceUnits)
    ? right.metadata.sourceUnits
    : [];

  return {
    ...left,
    content,
    metadata: {
      forcedSplit:
        left.metadata?.forcedSplit === true ||
        right.metadata?.forcedSplit === true,
      sourceUnits: [...leftSources, ...rightSources],
    },
    tokenCount: countTokens(content),
  };
}

export function chunkDocument(
  inputUnits: ParsedDocumentUnit[],
  options: ChunkingOptions,
): DocumentChunkDraft[] {
  if (options.overlapTokens >= options.maxTokens) {
    throw new Error(
      "Chunk overlap must be smaller than the maximum chunk size.",
    );
  }

  const units = inputUnits
    .map((unit) => ({ ...unit, content: unit.content.trim() }))
    .filter((unit) => unit.content.length > 0);
  const chunks: WorkingChunk[] = [];
  let pending: WorkingChunk | undefined;

  const flush = () => {
    if (pending) chunks.push(pending);
    pending = undefined;
  };

  for (const unit of units) {
    const unitTokens = countTokens(unit.content);

    if (unitTokens > options.maxTokens) {
      flush();
      chunks.push(...splitOversizedUnit(unit, options));
      continue;
    }

    const next = makeChunk(unit, unit.content);
    if (!pending) {
      pending = next;
      continue;
    }

    if (canMerge(pending, next)) {
      const merged = mergeChunks(pending, next);
      if (merged.tokenCount <= options.maxTokens) {
        pending = merged;
        continue;
      }
    }

    flush();
    pending = next;
  }
  flush();

  for (let index = chunks.length - 1; index > 0; index -= 1) {
    const current = chunks[index];
    const previous = chunks[index - 1];
    if (current.tokenCount < options.minTokens && canMerge(previous, current)) {
      const merged = mergeChunks(previous, current);
      if (merged.tokenCount <= options.maxTokens) {
        chunks.splice(index - 1, 2, merged);
      }
    }
  }

  return chunks.map((chunk, ordinal) => ({ ...chunk, ordinal }));
}

export function buildEmbeddingInput(
  fileName: string,
  chunk: Pick<DocumentChunkDraft, "content" | "heading" | "pageFrom">,
): string {
  const location = chunk.heading
    ? `Section: ${chunk.heading}`
    : chunk.pageFrom
      ? `Page: ${chunk.pageFrom}`
      : undefined;

  return [`Document: ${fileName}`, location, "Content:", chunk.content]
    .filter(Boolean)
    .join("\n");
}
