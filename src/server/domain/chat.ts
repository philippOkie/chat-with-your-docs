export type Answerability = "grounded" | "partial" | "not_found";

export type ConversationMessage = {
  content: string;
  role: "assistant" | "user";
};

export type RetrievedChunk = {
  chunkId: string;
  content: string;
  cosineDistance: number;
  documentId: string;
  documentName: string;
  heading: string | null;
  metadata: Record<string, unknown>;
  ordinal: number;
  pageFrom: number | null;
  pageTo: number | null;
  rank: number;
};

export type PublicSource = {
  chunkId: string;
  cosineDistance: number;
  documentId: string;
  documentName: string;
  excerpt: string;
  heading: string | null;
  location: string;
  pageFrom: number | null;
  pageTo: number | null;
  rank: number;
};

export type QuestionStreamEvent =
  | {
      stage: "rewriting" | "retrieving" | "answering";
      type: "status";
    }
  | { text: string; type: "answer.delta" }
  | { text: string; type: "general.delta" }
  | { sources: PublicSource[]; type: "sources" }
  | {
      inputTokens: number | null;
      latencyMs: number;
      model: string;
      outputTokens: number | null;
      timeToFirstTokenMs: number | null;
      type: "usage";
    }
  | {
      answerability: Answerability;
      messageId: string;
      type: "done";
    };
