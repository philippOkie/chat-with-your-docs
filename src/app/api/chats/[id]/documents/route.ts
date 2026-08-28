import { z } from "zod";

import { replaceChatDocuments } from "@/server/application/chats";
import { AppError } from "@/server/domain/errors";
import { getRequestId, routeErrorResponse } from "@/server/http/route-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ReplaceDocumentsSchema = z.object({
  documentIds: z.array(z.uuid()).min(1).max(12),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  try {
    const result = ReplaceDocumentsSchema.safeParse(await request.json());
    if (!result.success) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Select at least one valid ready document.",
        statusCode: 400,
      });
    }
    const { id } = await params;
    const chat = await replaceChatDocuments(id, result.data.documentIds);
    return Response.json(
      { chat, requestId },
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
