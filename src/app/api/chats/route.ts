import { z } from "zod";

import { createChat, listChats } from "@/server/application/chats";
import { AppError } from "@/server/domain/errors";
import { getRequestId, routeErrorResponse } from "@/server/http/route-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CreateChatSchema = z.object({
  documentIds: z.array(z.uuid()).min(1).max(12),
});

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    const chatList = await listChats();
    return Response.json(
      { chats: chatList, requestId },
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const result = CreateChatSchema.safeParse(await request.json());
    if (!result.success) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Select at least one valid ready document.",
        statusCode: 400,
      });
    }
    const chat = await createChat(result.data.documentIds);
    return Response.json(
      { chat, requestId },
      { headers: { "x-request-id": requestId }, status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
