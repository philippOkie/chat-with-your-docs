import { getChat } from "@/server/application/chats";
import { getRequestId, routeErrorResponse } from "@/server/http/route-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  try {
    const { id } = await params;
    const chat = await getChat(id);
    return Response.json(
      { chat, requestId },
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
