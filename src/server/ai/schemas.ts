import { z } from "zod";

export const AnswerSchema = z
  .object({
    groundedAnswerMarkdown: z.string().nullable(),
    generalKnowledgeMarkdown: z.string().nullable(),
    answerability: z.enum(["grounded", "partial", "not_found"]),
    citedChunkIds: z.array(z.string()),
  })
  .strict();

export type AnswerOutput = z.infer<typeof AnswerSchema>;
