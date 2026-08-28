import { z } from "zod";

import { askQuestion } from "@/server/application/ask-question";
import { AppError } from "@/server/domain/errors";
import { getRequestId, routeErrorResponse } from "@/server/http/route-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AskQuestionSchema = z.object({ content: z.string().trim().min(1) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return routeErrorResponse(
      new AppError({
        code: "VALIDATION_ERROR",
        message: "Send the question as valid JSON.",
        statusCode: 400,
      }),
      requestId,
    );
  }

  const result = AskQuestionSchema.safeParse(body);
  if (!result.success) {
    return routeErrorResponse(
      new AppError({
        code: "VALIDATION_ERROR",
        message: "Write a question before sending it.",
        statusCode: 400,
      }),
      requestId,
    );
  }

  const { id } = await params;
  const encoder = new TextEncoder();
  const providerAbort = new AbortController();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: object & { type: string }) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(
            `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          ),
        );
      };

      const finish = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      request.signal.addEventListener(
        "abort",
        () => {
          closed = true;
          providerAbort.abort();
        },
        { once: true },
      );

      void askQuestion({
        chatId: id,
        emit,
        question: result.data.content,
        requestId,
        signal: providerAbort.signal,
      })
        .then(finish)
        .catch((error: unknown) => {
          const appError =
            error instanceof AppError
              ? error
              : new AppError({
                  code: "UNEXPECTED_ERROR",
                  message:
                    "The answer could not be completed. Please retry the question.",
                  retryable: true,
                });
          emit({ ...appError.toSafeResponse(), type: "error" });
          finish();
        });
    },
    cancel() {
      closed = true;
      providerAbort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
      "x-request-id": requestId,
    },
  });
}
